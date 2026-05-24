// op 14 — ctrl: returns BYTE (val>>9)+64, sign-extended to short by refrender.
//
// Chain: osc_saw → v2 ; ctrl(v2) → v1.

import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { makePatch, runBoth, fp } from './_dsp_helpers';

describe('op ctrl (code 14)', () => {
  it.each([
    { name: 'low-freq sweep', freqVal: 64,    sawGain: 127 },
    { name: 'mid-freq',       freqVal: 1024,  sawGain: 200 },
    { name: 'high-freq',      freqVal: 8192,  sawGain: 100 },
    { name: 'negative',       freqVal: -1024, sawGain: 127 },
    { name: 'saturated',      freqVal: 1024,  sawGain: 255 },
  ])('matches refrender for $name', ({ freqVal, sawGain }) => {
    const saw  = { ...emptySlot(), outVar: 2, fn: 2, freqVal, gainVal: sawGain };
    const ctrl = { ...emptySlot(), outVar: 1, fn: 14, val1: 2 };
    const p = makePatch(256, [saw, ctrl]);
    const { c, js } = runBoth(p);
    expect(fp(js)).toEqual(fp(c));
  });
});
