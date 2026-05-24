// op 19 — sh: sample-and-hold; latches input every (step*step)/4 ticks.
//
// Chain: osc_saw → v2 (source signal) ; sh(v2, step) → v1.

import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { makePatch, runBoth, fp } from './_dsp_helpers';

describe('op sh (code 19)', () => {
  it.each([
    { name: 'fast latch step=8',   freqVal: 1024, sawGain: 127, step: 8 },
    { name: 'medium latch step=32',freqVal: 2048, sawGain: 100, step: 32 },
    { name: 'slow latch step=128', freqVal: 512,  sawGain: 200, step: 128 },
    { name: 'step=0 (always)',     freqVal: 4096, sawGain: 127, step: 0 },
    { name: 'step=255',            freqVal: 256,  sawGain: 127, step: 255 },
  ])('matches refrender for $name', ({ freqVal, sawGain, step }) => {
    const saw = { ...emptySlot(), outVar: 2, fn: 2, freqVal, gainVal: sawGain };
    // sh: val1=2 → read v2; gain=0 → gainVal literal acts as step.
    const sh  = { ...emptySlot(), outVar: 1, fn: 19, val1: 2, gainVal: step };
    const p = makePatch(512, [saw, sh]);
    const { c, js } = runBoth(p);
    expect(fp(js)).toEqual(fp(c));
  });
});
