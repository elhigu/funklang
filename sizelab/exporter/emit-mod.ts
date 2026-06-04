import type { Patch } from '../../src/patch/types';

/** Patch instrument sample-length (and loop, when slot 15 is loop_gen) words
 *  into a copy of `mod`, big-endian u16, mirroring Form1.cs 5646-5666. */
export function patchMod(mod: Uint8Array, patch: Patch): Uint8Array {
  const out = mod.slice();
  const beU16 = (off: number, v: number): void => {
    const w = (v >> 1) & 0xffff;
    out[off] = (w >> 8) & 0xff;
    out[off + 1] = w & 0xff;
  };
  for (let n = 0; n < 31; n++) {
    const ins = patch.instruments[n];
    if (!ins) continue;
    const base = 30 * n;
    beU16(42 + base, Math.max(0, ins.sampleLength | 0));
    if (ins.slots[15]?.fn === 22) {
      beU16(46 + base, Math.max(0, ins.loopOffset | 0));
      beU16(48 + base, Math.max(0, ins.loopLength | 0));
    }
  }
  return out;
}
