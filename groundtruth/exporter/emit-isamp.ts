import type { Patch } from '../../src/patch/types';

/** Concatenate the 8 imported samples then successive-delta-encode
 *  (Form1.cs delta_encode). Inverse of main-executable.c:510-515. */
export function emitIsamp(patch: Patch): Uint8Array {
  let total = 0;
  for (const s of patch.importedSamples) total += s.data.length;
  const raw = new Uint8Array(total);
  let off = 0;
  for (const s of patch.importedSamples) {
    raw.set(new Uint8Array(s.data.buffer, s.data.byteOffset, s.data.byteLength), off);
    off += s.data.length;
  }
  const out = new Uint8Array(total);
  let prev = 0;
  for (let i = 0; i < total; i++) {
    out[i] = (raw[i]! - prev) & 0xff;
    prev = raw[i]!;
  }
  return out;
}
