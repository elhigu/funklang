// op 4 — osc_sine: parabolic approximation of sine.

import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { makePatch, runBoth, fp } from './_dsp_helpers';

describe('op osc_sine (code 4)', () => {
  it.each([
    { name: 'freq 256 gain 64',  freqVal: 256,  gainVal: 64 },
    { name: 'freq 1 gain 127',   freqVal: 1,    gainVal: 127 },
    { name: 'freq 16384 gain 32',freqVal: 16384,gainVal: 32 },
    { name: 'freq -512 gain 200',freqVal: -512, gainVal: 200 },
    { name: 'freq 4096 gain 255',freqVal: 4096, gainVal: 255 },
  ])('matches refrender for $name', ({ freqVal, gainVal }) => {
    const slot = { ...emptySlot(), outVar: 1, fn: 4, freqVal, gainVal };
    const p = makePatch(512, [slot]);
    const { c, js } = runBoth(p);
    expect(fp(js)).toEqual(fp(c));
  });
});
