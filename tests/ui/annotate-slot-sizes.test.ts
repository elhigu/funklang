// tests/ui/annotate-slot-sizes.test.ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import type { CalibrationData } from '../../src/sizecalc/calibration-data';
import { computeBreakdown } from '../../src/sizecalc/breakdown';
import { annotateSlotSizes } from '../../src/ui/annotate-slot-sizes';

// Fixed test calibration (decoupled from the live fitted CALIBRATION so re-fits
// don't churn these assertions): osc_saw routine 64 + perSlot 64.
const CAL: CalibrationData = {
  base: 1000, perSlot: 64, perVarOperand: 50, floor: 200,
  opRoutine: { 2: 64 }, modLengthEmpty: 0, fitted: true,
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

  it('writes each slot marginal: routine+perSlot on first use, perSlot on reuse', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [
      { ...emptySlot(), fn: 2, outVar: 1 }, // saw, first use → routine 64 + perSlot 64 = 128
      { ...emptySlot(), fn: 2, outVar: 1 }, // saw reuse → perSlot 64
    ];
    host = gridWithSlots([0, 1]);
    document.body.appendChild(host);
    const b = computeBreakdown(p, CAL);
    annotateSlotSizes(host, b.perInstrument[0]!);

    const labels = host.querySelectorAll('[data-slot-size]');
    expect(labels.length).toBe(2);
    expect(labels[0]!.textContent).toContain('~128 B');
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
