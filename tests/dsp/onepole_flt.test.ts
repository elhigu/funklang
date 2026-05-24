// op 21 — onepole_flt: 1-pole low-pass (mode 0) or high-pass-ish residual (mode 1).
//
// Chain: osc_saw → v2 ; onepole_flt(v2, cutoff, mode) → v1.

import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { makePatch, runBoth, fp } from './_dsp_helpers';

describe('op onepole_flt (code 21)', () => {
  it.each([
    { name: 'lpf cutoff=64  mode=0',  freqVal: 1024, sawGain: 127, cutoff: 64,  mode: 0 },
    { name: 'lpf cutoff=8   mode=0',  freqVal: 2048, sawGain: 200, cutoff: 8,   mode: 0 },
    { name: 'lpf cutoff=127 mode=0',  freqVal: 512,  sawGain: 127, cutoff: 127, mode: 0 },
    { name: 'hpf residual cutoff=32 mode=1', freqVal: 4096, sawGain: 127, cutoff: 32,  mode: 1 },
    { name: 'lpf negative cutoff -8 mode=0', freqVal: 1024, sawGain: 100, cutoff: -8,  mode: 0 },
  ])('matches refrender for $name', ({ freqVal, sawGain, cutoff, mode }) => {
    const saw = { ...emptySlot(), outVar: 2, fn: 2, freqVal, gainVal: sawGain };
    // freq carries cutoff (pick_short → BYTE). gain is the RAW mode byte.
    const flt = { ...emptySlot(), outVar: 1, fn: 21,
                  val1: 2, freqVal: cutoff, gain: mode & 0xff };
    const p = makePatch(512, [saw, flt]);
    const { c, js } = runBoth(p);
    expect(fp(js)).toEqual(fp(c));
  });
});
