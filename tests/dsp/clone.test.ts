// op 17 — clone: reads from a pre-rendered source instrument with
// transpose + offset, optionally walking the buffer in reverse.
//
// Setup: instrument 0 (source) = osc_saw + vol → v1.
//        instrument 1 (test)   = clone(src=0, transpose, offset, reverse) → v1.

import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { makeMultiPatch, runBoth, fp } from './_dsp_helpers';

function srcInstrument() {
  // A saw whose output bytes (8-bit) will be sampled by clone.
  const saw = { ...emptySlot(), outVar: 1, fn: 2, freqVal: 1024, gainVal: 127 };
  return { sampleLength: 4096, slots: [saw] };
}

describe('op clone (code 17)', () => {
  it.each([
    { name: 'forward transpose=0  offset=0',
      transpose: 0,      offset: 0,    reverse: 0 },
    { name: 'forward transpose=+8000 offset=0',
      transpose: 8000,   offset: 0,    reverse: 0 },
    { name: 'forward transpose=-8000 (slow playback) offset=0',
      transpose: -8000,  offset: 0,    reverse: 0 },
    { name: 'forward transpose=0  offset=128',
      transpose: 0,      offset: 128,  reverse: 0 },
    { name: 'reverse transpose=0  offset=0',
      transpose: 0,      offset: 0,    reverse: 1 },
    { name: 'reverse transpose=+4000 offset=64',
      transpose: 4000,   offset: 64,   reverse: 1 },
  ])('matches refrender for $name', ({ transpose, offset, reverse }) => {
    const clone = { ...emptySlot(), outVar: 1, fn: 17,
                    gain: 0,                       // source = instrument 0
                    gainVal: reverse,              // 0 = forward, non-zero = reverse
                    freqVal: transpose,            // signed Int16
                    val2Value: offset };           // uint16 (we use small positive)
    const p = makeMultiPatch(
      srcInstrument(),
      { sampleLength: 1024, slots: [clone] },
    );
    const { c, js } = runBoth(p, 1);
    expect(fp(js)).toEqual(fp(c));
  });
});
