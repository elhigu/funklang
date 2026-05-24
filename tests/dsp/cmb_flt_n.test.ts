// op 12 — cmb_flt_n: comb filter (delay line with feedback + gain).
//
// Chain: osc_saw → v2 ; cmb_flt_n(v2, delay, feedback, gain) → v1.

import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { makePatch, runBoth, fp } from './_dsp_helpers';

describe('op cmb_flt_n (code 12)', () => {
  it.each([
    { name: 'short delay=64  fb=64  gain=127',
      freqVal: 1024, sawGain: 127, delay: 64,   feedback: 64,  combGain: 127 },
    { name: 'med delay=257   fb=100 gain=127',
      freqVal: 2048, sawGain: 127, delay: 257,  feedback: 100, combGain: 127 },
    { name: 'long delay=1024 fb=32  gain=200',
      freqVal: 512,  sawGain: 100, delay: 1024, feedback: 32,  combGain: 200 },
    { name: 'cap delay=4096 (clamped to 2047)',
      freqVal: 1024, sawGain: 127, delay: 4096, feedback: 64,  combGain: 127 },
    { name: 'high feedback fb=200',
      freqVal: 512,  sawGain: 100, delay: 128,  feedback: 200, combGain: 100 },
  ])('matches refrender for $name', ({ freqVal, sawGain, delay, feedback, combGain }) => {
    const saw = { ...emptySlot(), outVar: 2, fn: 2, freqVal, gainVal: sawGain };
    // freq carries delay (short). val2Value carries feedback (UBYTE).
    const flt = { ...emptySlot(), outVar: 1, fn: 12,
                  val1: 2, freqVal: delay, val2Value: feedback, gainVal: combGain };
    const p = makePatch(2048, [saw, flt]);
    const { c, js } = runBoth(p);
    expect(fp(js)).toEqual(fp(c));
  });
});
