// src/asm/size-service.ts
//
// Exact .bin size for a patch (and its Shrinkler-packed size). The slow parts —
// vasm-WASM assembly, and optionally Shrinkler crunching — run in a Web Worker so
// the UI thread never blocks; results are memoised by the generated asm (the
// deterministic input) and identical in-flight requests are de-duplicated.
// Patches the asm generator can't handle — e.g. variable `enva`, which the
// original Aklang2Asm also rejects — resolve to `{ ok:false }`; callers show
// "size unavailable" rather than a guess.
//
// In environments without Web Workers (vitest/node) it transparently falls back
// to running on the calling thread, so the cache/dedupe logic is testable.
import type { Patch } from '../patch/types';
import { emitAkGenerate } from './akgen';
import { assembleM68k } from './vasm';
import { shrinkle } from './shrinkler';

export interface SizeResult {
  ok: boolean;
  /** Exact .bin byte count when ok. */
  size?: number;
  /** Reason when !ok (codegen threw, or vasm rejected the asm). */
  error?: string;
}

export interface PackedResult {
  ok: boolean;
  /** Raw (uncompressed) .bin size. */
  raw?: number;
  /** Shrinkler-packed size (data mode), the rough shipped cost. */
  packed?: number;
  error?: string;
}

/** Raw worker reply (id-tagged); `packed` present only for packed requests. */
interface Reply { ok: boolean; size?: number; packed?: number; error?: string }
interface PendingEntry { resolve: (r: Reply) => void; asm: string; packed: boolean }

let worker: Worker | null = null;
let workerBroken = false;
let seq = 0;
const pending = new Map<number, PendingEntry>();
const cache = new Map<string, SizeResult>();
const inflight = new Map<string, Promise<SizeResult>>();
const packedCache = new Map<string, PackedResult>();
const packedInflight = new Map<string, Promise<PackedResult>>();

// Bound the memo caches: editing + per-op/per-phase ablations produce a fresh asm
// key each time, so an unbounded Map would grow for the whole session. Map keeps
// insertion order, so evicting the first key is FIFO eviction.
const CACHE_MAX = 512;
function boundedSet<V>(map: Map<string, V>, key: string, val: V): void {
  map.set(key, val);
  if (map.size > CACHE_MAX) {
    const oldest = map.keys().next().value;
    if (oldest !== undefined) map.delete(oldest);
  }
}

/** Main-thread fallback (no Worker): assemble, and optionally crunch. */
async function runDirect(asm: string, packed: boolean): Promise<Reply> {
  const r = await assembleM68k(asm, { format: 'bin' });
  if (!r.ok) return { ok: false, error: r.error ?? 'assembly failed' };
  const size = r.bytes!.length;
  if (!packed) return { ok: true, size };
  const s = await shrinkle(r.bytes!);
  return s.ok ? { ok: true, size, packed: s.size! } : { ok: true, size, error: s.error ?? 'pack failed' };
}

function getWorker(): Worker | null {
  if (workerBroken || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./size-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent): void => {
      const r = e.data as { id: number } & Reply;
      const entry = pending.get(r.id);
      if (!entry) return;
      pending.delete(r.id);
      entry.resolve(r);
    };
    // If the worker dies, fail over to main-thread for everything in flight, and
    // stop using the worker for future requests.
    worker.onerror = (): void => {
      workerBroken = true;
      worker = null;
      const stranded = Array.from(pending.values());
      pending.clear();
      for (const entry of stranded) void runDirect(entry.asm, entry.packed).then(entry.resolve);
    };
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

function runViaWorker(w: Worker, asm: string, packed: boolean): Promise<Reply> {
  return new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, { resolve, asm, packed });
    w.postMessage({ id, asm, packed });
  });
}

function run(asm: string, packed: boolean): Promise<Reply> {
  const w = getWorker();
  return w ? runViaWorker(w, asm, packed) : runDirect(asm, packed);
}

/** Exact .bin size for `patch`. Memoised + de-duplicated by generated asm. */
export async function exactSize(patch: Patch): Promise<SizeResult> {
  let asm: string;
  try {
    asm = emitAkGenerate(patch);
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'codegen failed' };
  }
  const cached = cache.get(asm);
  if (cached) return cached;
  const running = inflight.get(asm);
  if (running) return running;

  const p = run(asm, false)
    .then((r): SizeResult => (r.ok ? { ok: true, size: r.size! } : { ok: false, error: r.error ?? 'assembly failed' }))
    .then((r) => { boundedSet(cache, asm, r); inflight.delete(asm); return r; })
    .catch((err): SizeResult => { inflight.delete(asm); return { ok: false, error: String(err) }; });
  inflight.set(asm, p);
  return p;
}

/** Exact .bin size + its Shrinkler-packed size. Memoised separately (the packed
 *  pass is slower, so it's only requested for the headline total, not ablations). */
export async function packedSize(patch: Patch): Promise<PackedResult> {
  let asm: string;
  try {
    asm = emitAkGenerate(patch);
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'codegen failed' };
  }
  const cached = packedCache.get(asm);
  if (cached) return cached;
  const running = packedInflight.get(asm);
  if (running) return running;

  const p = run(asm, true)
    .then((r): PackedResult =>
      r.ok && r.packed !== undefined
        ? { ok: true, raw: r.size!, packed: r.packed }
        : { ok: false, error: r.error ?? 'pack failed' })
    .then((r) => { boundedSet(packedCache, asm, r); packedInflight.delete(asm); return r; })
    .catch((err): PackedResult => { packedInflight.delete(asm); return { ok: false, error: String(err) }; });
  packedInflight.set(asm, p);
  return p;
}

/** Synchronous cache peek. Returns the memoised result for `patch` if one
 *  exists, an immediate `{ ok:false }` if codegen can't even produce asm (no
 *  assembly needed), or `undefined` when an assembly would be required. Lets the
 *  UI repaint instantly for unchanged/seen patches and only show a spinner for
 *  genuinely new ones. */
export function peekSize(patch: Patch): SizeResult | undefined {
  let asm: string;
  try {
    asm = emitAkGenerate(patch);
  } catch (e) {
    return { ok: false, error: (e as Error).message || 'codegen failed' };
  }
  return cache.get(asm);
}

/** Test helper: drop all memoised results + in-flight promises. */
export function _clearSizeCache(): void {
  cache.clear();
  inflight.clear();
  packedCache.clear();
  packedInflight.clear();
}
