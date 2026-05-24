// op 15 — sv_flt_n: state-variable filter; mode 0=lp, 1=hp, 2=bp, 3=hp+bp.
//
// Chain: osc_saw → v2 ; sv_flt_n(v2, cutoff, resonance, mode) → v1.

import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { makePatch, runBoth, fp } from './_dsp_helpers';

describe('op sv_flt_n (code 15)', () => {
  it.each([
    { name: 'lp cutoff=1024 reso=32 mode=0',
      freqVal: 2048, sawGain: 127, cutoff: 1024, reso: 32, mode: 0 },
    { name: 'hp cutoff=4096 reso=64 mode=1',
      freqVal: 1024, sawGain: 200, cutoff: 4096, reso: 64, mode: 1 },
    { name: 'bp cutoff=2048 reso=16 mode=2',
      freqVal: 512,  sawGain: 127, cutoff: 2048, reso: 16, mode: 2 },
    { name: 'notch cutoff=1500 reso=100 mode=3',
      freqVal: 1024, sawGain: 127, cutoff: 1500, reso: 100, mode: 3 },
    { name: 'lp high-reso',
      freqVal: 512,  sawGain: 100, cutoff: 800,  reso: 200, mode: 0 },
  ])('matches refrender for $name', ({ freqVal, sawGain, cutoff, reso, mode }) => {
    const saw = { ...emptySlot(), outVar: 2, fn: 2, freqVal, gainVal: sawGain };
    // freq carries cutoff (short). val2Value carries resonance (UBYTE).
    // gain is RAW mode byte.
    const flt = { ...emptySlot(), outVar: 1, fn: 15,
                  val1: 2, freqVal: cutoff, val2Value: reso, gain: mode & 0xff };
    const p = makePatch(512, [saw, flt]);
    const { c, js } = runBoth(p);
    expect(fp(js)).toEqual(fp(c));
  });
});
