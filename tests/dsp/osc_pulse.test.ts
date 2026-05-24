// op 5 — osc_pulse: square / pulse with variable duty cycle.

import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { makePatch, runBoth, fp } from './_dsp_helpers';

describe('op osc_pulse (code 5)', () => {
  it.each([
    { name: 'freq 1024 gain 64 duty 63',  freqVal: 1024, gainVal: 64,  widthVal: 63 },
    { name: 'freq 256 gain 127 duty 32',  freqVal: 256,  gainVal: 127, widthVal: 32 },
    { name: 'freq 8192 gain 200 duty 100',freqVal: 8192, gainVal: 200, widthVal: 100 },
    { name: 'freq -2048 gain 32 duty 0',  freqVal: -2048,gainVal: 32,  widthVal: 0 },
    { name: 'freq 4096 gain 255 duty 255',freqVal: 4096, gainVal: 255, widthVal: 255 },
    { name: 'freq 1024 gain 0 duty 63',   freqVal: 1024, gainVal: 0,   widthVal: 63 },
  ])('matches refrender for $name', ({ freqVal, gainVal, widthVal }) => {
    const slot = {
      ...emptySlot(),
      outVar: 1, fn: 5,
      freqVal, gainVal, widthVal,
    };
    const p = makePatch(512, [slot]);
    const { c, js } = runBoth(p);
    expect(fp(js)).toEqual(fp(c));
  });
});
