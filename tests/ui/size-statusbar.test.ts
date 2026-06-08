// tests/ui/size-statusbar.test.ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import { PatchModel } from '../../src/patch/model';
import { wireSizeStatusbar } from '../../src/ui/size-statusbar';

describe('size status bar', () => {
  let root: HTMLElement;
  let btn: HTMLButtonElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    btn = document.createElement('button');
    btn.id = 'size-status';
    root.appendChild(btn);
    document.body.appendChild(root);
  });

  it('renders the rough size + chip totals and the selected instrument figure', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1 }];
    const model = new PatchModel(p);
    let sel = 0;
    wireSizeStatusbar(root, model, () => sel);
    expect(btn.textContent).toMatch(/~size/);
    expect(btn.textContent).toMatch(/chip/);
    expect(btn.textContent).toMatch(/sel/);
  });

  it('refreshes when the model emits a change', () => {
    const p = emptyPatch();
    const model = new PatchModel(p);
    wireSizeStatusbar(root, model, () => 0);
    const before = btn.textContent;
    model.insertSlot(0, 0, { ...emptySlot(), fn: 2, outVar: 1 });
    expect(btn.textContent).not.toBe(before);
  });

  it('opens the breakdown modal on click', () => {
    const model = new PatchModel(emptyPatch());
    wireSizeStatusbar(root, model, () => 0);
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const overlay = root.querySelector('#size-breakdown-overlay') as HTMLElement;
    expect(overlay).toBeTruthy();
    expect(overlay.classList.contains('hidden')).toBe(false);
  });
});
