// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { wireRevertPanel } from '../../src/ui/revert-panel';
import { saveAutosave, clearAutosaves } from '../../src/ui/autosave';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import type { Patch } from '../../src/patch/types';

function panelMarkup(): string {
  return `
    <button id="btn-revert">REVERT</button>
    <aside id="revert-panel" class="revert-panel hidden" aria-hidden="true">
      <button id="revert-close">✕</button>
      <ul id="revert-list"></ul>
    </aside>`;
}

function patchNamed(name: string): Patch {
  const p = emptyPatch();
  p.instruments[0]!.name = name;
  p.instruments[0]!.sampleLength = 256;
  p.instruments[0]!.slots.push({ ...emptySlot(), fn: 2, outVar: 1, freqVal: 50, gainVal: 64 });
  return p;
}

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  root.innerHTML = panelMarkup();
  document.body.appendChild(root);
  clearAutosaves();
  Element.prototype.scrollIntoView = (): void => {};
});

describe('revert-panel', () => {
  it('starts hidden; open() snapshots current + lists entries newest-first', () => {
    // Seed an OLDER autosave (an explicitly past timestamp so ordering is stable).
    saveAutosave(patchNamed('OLD'), undefined /* default = localStorage */, () => 1000);
    const panel = wireRevertPanel(root, { getPatch: () => patchNamed('NOW'), onRestore: () => {} });
    expect(panel.isOpen()).toBe(false);
    panel.open();
    expect(panel.isOpen()).toBe(true);
    const rows = root.querySelectorAll('.revert-row');
    expect(rows.length).toBe(2);                         // NOW snapshot + OLD
    expect(rows[0]!.classList.contains('active')).toBe(true);   // CURRENT highlighted
    expect(rows[0]!.textContent).toContain('CURRENT');
  });

  it('clicking a row calls onRestore with the restored patch', () => {
    saveAutosave(patchNamed('OLD'), undefined, () => 1000);
    const onRestore = vi.fn();
    const panel = wireRevertPanel(root, { getPatch: () => patchNamed('NOW'), onRestore });
    panel.open();
    const rows = root.querySelectorAll('.revert-row');
    // Row 1 is the OLD snapshot.
    (rows[1] as HTMLElement).click();
    expect(onRestore).toHaveBeenCalledTimes(1);
    const restored = onRestore.mock.calls[0]![0] as Patch;
    expect(restored.instruments[0]!.name).toBe('OLD');
  });

  it('the ✕ button and Escape both close the panel', () => {
    const panel = wireRevertPanel(root, { getPatch: () => patchNamed('NOW'), onRestore: () => {} });
    panel.open();
    (root.querySelector('#revert-close') as HTMLButtonElement).click();
    expect(panel.isOpen()).toBe(false);

    panel.open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(panel.isOpen()).toBe(false);
  });

  it('ArrowDown moves the selection and restores that snapshot', () => {
    saveAutosave(patchNamed('OLD'), undefined, () => 1000);
    const onRestore = vi.fn();
    const panel = wireRevertPanel(root, { getPatch: () => patchNamed('NOW'), onRestore });
    panel.open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    // Selection moved from row 0 (CURRENT) to row 1 (OLD) and restored it.
    const rows = root.querySelectorAll('.revert-row');
    expect(rows[1]!.classList.contains('active')).toBe(true);
    expect((onRestore.mock.calls.at(-1)![0] as Patch).instruments[0]!.name).toBe('OLD');
  });

  it('wheel down inside the panel steps the selection', () => {
    saveAutosave(patchNamed('OLD'), undefined, () => 1000);
    const onRestore = vi.fn();
    const panel = wireRevertPanel(root, { getPatch: () => patchNamed('NOW'), onRestore });
    panel.open();
    const ev = new Event('wheel', { bubbles: true, cancelable: true });
    (ev as unknown as { deltaY: number }).deltaY = 10;
    (root.querySelector('#revert-panel') as HTMLElement).dispatchEvent(ev);
    expect(root.querySelectorAll('.revert-row')[1]!.classList.contains('active')).toBe(true);
  });

  it('a mousedown outside the panel closes it; inside does not', () => {
    const panel = wireRevertPanel(root, { getPatch: () => patchNamed('NOW'), onRestore: () => {} });
    panel.open();
    // mousedown inside the panel — stays open.
    (root.querySelector('#revert-list') as HTMLElement).dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true }),
    );
    expect(panel.isOpen()).toBe(true);
    // mousedown elsewhere — closes.
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    expect(panel.isOpen()).toBe(false);
  });
});
