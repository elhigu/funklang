// op 11 — dly_cyc: cyclic delay line (write vol(val,gain), read one later).
//
// Chain: osc_saw → v2 ; dly_cyc(v2, delay, gain) → v1.

import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { makePatch, runBoth, fp } from './_dsp_helpers';

describe('op dly_cyc (code 11)', () => {
  it.each([
    { name: 'short delay=64   gain=127',
      freqVal: 1024, sawGain: 127, delay: 64,   dlyGain: 127 },
    { name: 'med   delay=257  gain=100',
      freqVal: 2048, sawGain: 127, delay: 257,  dlyGain: 100 },
    { name: 'long  delay=1024 gain=64',
      freqVal: 512,  sawGain: 100, delay: 1024, dlyGain: 64  },
    { name: 'cap   delay=4096 (clamped to 2047)',
      freqVal: 1024, sawGain: 127, delay: 4096, dlyGain: 127 },
    { name: 'degenerate delay=1 (no real delay)',
      freqVal: 512,  sawGain: 127, delay: 1,    dlyGain: 200 },
  ])('matches refrender for $name', ({ freqVal, sawGain, delay, dlyGain }) => {
    const saw = { ...emptySlot(), outVar: 2, fn: 2, freqVal, gainVal: sawGain };
    // freq carries delay; val1 references v2 (saw output).
    const dly = { ...emptySlot(), outVar: 1, fn: 11,
                  val1: 2, freqVal: delay, gainVal: dlyGain };
    const p = makePatch(2048, [saw, dly]);
    const { c, js } = runBoth(p);
    expect(fp(js)).toEqual(fp(c));
  });
});
