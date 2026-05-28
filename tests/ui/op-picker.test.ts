// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { OP_DEFS } from '../../src/dsp/op-metadata';
import { pickOp } from '../../src/ui/op-picker';

beforeEach(() => { document.body.innerHTML = ''; });

describe('op-picker', () => {
  it('ctrl op carries a description that mentions the -32768..32767 → 0..127 mapping', () => {
    const ctrl = OP_DEFS.find((o) => o.code === 14)!;
    expect(ctrl.description).toBeDefined();
    expect(ctrl.description!.toLowerCase()).toMatch(/-32768.*32767/);
    expect(ctrl.description).toContain('0..127');
  });

  it('pickOp renders the description as .op-picker-desc when an op card is rendered', () => {
    void pickOp();
    const ctrlCard = document.querySelector('[data-op-code="14"]') as HTMLElement | null;
    expect(ctrlCard).not.toBeNull();
    const desc = ctrlCard!.querySelector('.op-picker-desc');
    expect(desc).not.toBeNull();
    expect((desc as HTMLElement).textContent ?? '').toMatch(/-32768/);
    document.querySelector('.op-picker-cancel')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
});
