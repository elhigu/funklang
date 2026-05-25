import { describe, it, expect } from 'vitest';
import { PatchModel } from '../../src/patch/model';
import type { PatchChange } from '../../src/patch/events';
import { emptyPatch, emptySlot, N_SLOTS_MAX } from '../../src/patch/types';
import type { Slot } from '../../src/patch/types';

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
});
