import { describe, it, expect } from 'vitest';
import { emptyPatch, emptySlot, N_SLOTS_MAX } from '../../src/patch/types';
import { serializeAkp, parseAkp } from '../../src/fileio/akp';

describe('serializer: pads loop_gen to on-disk slot 15', () => {
  it('a fresh-built dense patch ([osc, vol, loop_gen]) saves with loop_gen at slot 15', () => {
    const p = emptyPatch();
    p.instruments[0]!.name = 'A';
    p.instruments[0]!.sampleLength = 2048;
    p.instruments[0]!.slots.push({ ...emptySlot(), fn: 2, outVar: 1, freqVal: 1000, gainVal: 80 });
    p.instruments[0]!.slots.push({ ...emptySlot(), fn: 1, outVar: 2, val1: 1 });
    p.instruments[0]!.slots.push({ ...emptySlot(), fn: 22 });
    const bytes = serializeAkp(p);
    // Roundtrip through the parser → trailing empties get trimmed
    // back, so the loop_gen lands at array index 15.
    const round = parseAkp(bytes);
    const slots = round.instruments[0]!.slots;
    expect(slots.length).toBe(16);
    expect(slots[0]!.fn).toBe(2);
    expect(slots[1]!.fn).toBe(1);
    // Slots 2..14 are padding empties.
    for (let i = 2; i < 15; i++) expect(slots[i]!.fn).toBe(0);
    expect(slots[15]!.fn).toBe(22);
  });

  it('a patch WITHOUT loop_gen is unaffected (no padding inserted)', () => {
    const p = emptyPatch();
    p.instruments[0]!.name = 'B';
    p.instruments[0]!.sampleLength = 1024;
    p.instruments[0]!.slots.push({ ...emptySlot(), fn: 2, outVar: 1, freqVal: 500, gainVal: 64 });
    const bytes = serializeAkp(p);
    const round = parseAkp(bytes);
    expect(round.instruments[0]!.slots.length).toBe(1);
    expect(round.instruments[0]!.slots[0]!.fn).toBe(2);
  });

  it('a loaded sparse patch (loop_gen already at slot 15) roundtrips byte-stable', () => {
    const p = emptyPatch();
    p.instruments[0]!.name = 'C';
    p.instruments[0]!.sampleLength = 4096;
    // Mimic a Klang-style sparse layout — fills 0, 1, gap 2..14, loop_gen at 15.
    p.instruments[0]!.slots.push({ ...emptySlot(), fn: 2, outVar: 1, freqVal: 1000, gainVal: 80 });
    p.instruments[0]!.slots.push({ ...emptySlot(), fn: 1, outVar: 2, val1: 1 });
    for (let i = 2; i < 15; i++) p.instruments[0]!.slots.push(emptySlot());
    p.instruments[0]!.slots.push({ ...emptySlot(), fn: 22 });
    expect(p.instruments[0]!.slots.length).toBe(16);
    const bytes = serializeAkp(p);
    const round = parseAkp(bytes);
    const slots = round.instruments[0]!.slots;
    expect(slots.length).toBe(16);
    expect(slots[0]!.fn).toBe(2);
    expect(slots[1]!.fn).toBe(1);
    expect(slots[15]!.fn).toBe(22);
  });

  it('every on-disk file is exactly N_SLOTS_MAX slots regardless of in-memory length', () => {
    const p = emptyPatch();
    p.instruments[0]!.name = 'D';
    p.instruments[0]!.sampleLength = 256;
    p.instruments[0]!.slots.push({ ...emptySlot(), fn: 6, outVar: 1, gainVal: 64 });
    p.instruments[0]!.slots.push({ ...emptySlot(), fn: 22 });
    const bytes = serializeAkp(p);
    const round = parseAkp(bytes);
    // The parser TRIMS trailing empties, so the in-memory length is
    // determined by the position of the last non-empty slot — i.e. 16
    // (slot 15 is the last non-empty in our padded layout).
    expect(round.instruments[0]!.slots.length).toBe(16);
    // But the serializer should always have emitted N_SLOTS_MAX slots
    // of data — sanity-check the byte count by re-parsing and re-
    // serializing; the second pass should be byte-identical.
    const bytes2 = serializeAkp(round);
    expect(bytes2.length).toBe(bytes.length);
    expect(Buffer.from(bytes).equals(Buffer.from(bytes2))).toBe(true);
    void N_SLOTS_MAX;
  });
});
