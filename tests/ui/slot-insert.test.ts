// @vitest-environment jsdom
//
// Layout contract for the per-slot corner insert buttons (replaces the
// old hover-gap `.slot-insert` rows). Each non-empty row exposes a
// bottom-left `+` that inserts AFTER it; the first row additionally
// exposes a top-left `+` that inserts at index 0. When the instrument
// is at the editor cap (N_SLOTS_EDITABLE = 16) every `+` is disabled.
// When the instrument has no filled slots, a single empty-state row
// surfaces one `+` that opens the picker for the very first slot.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PatchModel } from '../../src/patch/model';
import { emptyPatch, emptySlot, N_SLOTS_EDITABLE } from '../../src/patch/types';
import { renderSlotGrid } from '../../src/ui/slot-grid';

// pickOp() opens a real modal — stub it to resolve immediately so click
// handlers can complete in jsdom without us mocking out the DOM modal.
vi.mock('../../src/ui/op-picker', async () => {
  const actual = await vi.importActual<typeof import('../../src/ui/op-picker')>(
    '../../src/ui/op-picker',
  );
  return { ...actual, pickOp: vi.fn(async () => 1 /* fn=1 (vol) */) };
});

function mountModel(): PatchModel {
  const p = emptyPatch();
  // One filled slot in instrument 0 so renderRow has something to draw.
  p.instruments[0]!.name = 'A';
  p.instruments[0]!.slots.push({ ...emptySlot(), fn: 2, outVar: 1, freqVal: 1000, gainVal: 80 });
  return new PatchModel(p);
}

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
});

describe('slot-grid — corner insert buttons', () => {
  it('the first (and only) row exposes BOTH top-left and bottom-left + buttons', () => {
    const model = mountModel();
    renderSlotGrid(root, model, 0);
    const before = root.querySelector('[data-insert-before]');
    const after  = root.querySelector('[data-insert-after]');
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
  });

  it('only the FIRST row gets a top-left + button — second row only has bottom-left', () => {
    const model = mountModel();
    // Add a second filled slot.
    model.patch.instruments[0]!.slots.push({ ...emptySlot(), fn: 1, outVar: 2, val1: 1 });
    renderSlotGrid(root, model, 0);
    const beforeBtns = root.querySelectorAll('[data-insert-before]');
    const afterBtns  = root.querySelectorAll('[data-insert-after]');
    expect(beforeBtns.length).toBe(1);          // top-left only on row 0
    expect(afterBtns.length).toBe(2);           // bottom-left on every row
  });

  it('clicking the top-left + on row 0 inserts at model index 0', async () => {
    const model = mountModel();
    const spy = vi.spyOn(model, 'insertSlot');
    renderSlotGrid(root, model, 0);
    const before = root.querySelector('[data-insert-before]') as HTMLButtonElement;
    before.click();
    // pickOp() is async — let the microtask drain.
    await new Promise((r) => setTimeout(r, 0));
    expect(spy).toHaveBeenCalledWith(0, 0, expect.any(Object));
  });

  it('clicking the bottom-left + on row 0 inserts at model index 1', async () => {
    const model = mountModel();
    const spy = vi.spyOn(model, 'insertSlot');
    renderSlotGrid(root, model, 0);
    const after = root.querySelector('[data-insert-after]') as HTMLButtonElement;
    after.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(spy).toHaveBeenCalledWith(0, 1, expect.any(Object));
  });

  it('when the instrument has zero filled slots, an empty-state row surfaces one + button', () => {
    const p = emptyPatch();
    const model = new PatchModel(p);
    renderSlotGrid(root, model, 0);
    // Empty-state row must exist and carry a usable + button.
    const placeholder = root.querySelector('[data-empty-insert]');
    expect(placeholder).not.toBeNull();
    // No real slot rows.
    expect(root.querySelectorAll('.slot:not(.empty-placeholder)').length).toBe(0);
  });

  it('the empty-state row carries guide text explaining what the + does', () => {
    const p = emptyPatch();
    const model = new PatchModel(p);
    renderSlotGrid(root, model, 0);
    const hint = root.querySelector('[data-empty-hint]') as HTMLElement | null;
    expect(hint).not.toBeNull();
    expect(hint!.textContent ?? '').toMatch(/initialize|first slot/i);
  });

  it('clicking the empty-state + inserts at index 0', async () => {
    const p = emptyPatch();
    const model = new PatchModel(p);
    const spy = vi.spyOn(model, 'insertSlot');
    renderSlotGrid(root, model, 0);
    const btn = root.querySelector('[data-empty-insert]') as HTMLButtonElement;
    btn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(spy).toHaveBeenCalledWith(0, 0, expect.any(Object));
  });

  it('all + buttons are DISABLED when filled count is at the editor cap', () => {
    const p = emptyPatch();
    for (let i = 0; i < N_SLOTS_EDITABLE; i++) {
      p.instruments[0]!.slots.push({ ...emptySlot(), fn: 2, outVar: 1, freqVal: 1000 + i, gainVal: 80 });
    }
    const model = new PatchModel(p);
    renderSlotGrid(root, model, 0);
    const allInsertBtns = root.querySelectorAll('[data-insert-before], [data-insert-after]');
    expect(allInsertBtns.length).toBeGreaterThan(0);
    for (const el of Array.from(allInsertBtns)) {
      expect((el as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it('the old gap-style .slot-insert rows are no longer rendered', () => {
    const model = mountModel();
    renderSlotGrid(root, model, 0);
    expect(root.querySelector('.slot-insert')).toBeNull();
  });
});
