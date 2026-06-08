// tests/ui/annotate-slot-sizes.test.ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import type { CalibrationData } from '../../src/sizecalc/calibration-data';
import { computeBreakdown } from '../../src/sizecalc/breakdown';
import { annotateSlotSizes } from '../../src/ui/annotate-slot-sizes';

// Fixed test calibration (decoupled from the live fitted CALIBRATION so re-fits
// don't churn these assertions): osc_saw relative weight 64.
const CAL: CalibrationData = {
  base: 1000, perDistinctOp: 100, perSlot: 10, floor: 200,
  opCost: { 2: 64 }, modLengthEmpty: 0, fitted: true,
  fit: { meanErr: 0, maxErr: 0, meanPct: 0 },
};

function gridWithSlots(modelIdxs: number[]): HTMLElement {
  const host = document.createElement('div');
  const slots = document.createElement('div');
  slots.className = 'slots';
  for (const idx of modelIdxs) {
    const wrap = document.createElement('div');
    wrap.className = 'slot-wrap';
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.dataset['modelSlot'] = String(idx);
    wrap.appendChild(slot);
    slots.appendChild(wrap);
  }
  host.appendChild(slots);
  return host;
}

describe('annotateSlotSizes', () => {
  let host: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('writes the relative op weight into each slot row', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [
      { ...emptySlot(), fn: 2, outVar: 1 }, // saw
      { ...emptySlot(), fn: 2, outVar: 1 }, // saw reuse — same op, same weight
    ];
    host = gridWithSlots([0, 1]);
    document.body.appendChild(host);
    const b = computeBreakdown(p, CAL);
    annotateSlotSizes(host, b.perInstrument[0]!);

    const labels = host.querySelectorAll('[data-slot-size]');
    expect(labels.length).toBe(2);
    // relative weight = osc_saw opCost 64, shown for every slot of that op
    expect(labels[0]!.textContent).toContain('~64 B');
    expect(labels[1]!.textContent).toContain('~64 B');
  });

  it('marks reused ops so the first-use cost is visually distinct', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [
      { ...emptySlot(), fn: 2, outVar: 1 },
      { ...emptySlot(), fn: 2, outVar: 1 },
    ];
    host = gridWithSlots([0, 1]);
    document.body.appendChild(host);
    const b = computeBreakdown(p, CAL);
    annotateSlotSizes(host, b.perInstrument[0]!);
    const labels = host.querySelectorAll('[data-slot-size]');
    expect((labels[0] as HTMLElement).dataset['firstUse']).toBe('1');
    expect((labels[1] as HTMLElement).dataset['firstUse']).toBe('0');
  });

  it('is idempotent — re-annotating does not duplicate the span', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1 }];
    host = gridWithSlots([0]);
    document.body.appendChild(host);
    const b = computeBreakdown(p, CAL);
    annotateSlotSizes(host, b.perInstrument[0]!);
    annotateSlotSizes(host, b.perInstrument[0]!);
    expect(host.querySelectorAll('[data-slot-size]').length).toBe(1);
  });
});
