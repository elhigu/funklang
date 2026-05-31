// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { OP_DEFS } from '../../src/schema/op-metadata';
import { pickOp } from '../../src/ui/op-picker';

beforeEach(() => { document.body.innerHTML = ''; });

describe('op-picker', () => {
  it('ctrl op carries a description that mentions the -32768..32767 → 0..127 mapping', () => {
    const ctrl = OP_DEFS.find((o) => o.code === 14)!;
    expect(ctrl.description).toBeDefined();
    expect(ctrl.description!.toLowerCase()).toMatch(/-32768.*32767/);
    expect(ctrl.description).toContain('0..127');
  });

  it('cards are name-only (uniform height) and carry the description on data-op-desc + title', () => {
    void pickOp();
    const ctrlCard = document.querySelector('[data-op-code="14"]') as HTMLElement | null;
    expect(ctrlCard).not.toBeNull();
    // No inline description span inside the card any more — name only.
    expect(ctrlCard!.querySelector('.op-picker-desc')).toBeNull();
    expect(ctrlCard!.textContent).toBe('ctrl');
    // Description lives on the data attribute + title for the strip/tooltip.
    expect(ctrlCard!.dataset['opDesc'] ?? '').toMatch(/-32768/);
    expect(ctrlCard!.title).toMatch(/-32768/);
    document.querySelector('.op-picker-cancel')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  it('hovering a card populates the .op-picker-detail strip with its description', () => {
    void pickOp();
    const detail = document.querySelector('.op-picker-detail') as HTMLElement;
    expect(detail).not.toBeNull();
    // Default hint before any hover.
    expect(detail.textContent).toMatch(/hover/i);
    const ctrlCard = document.querySelector('[data-op-code="14"]') as HTMLElement;
    ctrlCard.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(detail.textContent).toContain('ctrl');
    expect(detail.textContent).toMatch(/-32768/);
    document.querySelector('.op-picker-cancel')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  it('hovering an op with no description shows just its name in the strip', () => {
    void pickOp();
    const detail = document.querySelector('.op-picker-detail') as HTMLElement;
    // vol (fn=1) has no description.
    const vol = document.querySelector('[data-op-code="1"]') as HTMLElement;
    vol.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(detail.textContent).toBe('vol');
    document.querySelector('.op-picker-cancel')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  it('imported_sample (fn=20) is marked unsupported and rendered as a disabled card', () => {
    const imp = OP_DEFS.find((o) => o.code === 20)!;
    expect(imp.unsupported).toBe(true);
    void pickOp();
    const card = document.querySelector('[data-op-code="20"]') as HTMLButtonElement;
    expect(card).not.toBeNull();
    expect(card.disabled).toBe(true);
    expect(card.classList.contains('op-picker-card-unsupported')).toBe(true);
    document.querySelector('.op-picker-cancel')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  it('vocoder (fn=24) is marked unsupported and rendered as a disabled card', () => {
    const v = OP_DEFS.find((o) => o.code === 24)!;
    expect(v.unsupported).toBe(true);
    void pickOp();
    const card = document.querySelector('[data-op-code="24"]') as HTMLButtonElement;
    expect(card).not.toBeNull();
    expect(card.disabled).toBe(true);
    expect(card.classList.contains('op-picker-card-unsupported')).toBe(true);
    document.querySelector('.op-picker-cancel')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
});
