// @vitest-environment jsdom
//
// The breakdown modal now computes EXACT figures by assembly/ablation. We mock
// those so the DOM/presentation is testable without vasm; the async results
// fill the cells once resolved.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/asm/size-service', () => ({
  packedSize: vi.fn(async () => ({ ok: true, raw: 2024, packed: 751 })),
}));
vi.mock('../../src/asm/size-ablation', () => ({
  phaseCost: vi.fn(async () => ({ ok: true, bytes: 128, packed: 40 })),
}));

import { emptyPatch, emptySlot } from '../../src/patch/types';
import { mountBreakdownModal } from '../../src/ui/size-breakdown-modal';

function flush(): Promise<void> { return new Promise((r) => setTimeout(r, 0)); }

describe('breakdown modal', () => {
  let root: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  it('is hidden until opened, then shows the total row + per-phase rows', () => {
    const modal = mountBreakdownModal(root);
    const overlay = root.querySelector('#size-breakdown-overlay') as HTMLElement;
    expect(overlay.classList.contains('hidden')).toBe(true);

    const p = emptyPatch();
    p.instruments[0]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1 }];
    modal.open(p);
    expect(overlay.classList.contains('hidden')).toBe(false);
    expect(overlay.textContent).toContain('total .bin');
    expect(overlay.textContent).toContain('osc_saw');     // the phase row
    expect(overlay.textContent!.toLowerCase()).toContain('freed');
    expect(overlay.querySelector('.size-spin')).not.toBeNull(); // cells start spinning
  });

  it('fills the exact total + freed bytes once assembly resolves', async () => {
    const modal = mountBreakdownModal(root);
    const p = emptyPatch();
    p.instruments[0]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1 }];
    modal.open(p);
    await flush();
    const overlay = root.querySelector('#size-breakdown-overlay') as HTMLElement;
    expect(overlay.querySelector('#bd-total')!.textContent).toContain('2024 B');
    expect(overlay.textContent).toContain('−128 B'); // freed bytes from ablation
  });

  it('describes the figures as exact (not a rough estimate)', () => {
    const modal = mountBreakdownModal(root);
    modal.open(emptyPatch());
    const overlay = root.querySelector('#size-breakdown-overlay') as HTMLElement;
    const txt = overlay.textContent!.toLowerCase();
    expect(txt).toContain('exact');
    expect(txt).not.toContain('rough');
  });

  it('closes on outside click', () => {
    const modal = mountBreakdownModal(root);
    modal.open(emptyPatch());
    const overlay = root.querySelector('#size-breakdown-overlay') as HTMLElement;
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(overlay.classList.contains('hidden')).toBe(true);
  });
});
