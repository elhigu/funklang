// op 18 — chordgen: reads bytes from another instrument's pre-rendered
// sample buffer at multiple transposed indices to synthesize a chord.
//
// Setup: instrument 0 (source) = simple osc_saw → vol → v1.
//        instrument 1 (test)   = chordgen(src=0, n1, n2, n3, shift) → v1.

import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { makeMultiPatch, runBoth, fp } from './_dsp_helpers';

function srcInstrument() {
  // Source instrument: a saw, sampleLength chosen large enough that
  // chordgen's transposed reads stay in-bounds.
  const saw = { ...emptySlot(), outVar: 1, fn: 2, freqVal: 1024, gainVal: 127 };
  return { sampleLength: 4096, slots: [saw] };
}

describe('op chordgen (code 18)', () => {
  it.each([
    { name: 'single note n1=1 shift=0',
      n1: 1,  n2: 0, n3: 0, shift: 0 },
    { name: 'triad 1+3+5  shift=0',
      n1: 1,  n2: 3, n3: 5, shift: 0 },
    { name: 'octave step n1=12 (special sample<<1)',
      n1: 12, n2: 0, n3: 0, shift: 0 },
    { name: 'high-note path n1=8 n2=10 (uses >>7)',
      n1: 8,  n2: 10, n3: 0, shift: 0 },
    { name: 'with shift=64',
      n1: 1,  n2: 5, n3: 7, shift: 64 },
    { name: 'no notes (just root term)',
      n1: 0,  n2: 0, n3: 0, shift: 0 },
  ])('matches refrender for $name', ({ n1, n2, n3, shift }) => {
    const chord = { ...emptySlot(), outVar: 1, fn: 18,
                    gain: 0,                // source instrument = 0
                    freq: n1,               // n1
                    width: n2,              // n2
                    val1: n3,               // n3
                    val2Value: shift };     // shift (UBYTE)
    const p = makeMultiPatch(
      srcInstrument(),
      { sampleLength: 1024, slots: [chord] },
    );
    const { c, js } = runBoth(p, 1);
    expect(fp(js)).toEqual(fp(c));
  });
});
