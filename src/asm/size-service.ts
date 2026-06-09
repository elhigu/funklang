// src/asm/size-service.ts
//
// Exact .bin size for a patch. The slow part (vasm-WASM assembly) runs in a Web
// Worker so the UI thread never blocks; results are memoised by the generated
// asm (the deterministic input to vasm) and identical in-flight requests are
// de-duplicated. Patches the asm generator can't handle — e.g. variable `enva`,
// which the original Aklang2Asm also rejects — resolve to `{ ok:false }`; callers
// show "size unavailable" rather than a guess.
//
// In environments without Web Workers (vitest/node) it transparently falls back
// to assembling on the calling thread, so the cache/dedupe logic is testable.
import type { Patch } from '../patch/types';
import { emitAkGenerate } from './akgen';
import { assembleM68k } from './vasm';

export interface SizeResult {
  ok: boolean;
  /** Exact .bin byte count when ok. */
  size?: number;
  /** Reason when !ok (codegen threw, or vasm rejected the asm). */
  error?: string;
}

interface PendingEntry {
  resolve: (r: SizeResult) => void;
  asm: string;
}

let worker: Worker | null = null;
let workerBroken = false;
let seq = 0;
const pending = new Map<number, PendingEntry>();
const cache = new Map<string, SizeResult>();
const inflight = new Map<string, Promise<SizeResult>>();

async function assembleDirect(asm: string): Promise<SizeResult> {
  const r = await assembleM68k(asm, { format: 'bin' });
  return r.ok
    ? { ok: true, size: r.bytes!.length }
    : { ok: false, error: r.error ?? 'assembly failed' };
}

function getWorker(): Worker | null {
  if (workerBroken || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./size-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent): void => {
      const { id, ok, size, error } = e.data as { id: number } & SizeResult;
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      entry.resolve(ok ? { ok: true, size: size! } : { ok: false, error: error ?? 'assembly failed' });
    };
    // If the worker dies, fail over to main-thread assembly for everything that
    // was in flight, and stop using the worker for future requests.
    worker.onerror = (): void => {
      workerBroken = true;
      worker = null;
      const stranded = Array.from(pending.values());
      pending.clear();
      for (const entry of stranded) void assembleDirect(entry.asm).then(entry.resolve);
    };
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

function assembleViaWorker(w: Worker, asm: string): Promise<SizeResult> {
  return new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, { resolve, asm });
    w.postMessage({ id, asm });
  });
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

  const w = getWorker();
  const p = (w ? assembleViaWorker(w, asm) : assembleDirect(asm))
    .then((r) => {
      cache.set(asm, r);
      inflight.delete(asm);
      return r;
    })
    .catch((err): SizeResult => {
      inflight.delete(asm);
      return { ok: false, error: String(err) };
    });
  inflight.set(asm, p);
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
}
