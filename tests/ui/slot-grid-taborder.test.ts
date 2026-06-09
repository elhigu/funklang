// @vitest-environment jsdom
//
// Tab-order policy: moving with Tab / Shift+Tab between fields lands ONLY on
// the value sliders (`.kbar` knob bars) and the source-selector comboboxes
// (`.param-ref-select` — clone/chordgen source instrument + imported sample).
// Every other focusable control in the grid (op-picker button, var-source /
// enum / output-variable selects, and the 🔊 / expand / delete / insert
// buttons) is removed from the sequential tab order with tabindex=-1.

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

function tabIndexOf(el: Element): string | null {
  return el.getAttribute('tabindex');
}

describe('slot-grid — Tab/Shift+Tab field policy', () => {
  it('sliders (.kbar) stay in the tab order; buttons and non-source selects do not', () => {
    const p = emptyPatch();
    p.instruments[0]!.name = 'A';
    // osc_saw → frequency + gain knobs (sliders), plus the per-row OUT
    // select and op/🔊/delete buttons.
    p.instruments[0]!.slots.push({ ...emptySlot(), fn: 2, outVar: 1, freqVal: 1000, gainVal: 80 });
    renderSlotGrid(root, new PatchModel(p), 0);

    const sliders = root.querySelectorAll('.kbar');
    expect(sliders.length).toBeGreaterThan(0);                 // sanity: osc_saw drew knobs
    for (const s of sliders) expect(tabIndexOf(s)).not.toBe('-1');

    // Every button is out of the tab order.
    for (const b of root.querySelectorAll('button')) expect(tabIndexOf(b)).toBe('-1');

    // The output-variable select is NOT a source selector → out of order.
    const outSel = root.querySelector('.out-select');
    expect(outSel).not.toBeNull();
    expect(tabIndexOf(outSel!)).toBe('-1');

    // Any var-source / enum select is likewise out of order.
    for (const s of root.querySelectorAll('select:not(.param-ref-select)')) {
      expect(tabIndexOf(s)).toBe('-1');
    }
  });

  it('the source-instrument selector (.param-ref-select) stays in the tab order', () => {
    const p = emptyPatch();
    p.instruments[0]!.name = 'SRC';
    p.instruments[0]!.sampleLength = 256;
    p.instruments[0]!.slots.push({ ...emptySlot(), fn: 2, outVar: 1, freqVal: 1000, gainVal: 80 });
    // Instrument 1 clones instrument 0 (a clone source must be a LOWER index).
    p.instruments[1]!.name = 'CLONE';
    p.instruments[1]!.slots.push({ ...emptySlot(), fn: 17, gain: 0 /* source = instr 0 */ });
    renderSlotGrid(root, new PatchModel(p), 1);

    const ref = root.querySelector('.param-ref-select');
    expect(ref).not.toBeNull();                                // the clone source picker exists
    expect(tabIndexOf(ref!)).not.toBe('-1');                   // ...and is a tab stop
  });
});
