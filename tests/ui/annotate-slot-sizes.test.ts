// tests/ui/annotate-slot-sizes.test.ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { emptyPatch, emptySlot, type Patch } from '../../src/patch/types';
import type { CalibrationData } from '../../src/sizecalc/calibration-data';
import { annotateSlotSizes } from '../../src/ui/annotate-slot-sizes';

// Fixed test calibration (decoupled from the live CALIBRATION so re-fits don't
// churn these assertions): osc_saw routine 300 (shared), connection 64 (per use).
const CAL: CalibrationData = {
  floor: 200, perDistinctOp: 100, perSlotPow: 50, slotPower: 0.8, perVarOperand: 50,
  opRoutine: { 2: 300 }, opConnection: { 2: 64 }, modLengthEmpty: 0, fitted: true,
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

describe('annotateSlotSizes (contextual freed-on-delete)', () => {
  let host: HTMLElement;
  beforeEach(() => { document.body.innerHTML = ''; });

  it('a sole-use phase frees routine + connection (last use)', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1 }];
    host = gridWithSlots([0]);
    document.body.appendChild(host);
    annotateSlotSizes(host, p, 0, CAL);
    const label = host.querySelector('[data-slot-size]') as HTMLElement;
    expect(label.textContent).toContain('364 B'); // 300 routine + 64 connection
    expect(label.dataset['lastUse']).toBe('1');
  });

  it('a reused op frees only connection; the shared routine stays', () => {
    const p: Patch = emptyPatch();
    p.instruments[0]!.slots = [
      { ...emptySlot(), fn: 2, outVar: 1 },
      { ...emptySlot(), fn: 2, outVar: 1 },
    ];
    host = gridWithSlots([0, 1]);
    document.body.appendChild(host);
    annotateSlotSizes(host, p, 0, CAL);
    const labels = host.querySelectorAll('[data-slot-size]');
    expect(labels[0]!.textContent).toContain('64 B'); // connection only
    expect(labels[1]!.textContent).toContain('64 B');
    expect((labels[0] as HTMLElement).dataset['lastUse']).toBe('0');
  });

  it('is idempotent — re-annotating does not duplicate the span', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1 }];
    host = gridWithSlots([0]);
    document.body.appendChild(host);
    annotateSlotSizes(host, p, 0, CAL);
    annotateSlotSizes(host, p, 0, CAL);
    expect(host.querySelectorAll('[data-slot-size]').length).toBe(1);
  });
});
