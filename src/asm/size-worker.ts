// src/asm/size-worker.ts
//
// Web Worker that assembles m68k asm to a raw .bin and reports its byte count,
// and — when `packed` is set — also Shrinkler-crunches it and reports the packed
// size. Keeps vasm-WASM + Shrinkler-WASM (the slow steps) off the UI thread.
// Driven by size-service.ts: posts { id, asm, packed? }, expects
// { id, ok, size?, packed?, error? } back.
import { assembleM68k } from './vasm';
import { shrinkle } from './shrinkler';

interface Req { id: number; asm: string; packed?: boolean }

self.onmessage = async (e: MessageEvent<Req>): Promise<void> => {
  const { id, asm, packed } = e.data;
  try {
    const r = await assembleM68k(asm, { format: 'bin' });
    if (!r.ok) { self.postMessage({ id, ok: false, error: r.error ?? 'assembly failed' }); return; }
    const size = r.bytes!.length;
    if (!packed) { self.postMessage({ id, ok: true, size }); return; }
    const s = await shrinkle(r.bytes!);
    if (s.ok) self.postMessage({ id, ok: true, size, packed: s.size });
    else self.postMessage({ id, ok: true, size, error: s.error });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err) });
  }
};
