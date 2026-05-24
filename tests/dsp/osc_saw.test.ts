// op 2 — osc_saw: phase accumulator → vol.

import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { makePatch, runBoth, fp } from './_dsp_helpers';

describe('op osc_saw (code 2)', () => {
  it.each([
    { name: 'freq 1024 gain 64',  freqVal: 1024, gainVal: 64 },
    { name: 'freq 1 gain 127',    freqVal: 1,    gainVal: 127 },
    { name: 'freq 32767 gain 32', freqVal: 32767,gainVal: 32 },
    { name: 'freq -1024 gain 200',freqVal: -1024,gainVal: 200 },
    { name: 'freq 8192 gain 255', freqVal: 8192, gainVal: 255 },
  ])('matches refrender for $name', ({ freqVal, gainVal }) => {
    // outVar=1 → write to v1. freq=0 → freqVal literal. gain=0 → gainVal literal.
    const slot = { ...emptySlot(), outVar: 1, fn: 2, freqVal, gainVal };
    const p = makePatch(512, [slot]);
    const { c, js } = runBoth(p);
    expect(fp(js)).toEqual(fp(c));
  });
});
