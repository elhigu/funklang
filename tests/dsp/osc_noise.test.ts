// op 6 — osc_noise: simple xorshift-style LFSR with process-global state.

import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { makePatch, runBoth, fp } from './_dsp_helpers';

describe('op osc_noise (code 6)', () => {
  it.each([
    { name: 'gain 64',  gainVal: 64 },
    { name: 'gain 127', gainVal: 127 },
    { name: 'gain 255', gainVal: 255 },
    { name: 'gain 1',   gainVal: 1 },
    { name: 'gain 200', gainVal: 200 },
  ])('matches refrender for $name', ({ gainVal }) => {
    // freq/val1/val2 unused; only gain. outVar=1 → v1.
    const slot = { ...emptySlot(), outVar: 1, fn: 6, gainVal };
    const p = makePatch(1024, [slot]);
    const { c, js } = runBoth(p);
    expect(fp(js)).toEqual(fp(c));
  });
});
