// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { PatchModel } from '../../src/patch/model';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import { renderSlotGrid } from '../../src/ui/slot-grid';

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
});

describe('clone offset', () => {
  it('the offset knob max equals source instrument sampleLength - 2', () => {
    const p = emptyPatch();
    p.instruments[0]!.name = 'SRC';
    p.instruments[0]!.sampleLength = 1024;
    p.instruments[0]!.slots.push({ ...emptySlot(), fn: 2, outVar: 1, freqVal: 50, gainVal: 64 });
    p.instruments[1]!.name = 'CLONER';
    p.instruments[1]!.sampleLength = 256;
    // Clone of instrument 0 (gain field = source index).
    p.instruments[1]!.slots.push({ ...emptySlot(), fn: 17, outVar: 1, gain: 0 });
    const model = new PatchModel(p);
    renderSlotGrid(root, model, 1);
    // Find the knob whose .klabel reads 'offset'.
    const knobs = Array.from(root.querySelectorAll('.knob'));
    const offsetKnob = knobs.find((k) => (k.querySelector('.klabel') as HTMLElement | null)?.textContent === 'offset');
    expect(offsetKnob).toBeTruthy();
    const bar = offsetKnob!.querySelector('.kbar') as HTMLElement;
    expect(bar.getAttribute('aria-valuemax')).toBe(String(1024 - 2));
  });

  it('the offset knob step is 2 (even-only)', () => {
    // Set the value to something odd via setValue and verify it snaps to even.
    const p = emptyPatch();
    p.instruments[0]!.name = 'SRC';
    p.instruments[0]!.sampleLength = 1024;
    p.instruments[0]!.slots.push({ ...emptySlot(), fn: 2, outVar: 1 });
    p.instruments[1]!.name = 'CLONER';
    p.instruments[1]!.sampleLength = 256;
    // Start with val2Value = 51 (odd) — should snap on render via knob's
    // step:2 normalization (round-to-nearest-even-multiple via makeKnob's
    // snap(), so 51 → 52).
    p.instruments[1]!.slots.push({ ...emptySlot(), fn: 17, outVar: 1, gain: 0, val2Value: 51 });
    const model = new PatchModel(p);
    renderSlotGrid(root, model, 1);
    const knobs = Array.from(root.querySelectorAll('.knob'));
    const offsetKnob = knobs.find((k) => (k.querySelector('.klabel') as HTMLElement | null)?.textContent === 'offset');
    const bar = offsetKnob!.querySelector('.kbar') as HTMLElement;
    // The knob's internal snap should display an even value (the
    // step-snapping invariant is what matters, not the rounding direction).
    const shown = Number(bar.getAttribute('aria-valuenow'));
    expect(shown % 2).toBe(0);
    expect(Math.abs(shown - 51)).toBeLessThanOrEqual(1);
  });

  it('changing source instrument rescales offset by the SL ratio (preserves fraction)', () => {
    const p = emptyPatch();
    p.instruments[0]!.name = 'SRC0';
    p.instruments[0]!.sampleLength = 1024;
    p.instruments[0]!.slots.push({ ...emptySlot(), fn: 2, outVar: 1 });
    p.instruments[1]!.name = 'SRC1';
    p.instruments[1]!.sampleLength = 2048;
    p.instruments[1]!.slots.push({ ...emptySlot(), fn: 2, outVar: 1 });
    p.instruments[2]!.name = 'CLONER';
    p.instruments[2]!.sampleLength = 256;
    // 512 / 1024 = 0.5 fraction.
    p.instruments[2]!.slots.push({ ...emptySlot(), fn: 17, outVar: 1, gain: 0, val2Value: 512 });
    const model = new PatchModel(p);
    renderSlotGrid(root, model, 2);
    const srcSelect = root.querySelector('.param-ref-select') as HTMLSelectElement;
    expect(srcSelect).not.toBeNull();
    srcSelect.value = '1';
    srcSelect.dispatchEvent(new Event('change', { bubbles: true }));
    // After: source idx = 1, offset = round(512 * 2048 / 1024) = 1024.
    const sl = model.patch.instruments[2]!.slots[0]!;
    expect(sl.gain).toBe(1);
    expect(sl.val2Value).toBe(1024);
  });

  it('rescale snaps to even and clamps to source SL - 2', () => {
    const p = emptyPatch();
    p.instruments[0]!.name = 'SRC0';
    p.instruments[0]!.sampleLength = 1000;     // even
    p.instruments[1]!.name = 'SRC1';
    p.instruments[1]!.sampleLength = 1000;     // even
    p.instruments[2]!.name = 'CLONER';
    p.instruments[2]!.sampleLength = 256;
    // 999 (odd, near max) — even round-down then we'll change source. 999 is
    // ALREADY out of range, so it should clamp to 998 (1000-2). For the
    // rescale: stay on source 0, source 1 has the same SL → rescale should
    // leave val2Value at the snapped value.
    p.instruments[2]!.slots.push({ ...emptySlot(), fn: 17, outVar: 1, gain: 0, val2Value: 999 });
    const model = new PatchModel(p);
    renderSlotGrid(root, model, 2);
    const srcSelect = root.querySelector('.param-ref-select') as HTMLSelectElement;
    srcSelect.value = '1';
    srcSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const sl = model.patch.instruments[2]!.slots[0]!;
    expect(sl.gain).toBe(1);
    // 999 -> rescale by 1.0 -> 999 -> snap to even (998) -> clamp to 998.
    expect(sl.val2Value).toBe(998);
    expect(sl.val2Value % 2).toBe(0);
    expect(sl.val2Value).toBeLessThanOrEqual(998);
  });

  it('rescale is a no-op when old source SL is 0', () => {
    const p = emptyPatch();
    // SRC0 is empty (SL=0).
    p.instruments[0]!.name = 'SRC0';
    p.instruments[1]!.name = 'SRC1';
    p.instruments[1]!.sampleLength = 2048;
    p.instruments[2]!.name = 'CLONER';
    p.instruments[2]!.sampleLength = 256;
    p.instruments[2]!.slots.push({ ...emptySlot(), fn: 17, outVar: 1, gain: 0, val2Value: 400 });
    const model = new PatchModel(p);
    renderSlotGrid(root, model, 2);
    const srcSelect = root.querySelector('.param-ref-select') as HTMLSelectElement;
    srcSelect.value = '1';
    srcSelect.dispatchEvent(new Event('change', { bubbles: true }));
    const sl = model.patch.instruments[2]!.slots[0]!;
    expect(sl.gain).toBe(1);
    // Old SL=0 → guard prevents divide by zero. Offset stays at 400 (which
    // was already even and within [0, 2046]).
    expect(sl.val2Value).toBe(400);
  });
});
