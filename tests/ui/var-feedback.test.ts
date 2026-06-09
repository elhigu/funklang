// @vitest-environment jsdom
// The var-source dropdown distinguishes a forward/feedback reference (the
// variable is written by a LATER slot → "(feedback #N)", cyan, not red) from
// a truly-unset variable (written by no slot → "(unset)", red).

import { describe, it, expect, beforeEach } from 'vitest';
import { PatchModel } from '../../src/patch/model';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import type { Patch } from '../../src/patch/types';
import { renderSlotGrid } from '../../src/ui/slot-grid';

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
});

function patchWith(secondSlotOutVar: number): Patch {
  const p = emptyPatch();
  // slot 0: add, in1 (val1) reads v3; slot 1: osc writing `secondSlotOutVar`.
  p.instruments[0]!.slots = [
    { ...emptySlot(), fn: 9, val1: 3, outVar: 1 },
    { ...emptySlot(), fn: 2, freqVal: 1000, gainVal: 80, outVar: secondSlotOutVar },
  ];
  return p;
}

function in1Select(): HTMLSelectElement {
  // The add's in1 is the var-source dropdown in the first row.
  return root.querySelector('.slot .param-var-select') as HTMLSelectElement;
}

describe('var-source feedback vs unset', () => {
  it('reads as feedback when a LATER slot writes the variable (cyan, not red)', () => {
    renderSlotGrid(root, new PatchModel(patchWith(3 /* slot 1 writes v3 */)), 0);
    const sel = in1Select();
    expect(sel.classList.contains('var-feedback')).toBe(true);
    expect(sel.classList.contains('var-unset')).toBe(false);
    // The v3 option is labelled with its feedback source (visible row 2).
    const v3opt = [...sel.options].find((o) => o.value === '3')!;
    expect(v3opt.textContent).toBe('v3 (feedback #2)');
  });

  it('reads as unset when NO slot writes the variable (red)', () => {
    renderSlotGrid(root, new PatchModel(patchWith(1 /* slot 1 writes v1, nobody writes v3 */)), 0);
    const sel = in1Select();
    expect(sel.classList.contains('var-unset')).toBe(true);
    expect(sel.classList.contains('var-feedback')).toBe(false);
    const v3opt = [...sel.options].find((o) => o.value === '3')!;
    expect(v3opt.textContent).toBe('v3 (unset)');
  });
});
