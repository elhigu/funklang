// op 9 — add: clamp(v[val1] + val2).
//
// Chain: osc_saw → v2 ; add(v2 + literal) → v1.

import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { makePatch, runBoth, fp } from './_dsp_helpers';

describe('op add (code 9)', () => {
  it.each([
    { name: 'small offset',         freqVal: 1024,  sawGain: 127, val2Value: 1000  },
    { name: 'negative offset',      freqVal: 512,   sawGain: 64,  val2Value: -8000 },
    { name: 'huge offset (clamp+)', freqVal: 256,   sawGain: 127, val2Value: 30000 },
    { name: 'huge offset (clamp-)', freqVal: 4096,  sawGain: 127, val2Value: -30000},
    { name: 'zero offset',          freqVal: 800,   sawGain: 100, val2Value: 0     },
  ])('matches refrender for $name', ({ freqVal, sawGain, val2Value }) => {
    // Slot 0: osc_saw → v2 (audio source).
    const saw   = { ...emptySlot(), outVar: 2, fn: 2, freqVal, gainVal: sawGain };
    // Slot 1: add(v2, val2Value) → v1. val1=2 → read v2; val2=0 → literal val2Value.
    const add   = { ...emptySlot(), outVar: 1, fn: 9, val1: 2, val2Value };
    const p = makePatch(256, [saw, add]);
    const { c, js } = runBoth(p);
    expect(fp(js)).toEqual(fp(c));
  });
});
