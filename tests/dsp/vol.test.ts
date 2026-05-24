// op 1 — vol: scales an Int16 value by a UBYTE gain (>>7).
// Test plan: feed a constant literal as val1 via val1Value, vary gain.

import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { makePatch, runBoth, fp } from './_dsp_helpers';

describe('op vol (code 1)', () => {
  it.each([
    { name: 'gain 64 of 16384',  val1Value: 16384,  gainVal: 64 },
    { name: 'gain 127 of 12345', val1Value: 12345,  gainVal: 127 },
    { name: 'gain 255 of -1',    val1Value: -1,     gainVal: 255 },
    { name: 'gain 0 of 30000',   val1Value: 30000,  gainVal: 0 },
    { name: 'gain 200 of -32768',val1Value: -32768, gainVal: 200 },
  ])('matches refrender for $name', ({ val1Value, gainVal }) => {
    // Single vol slot writes v1 directly. val1=0 → literal val1Value.
    const slot = { ...emptySlot(), outVar: 1, fn: 1, val1Value, gainVal };
    const p = makePatch(64, [slot]);
    const { c, js } = runBoth(p);
    expect(fp(js)).toEqual(fp(c));
  });
});
