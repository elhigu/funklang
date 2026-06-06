// funklang/sizelab/tools/verification-patches.ts
// Shared in-memory builders for the P01-P07 verification patches. Used both by
// the .akp generator (gen-verification-patches.ts) and the byte-exact test, so
// they exercise the exact same patches without parsing the gitignored .akp files.
import { emptyPatch, emptySlot } from '../../src/patch/types';
import type { Patch, Slot } from '../../src/patch/types';

export function ins(p: Patch, k: number, sampleLength: number, slots: Array<Partial<Slot>>, name = `i${k}`) {
  const I = p.instruments[k]!;
  I.name = name; I.sampleLength = sampleLength;
  I.slots = Array.from({ length: 16 }, () => ({ ...emptySlot() }));
  slots.forEach((s, i) => { I.slots[i] = { ...emptySlot(), ...s }; });
}

export function P01(): Patch { const p = emptyPatch(); ins(p, 0, 5000, [{ fn: 2, outVar: 1, freqVal: 1000, gainVal: 64 }]); return p; }

export function P02(): Patch {
  const p = emptyPatch();
  const regular = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,18,19,21];
  regular.forEach((fn, k) => {
    ins(p, k, 6000, [
      { fn: 2, outVar: 1, freqVal: 500, gainVal: 40 },
      { fn, outVar: 1, val1: 1, freqVal: 300, gainVal: 50, widthVal: 20, val2: 0, val2Value: 7 },
    ], `op${fn}`);
  });
  return p;
}

export function P03(): Patch {
  const p = emptyPatch();
  ins(p, 0, 6000, [
    { fn: 2, outVar: 1, freq: 0, freqVal: 700, gain: 0, gainVal: 33 },
    { fn: 2, outVar: 2, freq: 1, freqVal: 700, gain: 1, gainVal: 33 },
    { fn: 5, outVar: 3, width: 2, widthVal: 9, freqVal: 100, gainVal: 12 },
  ], 'modes');
  return p;
}

export function P04(): Patch {
  const p = emptyPatch();
  ins(p, 0, 8000, [
    { fn: 2, outVar: 1, freqVal: 400, gainVal: 60 },
  ], 'loop');
  p.instruments[0]!.slots[15] = { ...emptySlot(), fn: 22 };
  p.instruments[0]!.loopOffset = 0x200; p.instruments[0]!.loopLength = 0x100;
  return p;
}

export function P05(): Patch {
  const p = emptyPatch();
  ins(p, 0, 4000, [{ fn: 20, outVar: 1, gain: 0 }, { fn: 20, outVar: 2, gain: 1 }], 'imports');
  p.importedSamples[0]!.data = Int8Array.from(Array.from({ length: 64 }, (_, i) => (i % 200) - 100));
  p.importedSamples[1]!.data = Int8Array.from(Array.from({ length: 32 }, (_, i) => i - 16));
  return p;
}

export function P06(): Patch {
  const p = emptyPatch();
  ins(p, 0, 5000, [{ fn: 2, outVar: 1, freqVal: 800, gainVal: 50 }], 'src');
  ins(p, 1, 5000, [{ fn: 17, outVar: 1, freqVal: 50, val2Value: 3, gain: 0, gainVal: 0 }], 'clone');
  ins(p, 2, 5000, [{ fn: 18, outVar: 1, gain: 0, freq: 1, width: 2, val1: 3, val2Value: 5 }], 'chord');
  return p;
}

export function P07(): Patch {
  const p = emptyPatch();
  ins(p, 0, 5000, [{ fn: 2, outVar: 1, freqVal: 400, gainVal: 60 }], 'a');
  ins(p, 1, 2, [{ fn: 2, outVar: 1, freqVal: 400, gainVal: 60 }], 'gap');
  ins(p, 2, 5000, [{ fn: 1, outVar: 1, val1: 1, gainVal: 20 }], 'b');
  return p;
}

export const VERIFICATION_PATCHES: Record<string, Patch> = {
  P01: P01(), P02: P02(), P03: P03(), P04: P04(), P05: P05(), P06: P06(), P07: P07(),
};
