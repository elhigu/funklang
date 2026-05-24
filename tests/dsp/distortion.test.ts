// op 16 — distortion: waveshape + soft-clip.
//
// Chain: osc_saw → v2 ; distortion(v2, gain) → v1.

import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { makePatch, runBoth, fp } from './_dsp_helpers';

describe('op distortion (code 16)', () => {
  it.each([
    { name: 'soft gain 64',   freqVal: 1024, sawGain: 127, distGain: 64 },
    { name: 'hard gain 200',  freqVal: 256,  sawGain: 127, distGain: 200 },
    { name: 'max gain 255',   freqVal: 800,  sawGain: 127, distGain: 255 },
    { name: 'low signal',     freqVal: 4096, sawGain: 16,  distGain: 100 },
    { name: 'gain 0',         freqVal: 1024, sawGain: 127, distGain: 0 },
    { name: 'gain 32',        freqVal: 2048, sawGain: 200, distGain: 32 },
  ])('matches refrender for $name', ({ freqVal, sawGain, distGain }) => {
    const saw  = { ...emptySlot(), outVar: 2, fn: 2, freqVal, gainVal: sawGain };
    const dist = { ...emptySlot(), outVar: 1, fn: 16, val1: 2, gainVal: distGain };
    const p = makePatch(256, [saw, dist]);
    const { c, js } = runBoth(p);
    expect(fp(js)).toEqual(fp(c));
  });
});
