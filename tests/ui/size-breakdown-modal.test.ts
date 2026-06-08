// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import { CALIBRATION } from '../../src/sizecalc/calibration-data';
import { computeBreakdown } from '../../src/sizecalc/breakdown';
import { mountBreakdownModal } from '../../src/ui/size-breakdown-modal';

describe('breakdown modal', () => {
  let root: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  it('is hidden until opened and shows op-types-used rows when open', () => {
    const modal = mountBreakdownModal(root);
    const overlay = root.querySelector('#size-breakdown-overlay') as HTMLElement;
    expect(overlay.classList.contains('hidden')).toBe(true);

    const p = emptyPatch();
    p.instruments[0]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1 }];
    modal.open(computeBreakdown(p, CALIBRATION));
    expect(overlay.classList.contains('hidden')).toBe(false);
    expect(overlay.textContent).toContain('osc_saw');
  });

  it('labels the estimate as rough/approximate with the real-patch ± notice', () => {
    const modal = mountBreakdownModal(root);
    modal.open(computeBreakdown(emptyPatch(), CALIBRATION));
    const overlay = root.querySelector('#size-breakdown-overlay') as HTMLElement;
    const txt = overlay.textContent!.toLowerCase();
    expect(txt).toContain('rough'); // clearly labelled approximate
    expect(txt).toContain('typical'); // "±~N% typical …"
    expect(txt).toContain('export:bin'); // points to the exact-number path
  });

  it('closes on outside click', () => {
    const modal = mountBreakdownModal(root);
    modal.open(computeBreakdown(emptyPatch(), CALIBRATION));
    const overlay = root.querySelector('#size-breakdown-overlay') as HTMLElement;
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(overlay.classList.contains('hidden')).toBe(true);
  });
});
