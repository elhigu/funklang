// op 10 — mul: mulsw(v[val1], val2) >> 15.
//
// Chain: osc_saw → v2 ; mul(v2 * literal) → v1.

import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { makePatch, runBoth, fp } from './_dsp_helpers';

describe('op mul (code 10)', () => {
  it.each([
    { name: 'half-scale',   freqVal: 1024, sawGain: 127, val2Value: 16384 },
    { name: 'unit scale',   freqVal: 256,  sawGain: 100, val2Value: 32767 },
    { name: 'negate',       freqVal: 4096, sawGain: 64,  val2Value: -32768 },
    { name: 'low-bit scale',freqVal: 800,  sawGain: 200, val2Value: 1     },
    { name: 'zero',         freqVal: 200,  sawGain: 127, val2Value: 0     },
  ])('matches refrender for $name', ({ freqVal, sawGain, val2Value }) => {
    const saw = { ...emptySlot(), outVar: 2, fn: 2, freqVal, gainVal: sawGain };
    const mul = { ...emptySlot(), outVar: 1, fn: 10, val1: 2, val2Value };
    const p = makePatch(256, [saw, mul]);
    const { c, js } = runBoth(p);
    expect(fp(js)).toEqual(fp(c));
  });
});
