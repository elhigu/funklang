// src/asm/size-worker.ts
//
// Web Worker that assembles m68k asm to a raw .bin and reports its byte count.
// Keeps vasm-WASM (the slow step) off the UI thread. Driven by size-service.ts:
// it posts { id, asm } and expects { id, ok, size?, error? } back.
import { assembleM68k } from './vasm';

interface Req { id: number; asm: string }

self.onmessage = async (e: MessageEvent<Req>): Promise<void> => {
  const { id, asm } = e.data;
  try {
    const r = await assembleM68k(asm, { format: 'bin' });
    if (r.ok) self.postMessage({ id, ok: true, size: r.bytes!.length });
    else self.postMessage({ id, ok: false, error: r.error ?? 'assembly failed' });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err) });
  }
};
