// Op 22 — Loop Generator (post-render side-effect).
//
// op22 itself produces no v1 output; it crossfades the tail of the source
// instrument's 8-bit sample bytes with the bytes `loopLength` before
// `loopOffset`. Effect is invisible to a one-instrument render but
// downstream chordgen/clone reads the modified bytes.
//
// We test two things:
//   1. Bit-exactness vs refrender for a multi-instrument patch where
//      instrument 0 has op22 in slot[15] and instrument 1 chordgens from it.
//   2. The post-loop bytes differ from the pre-loop bytes (sanity check
//      that loopgen actually ran).

import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { renderInstrument } from '../../src/dsp/engine';
import { applyLoopGen, shouldRunLoopGen } from '../../src/dsp/ops/loop_gen';
import { makeMultiPatch, runBoth, fp } from './_dsp_helpers';
import { emptyPatch } from '../../src/patch/types';

describe('op loop_gen (code 22)', () => {
  it('shouldRunLoopGen triggers whenever ANY slot has fn === 22', () => {
    // Was previously slot[15]-only to match the Amiga binary verbatim.
    // Loosened so freshly-built dense patches (loop_gen at the last
    // filled index, not necessarily 15) play their loop crossfade in
    // the editor too. The serializer pads loop_gen to on-disk slot 15
    // on save so the Amiga binary remains compatible.
    expect(shouldRunLoopGen([])).toBe(false);
    expect(shouldRunLoopGen(Array.from({ length: 15 }, emptySlot))).toBe(false);
    const slots16 = Array.from({ length: 16 }, emptySlot);
    expect(shouldRunLoopGen(slots16)).toBe(false);
    slots16[15]!.fn = 22;
    expect(shouldRunLoopGen(slots16)).toBe(true);
    // Now loop_gen at slot 0 also triggers — the in-memory render
    // shouldn't care WHERE in the dense array the user put it.
    const dense = [{ ...emptySlot(), fn: 22 }, { ...emptySlot(), fn: 2 }];
    expect(shouldRunLoopGen(dense)).toBe(true);
  });

  it('applyLoopGen crossfades tail with pre-loop region', () => {
    // Construct a recognizable buffer: 0..127 ramp twice (offset=8, length=8
    // means we crossfade bytes [8..15] with bytes [0..7]).
    const N = 16;
    const bytes = new Int8Array(N);
    for (let i = 0; i < N; i++) bytes[i] = (i * 8) & 0xff; // 0,8,16,...
    const before = Array.from(bytes);
    applyLoopGen(bytes, 8, 8);
    const after = Array.from(bytes);
    // Bytes [0..7] should be unchanged (only src1[smp] = bytes[offset+smp] is written).
    expect(after.slice(0, 8)).toEqual(before.slice(0, 8));
    // Bytes [8..15] should differ from the original.
    expect(after.slice(8)).not.toEqual(before.slice(8));
  });

  it('applyLoopGen is a no-op when loopLength is 0', () => {
    const bytes = new Int8Array([1, 2, 3, 4, 5]);
    const copy = new Int8Array(bytes);
    applyLoopGen(bytes, 2, 0);
    expect(Array.from(bytes)).toEqual(Array.from(copy));
  });

  it('does not affect v1 output of the loop-generating instrument itself', () => {
    // op22 only mutates the 8-bit byte buffer AFTER all v1 values are written.
    // So the v1 stream returned by renderInstrument(srcIdx) is identical
    // whether or not slot[15].fn === 22.
    const p1 = emptyPatch();
    p1.instruments[0]!.sampleLength = 256;
    p1.instruments[0]!.loopOffset = 192;
    p1.instruments[0]!.loopLength = 64;
    p1.instruments[0]!.slots = Array.from({ length: 16 }, emptySlot);
    const saw = p1.instruments[0]!.slots[0]!;
    saw.outVar = 1; saw.fn = 2; saw.freqVal = 2048; saw.gainVal = 127;
    // No op22 yet.
    const out1 = renderInstrument(p1, 0).sample;

    // Now add op22 in slot[15].
    p1.instruments[0]!.slots[15]!.fn = 22;
    p1.instruments[0]!.slots[15]!.outVar = 1;  // would be needed to be "active"
    // Re-render
    const out2 = renderInstrument(p1, 0).sample;
    // v1 stream identical.
    expect(Array.from(out2)).toEqual(Array.from(out1));
  });

  it('downstream chordgen reads post-loopgen bytes (matches refrender)', () => {
    // Source instrument: saw with op22 in slot[15] (loop crossfade).
    const saw = { ...emptySlot(), outVar: 1, fn: 2, freqVal: 1024, gainVal: 127 };
    // Slots are sized to 16; slot[15] is op22.
    const srcSlots = Array.from({ length: 16 }, emptySlot);
    srcSlots[0] = saw;
    srcSlots[15] = { ...emptySlot(), outVar: 1, fn: 22 };
    // Make the loop region big enough to be hit by chordgen's transposed reads.
    // sampleLength=4096, loopOffset=2048, loopLength=2048 → bytes [2048..4095]
    // get crossfaded with bytes [0..2047].

    // Chord instrument: chordgen from src=0, n1=1, n2=12.
    const chord = { ...emptySlot(), outVar: 1, fn: 18,
                    gain: 0, freq: 1, width: 12, val1: 0, val2Value: 0 };

    const p = makeMultiPatch(
      { sampleLength: 4096, slots: srcSlots },
      { sampleLength: 2048, slots: [chord] },
    );
    p.instruments[0]!.loopOffset = 2048;
    p.instruments[0]!.loopLength = 2048;

    const { c, js } = runBoth(p, 1);
    // The chord instrument's v1 stream must match between JS and C.
    expect(fp(js)).toEqual(fp(c));

    // And it must differ from the same chord rendered against a source
    // without op22 (so we know loopgen actually changed the bytes that
    // chordgen reads).
    const srcSlotsNoLoop = Array.from({ length: 16 }, emptySlot);
    srcSlotsNoLoop[0] = saw;
    // slot[15] stays empty (fn=0) → no loopgen
    const pNoLoop = makeMultiPatch(
      { sampleLength: 4096, slots: srcSlotsNoLoop },
      { sampleLength: 2048, slots: [chord] },
    );
    pNoLoop.instruments[0]!.loopOffset = 2048;
    pNoLoop.instruments[0]!.loopLength = 2048;
    const { c: cNoLoop, js: jsNoLoop } = runBoth(pNoLoop, 1);
    // Sanity: no-loop variant also matches between C and JS.
    expect(fp(jsNoLoop)).toEqual(fp(cNoLoop));
    // CRUCIAL: with-loop output must differ from no-loop output.
    expect(fp(js)).not.toEqual(fp(jsNoLoop));
  });
});
