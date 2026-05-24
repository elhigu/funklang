// op 13 — reverb: 8 parallel comb filters (instances 16..23, prime delays).
//
// Chain: osc_saw → v2 ; reverb(v2, feedback, gain) → v1.

import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { makePatch, runBoth, fp } from './_dsp_helpers';

describe('op reverb (code 13)', () => {
  it.each([
    { name: 'fb=64  gain=127',
      freqVal: 1024, sawGain: 100, feedback: 64,  rvbGain: 127 },
    { name: 'fb=100 gain=80',
      freqVal: 2048, sawGain: 80,  feedback: 100, rvbGain: 80  },
    { name: 'fb=32  gain=200',
      freqVal: 512,  sawGain: 64,  feedback: 32,  rvbGain: 200 },
    { name: 'fb=200 high-feedback',
      freqVal: 256,  sawGain: 50,  feedback: 200, rvbGain: 50  },
    { name: 'fb=0   pass-through',
      freqVal: 1024, sawGain: 64,  feedback: 0,   rvbGain: 80  },
  ])('matches refrender for $name', ({ freqVal, sawGain, feedback, rvbGain }) => {
    const saw = { ...emptySlot(), outVar: 2, fn: 2, freqVal, gainVal: sawGain };
    // val2Value carries feedback (UBYTE); val1 references v2.
    const rvb = { ...emptySlot(), outVar: 1, fn: 13,
                  val1: 2, val2Value: feedback, gainVal: rvbGain };
    const p = makePatch(4096, [saw, rvb]);
    const { c, js } = runBoth(p);
    expect(fp(js)).toEqual(fp(c));
  });
});
