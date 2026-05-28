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

function mountMul(val2Value = 0): PatchModel {
  const p = emptyPatch();
  p.instruments[0]!.name = 'A';
  p.instruments[0]!.sampleLength = 256;
  // val1 = 1 (v1) so the slot is internally valid; val2 selector = 0 (const).
  p.instruments[0]!.slots.push({ ...emptySlot(), fn: 10, outVar: 1, val1: 1, val2: 0, val2Value });
  return new PatchModel(p);
}

describe('mul — fractional sidecar input', () => {
  it('renders a .param-mul-frac input next to the integer knob', () => {
    const model = mountMul(16384);
    renderSlotGrid(root, model, 0);
    const frac = root.querySelector('.param-mul-frac') as HTMLInputElement;
    expect(frac).not.toBeNull();
    // 16384 / 32767 ≈ 0.5000.
    expect(parseFloat(frac.value)).toBeCloseTo(0.5, 3);
  });

  it('typing a float and pressing Enter writes the rounded int into val2Value', () => {
    const model = mountMul(0);
    renderSlotGrid(root, model, 0);
    const frac = root.querySelector('.param-mul-frac') as HTMLInputElement;
    frac.value = '-0.25';
    frac.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(model.patch.instruments[0]!.slots[0]!.val2Value).toBe(Math.round(-0.25 * 32767));
  });

  it('blur commits the float value (Enter not required)', () => {
    const model = mountMul(0);
    renderSlotGrid(root, model, 0);
    const frac = root.querySelector('.param-mul-frac') as HTMLInputElement;
    frac.value = '0.5';
    frac.dispatchEvent(new Event('blur', { bubbles: true }));
    expect(model.patch.instruments[0]!.slots[0]!.val2Value).toBe(Math.round(0.5 * 32767));
  });

  it('Escape reverts the input without writing', () => {
    const model = mountMul(8192);
    renderSlotGrid(root, model, 0);
    const frac = root.querySelector('.param-mul-frac') as HTMLInputElement;
    frac.value = '0.99';
    frac.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    // val2Value unchanged at 8192.
    expect(model.patch.instruments[0]!.slots[0]!.val2Value).toBe(8192);
    // The input reverted to the original 8192/32767.
    expect(parseFloat(frac.value)).toBeCloseTo(8192 / 32767, 3);
  });

  it('clamps to [-1, 1] when the user types out of range', () => {
    const model = mountMul(0);
    renderSlotGrid(root, model, 0);
    const frac = root.querySelector('.param-mul-frac') as HTMLInputElement;
    frac.value = '5';
    frac.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(model.patch.instruments[0]!.slots[0]!.val2Value).toBe(32767);
    // Input reflects the clamped value.
    expect(parseFloat(frac.value)).toBeCloseTo(1, 3);
  });

  it('the sidecar is present ONLY on mul (fn=10), not on add (fn=9)', () => {
    const p = emptyPatch();
    p.instruments[0]!.name = 'A';
    p.instruments[0]!.sampleLength = 256;
    p.instruments[0]!.slots.push({ ...emptySlot(), fn: 9, outVar: 1, val1: 1, val2: 0, val2Value: 1000 });
    const model = new PatchModel(p);
    renderSlotGrid(root, model, 0);
    expect(root.querySelector('.param-mul-frac')).toBeNull();
  });
});
