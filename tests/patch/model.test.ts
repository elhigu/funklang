import { describe, it, expect } from 'vitest';
import { PatchModel, adjustIndexForMove } from '../../src/patch/model';
import type { PatchChange } from '../../src/patch/events';
import { emptyPatch, emptySlot, N_SLOTS_MAX } from '../../src/patch/types';
import type { Slot } from '../../src/patch/types';

describe('adjustIndexForMove', () => {
  // Mirrors PatchModel.moveInstrument's splice: where does an index that
  // pointed at OLD position `idx` land after moving `from` → `to`?
  it('the moved index itself maps to the destination', () => {
    expect(adjustIndexForMove(2, 2, 5)).toBe(5);
    expect(adjustIndexForMove(5, 5, 1)).toBe(1);
  });

  it('moving DOWN (from < to): indices in (from, to] shift left by one', () => {
    // move 1 → 4: old 2,3,4 each shift to 1,2,3; 0 and 5 unchanged.
    expect(adjustIndexForMove(0, 1, 4)).toBe(0);
    expect(adjustIndexForMove(2, 1, 4)).toBe(1);
    expect(adjustIndexForMove(3, 1, 4)).toBe(2);
    expect(adjustIndexForMove(4, 1, 4)).toBe(3);
    expect(adjustIndexForMove(5, 1, 4)).toBe(5);
  });

  it('moving UP (to < from): indices in [to, from) shift right by one', () => {
    // move 4 → 1: old 1,2,3 each shift to 2,3,4; 0 and 5 unchanged.
    expect(adjustIndexForMove(0, 4, 1)).toBe(0);
    expect(adjustIndexForMove(1, 4, 1)).toBe(2);
    expect(adjustIndexForMove(2, 4, 1)).toBe(3);
    expect(adjustIndexForMove(3, 4, 1)).toBe(4);
    expect(adjustIndexForMove(5, 4, 1)).toBe(5);
  });

  it('from === to is a no-op for every index', () => {
    for (let i = 0; i < 6; i++) expect(adjustIndexForMove(i, 3, 3)).toBe(i);
  });

  it('agrees with the actual array splice for a sampling of moves', () => {
    const moves: Array<[number, number]> = [[0, 3], [3, 0], [2, 4], [4, 2], [1, 5], [5, 1]];
    for (const [from, to] of moves) {
      const arr = [0, 1, 2, 3, 4, 5, 6];
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved!);
      for (let oldIdx = 0; oldIdx < 7; oldIdx++) {
        const predicted = adjustIndexForMove(oldIdx, from, to);
        const actual = arr.indexOf(oldIdx);   // where old value oldIdx now sits
        expect(predicted, `move ${from}->${to}, oldIdx ${oldIdx}`).toBe(actual);
      }
    }
  });
});

function makeSlot(tag: number): Slot {
  return { ...emptySlot(), outVar: tag };
}

function recorder(model: PatchModel): PatchChange[] {
  const events: PatchChange[] = [];
  model.events.on((e) => events.push(e));
  return events;
}

describe('PatchModel', () => {
  it('setSlotParam emits {kind:"param"} and mutates the field', () => {
    const model = new PatchModel(emptyPatch());
    model.insertSlot(3, 0, makeSlot(0));
    const events = recorder(model);

    model.setSlotParam(3, 0, 'freq', 42);

    const slot = model.patch.instruments[3]!.slots[0]!;
    expect(slot.freq).toBe(42);
    expect(events).toEqual([{
      instrIdx: 3,
      kind: 'param',
      coalesceKey: { instrIdx: 3, slotIdx: 0, field: 'freq' },
    }]);
  });

  it('setSlotParam("fn", ...) emits {kind:"structure"} so the row UI rebuilds', () => {
    // Changing the op-type means the slot's param schema is now different
    // (new knobs, new labels). The UI listens to 'structure' to rebuild
    // the row, so the model must emit structure for fn — not param.
    const model = new PatchModel(emptyPatch());
    model.insertSlot(0, 0, makeSlot(1));   // start with fn=1 (vol)
    const events = recorder(model);

    model.setSlotParam(0, 0, 'fn', 4);     // change to fn=4 (osc_sine)

    expect(model.patch.instruments[0]!.slots[0]!.fn).toBe(4);
    expect(events).toEqual([{ instrIdx: 0, kind: 'structure' }]);
  });

  it('moveSlot reorders the slots array and emits {kind:"structure"}', () => {
    const model = new PatchModel(emptyPatch());
    model.insertSlot(0, 0, makeSlot(1)); // a
    model.insertSlot(0, 1, makeSlot(2)); // b
    model.insertSlot(0, 2, makeSlot(3)); // c
    const events = recorder(model);

    // remove from 0, then insert at 2 in post-removal array → [b, c, a]
    model.moveSlot(0, 0, 2);

    expect(model.patch.instruments[0]!.slots.map((s) => s.outVar)).toEqual([2, 3, 1]);
    expect(events).toEqual([{ instrIdx: 0, kind: 'structure' }]);
  });

  it('insertSlot beyond N_SLOTS_MAX throws RangeError', () => {
    const model = new PatchModel(emptyPatch());
    for (let i = 0; i < N_SLOTS_MAX; i++) model.insertSlot(0, i, makeSlot(i));
    expect(() => model.insertSlot(0, N_SLOTS_MAX, makeSlot(99))).toThrow(RangeError);
  });

  it('setInstrumentField emits {kind:"meta"}', () => {
    const model = new PatchModel(emptyPatch());
    const events = recorder(model);

    model.setInstrumentField(5, 'name', 'kick');

    expect(model.patch.instruments[5]!.name).toBe('kick');
    expect(events).toEqual([{
      instrIdx: 5,
      kind: 'meta',
      coalesceKey: { instrIdx: 5, slotIdx: -1, field: 'name' },
    }]);
  });

  describe('setInstrumentField sampleLength — loopOffset auto-rescale', () => {
    it('halving sampleLength halves loopOffset (same fractional position)', () => {
      const model = new PatchModel(emptyPatch());
      model.setInstrumentField(0, 'sampleLength', 12288);
      // Bump loopOffset to the user-stated test value of 0x1CFE = 7422 →
      // snaps even = 7422, well inside [6144, 12286].
      model.setInstrumentField(0, 'loopOffset', 7422);
      // Now shrink sample length to 6144 — old fraction was 7422/12288 ≈ 0.604.
      model.setInstrumentField(0, 'sampleLength', 6144);
      const ins = model.patch.instruments[0]!;
      // Linear rescale → 7422 * (6144/12288) = 3711 → after even-snap = 3710,
      // then clampLoopOffset([min=3072, max=6142]) leaves it alone.
      expect(ins.loopOffset).toBe(3710);
      expect(ins.loopLength).toBe(ins.sampleLength - ins.loopOffset);
    });

    it('doubling sampleLength doubles loopOffset', () => {
      const model = new PatchModel(emptyPatch());
      model.setInstrumentField(0, 'sampleLength', 4096);
      model.setInstrumentField(0, 'loopOffset', 3072);   // 0.75 of SL
      model.setInstrumentField(0, 'sampleLength', 8192);
      const ins = model.patch.instruments[0]!;
      // 3072 * 2 = 6144 → already even, inside [4096, 8190].
      expect(ins.loopOffset).toBe(6144);
    });

    it('setting sampleLength to an unchanged value is a no-op for loopOffset', () => {
      const model = new PatchModel(emptyPatch());
      model.setInstrumentField(0, 'sampleLength', 4096);
      model.setInstrumentField(0, 'loopOffset', 2048);
      model.setInstrumentField(0, 'sampleLength', 4096);
      expect(model.patch.instruments[0]!.loopOffset).toBe(2048);
    });

    it('growing from sampleLength 0 does NOT divide by zero — clamp still applies', () => {
      const model = new PatchModel(emptyPatch());
      model.setInstrumentField(0, 'sampleLength', 4096);
      // oldSL=0 short-circuits the rescaling guard; the legal-range
      // clamp then snaps loopOffset (was 0) up to minLoopOffset(4096) = 2048.
      expect(model.patch.instruments[0]!.loopOffset).toBe(2048);
    });
  });

  describe('moveInstrument — drag-and-drop reorder', () => {
    it('permutes the array (move 3 → 0 pushes 0..2 down by one)', () => {
      const model = new PatchModel(emptyPatch());
      for (let i = 0; i < 5; i++) {
        model.setInstrumentField(i, 'name', String.fromCharCode(65 + i));
      }
      model.moveInstrument(3, 0);
      expect(model.patch.instruments.slice(0, 5).map((i) => i.name)).toEqual(['D', 'A', 'B', 'C', 'E']);
    });

    it('rewrites clone source indices to follow the moved instrument', () => {
      const model = new PatchModel(emptyPatch());
      // Instr 0 = saw, instr 2 = clone-of-0.
      model.insertSlot(0, 0, { ...emptySlot(), fn: 2, outVar: 1 });
      model.insertSlot(2, 0, { ...emptySlot(), fn: 17, outVar: 1, gain: 0 });
      // Move instr 0 → 1. After: original instr 1 sits at 0, saw at 1,
      // instr 2 untouched. Clone at instr 2 (still at index 2) should now
      // point at the saw's new home — index 1.
      model.moveInstrument(0, 1);
      const cloneSlot = model.patch.instruments[2]!.slots[0]!;
      expect(cloneSlot.gain).toBe(1);
    });

    it('resets clone source to 0 when reorder breaks Klang ordering (src >= owner)', () => {
      const model = new PatchModel(emptyPatch());
      // Instr 0 = saw, instr 1 = clone-of-0.
      model.insertSlot(0, 0, { ...emptySlot(), fn: 2, outVar: 1 });
      model.insertSlot(1, 0, { ...emptySlot(), fn: 17, outVar: 1, gain: 0 });
      // Move instr 1 → 0 (puts clone BEFORE the saw). The remap puts the
      // clone at index 0 and the saw at index 1. Clone's old src=0 (the saw)
      // gets remapped to index 1, but 1 >= 0 (clone's own new index) violates
      // the ordering rule. Per spec: fall back to 0.
      model.moveInstrument(1, 0);
      const cloneSlot = model.patch.instruments[0]!.slots[0]!;
      expect(cloneSlot.gain).toBe(0);
    });

    it('handles chordgen (fn=18) the same way as clone (fn=17)', () => {
      const model = new PatchModel(emptyPatch());
      model.insertSlot(0, 0, { ...emptySlot(), fn: 2, outVar: 1 });
      model.insertSlot(3, 0, { ...emptySlot(), fn: 18, outVar: 1, gain: 0 });
      model.moveInstrument(0, 2);  // saw 0 → 2
      // Chordgen at instr 3 now points at saw's new home (index 2).
      const chord = model.patch.instruments[3]!.slots[0]!;
      expect(chord.gain).toBe(2);
    });

    it('emits exactly one structure event for the whole reorder', () => {
      const model = new PatchModel(emptyPatch());
      model.insertSlot(0, 0, { ...emptySlot(), fn: 2, outVar: 1 });
      const events = recorder(model);
      model.moveInstrument(0, 3);
      expect(events.filter((e) => e.kind === 'structure').length).toBe(1);
    });

    it('is a no-op when from === to', () => {
      const model = new PatchModel(emptyPatch());
      model.setInstrumentField(0, 'name', 'X');
      const events = recorder(model);
      model.moveInstrument(2, 2);
      expect(events.length).toBe(0);
    });

    it('out-of-range from / to is a silent no-op', () => {
      const model = new PatchModel(emptyPatch());
      const events = recorder(model);
      model.moveInstrument(-1, 0);
      model.moveInstrument(0, 999);
      model.moveInstrument(999, 0);
      expect(events.length).toBe(0);
    });
  });
});
