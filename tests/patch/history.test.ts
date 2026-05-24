import { describe, it, expect, beforeEach } from 'vitest';
import { PatchModel } from '../../src/patch/model';
import { HistoryManager } from '../../src/patch/history';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import type { Slot } from '../../src/patch/types';

function fillSlot(model: PatchModel, instrIdx: number, partial: Partial<Slot> = {}): void {
  model.insertSlot(instrIdx, 0, { ...emptySlot(), fn: 2, outVar: 1, ...partial });
}

describe('HistoryManager', () => {
  let model: PatchModel;
  let now: number;
  let history: HistoryManager;

  beforeEach(() => {
    model = new PatchModel(emptyPatch());
    fillSlot(model, 0);
    now = 1000;
    history = new HistoryManager(model, { now: () => now, coalesceWindowMs: 600 });
  });

  it('canUndo / canRedo start false on a quiet model', () => {
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });

  it('basic undo: setSlotParam revertible', () => {
    model.setSlotParam(0, 0, 'freqVal', 4242);
    expect(model.patch.instruments[0]!.slots[0]!.freqVal).toBe(4242);
    expect(history.canUndo()).toBe(true);

    history.undo();
    expect(model.patch.instruments[0]!.slots[0]!.freqVal).toBe(0);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(true);
  });

  it('basic redo: undo then redo restores value', () => {
    model.setSlotParam(0, 0, 'freqVal', 4242);
    history.undo();
    history.redo();
    expect(model.patch.instruments[0]!.slots[0]!.freqVal).toBe(4242);
    expect(history.canRedo()).toBe(false);
  });

  it('coalesces 10 rapid setSlotParam calls on the same field into one entry', () => {
    for (let i = 1; i <= 10; i++) {
      now += 50; // 50ms apart → all inside the 600ms window after the prior event
      model.setSlotParam(0, 0, 'freqVal', i * 100);
    }
    expect(model.patch.instruments[0]!.slots[0]!.freqVal).toBe(1000);
    // One undo should restore back to the pre-drag value (0).
    history.undo();
    expect(model.patch.instruments[0]!.slots[0]!.freqVal).toBe(0);
    expect(history.canUndo()).toBe(false);
  });

  it('does NOT coalesce edits to a different field', () => {
    now += 50;
    model.setSlotParam(0, 0, 'freqVal', 100);
    now += 50;
    model.setSlotParam(0, 0, 'gainVal', 77); // different field → new entry
    expect(history.canUndo()).toBe(true);
    history.undo(); // undo gain
    expect(model.patch.instruments[0]!.slots[0]!.gainVal).toBe(0);
    expect(model.patch.instruments[0]!.slots[0]!.freqVal).toBe(100);
    history.undo(); // undo freq
    expect(model.patch.instruments[0]!.slots[0]!.freqVal).toBe(0);
  });

  it('does NOT coalesce when the gap exceeds the window', () => {
    now += 50;
    model.setSlotParam(0, 0, 'freqVal', 100);
    now += 1000; // far beyond 600ms
    model.setSlotParam(0, 0, 'freqVal', 200);
    history.undo();
    expect(model.patch.instruments[0]!.slots[0]!.freqVal).toBe(100);
    history.undo();
    expect(model.patch.instruments[0]!.slots[0]!.freqVal).toBe(0);
  });

  it('future stack truncates when a new mutation happens after undo', () => {
    now += 50;
    model.setSlotParam(0, 0, 'freqVal', 100);
    now += 1000;
    model.setSlotParam(0, 0, 'freqVal', 200);
    history.undo();
    expect(history.canRedo()).toBe(true);
    // New mutation should discard the redo stack.
    now += 1000;
    model.setSlotParam(0, 0, 'freqVal', 333);
    expect(history.canRedo()).toBe(false);
  });

  it('structure events (insertSlot) always commit, never coalesce with params', () => {
    now += 50;
    model.setSlotParam(0, 0, 'freqVal', 100);
    now += 100;
    model.insertSlot(0, 1, { ...emptySlot(), fn: 3, outVar: 2 });
    expect(model.patch.instruments[0]!.slots.length).toBe(2);
    history.undo(); // undo insert
    expect(model.patch.instruments[0]!.slots.length).toBe(1);
    expect(model.patch.instruments[0]!.slots[0]!.freqVal).toBe(100);
    history.undo(); // undo param
    expect(model.patch.instruments[0]!.slots[0]!.freqVal).toBe(0);
  });

  it('emits a reset event on undo/redo so listeners can rebuild', () => {
    const seen: string[] = [];
    model.events.on((e) => seen.push(e.kind));
    now += 50;
    model.setSlotParam(0, 0, 'freqVal', 100);
    history.undo();
    history.redo();
    // Filter out the param event itself; we want to see two resets.
    expect(seen.filter((k) => k === 'reset').length).toBe(2);
  });
});
