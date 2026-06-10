// tests/ui/size-statusbar.test.ts
// @vitest-environment jsdom
//
// The footer now shows the EXACT assembled .bin size (async, via size-service).
// We mock the service so these DOM tests stay fast and never touch vasm.
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../src/asm/size-service', () => ({
  peekSize: vi.fn(),
  exactSize: vi.fn(async () => ({ ok: true, size: 2024 })),
  packedSize: vi.fn(async () => ({ ok: true, raw: 2024, packed: 751 })),
}));

import { emptyPatch, emptySlot } from '../../src/patch/types';
import { PatchModel } from '../../src/patch/model';
import { wireSizeStatusbar } from '../../src/ui/size-statusbar';
import { peekSize } from '../../src/asm/size-service';

const peek = peekSize as unknown as Mock;

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
    peek.mockReset();
  });

  it('shows the exact size + chip total when cached, then fills the packed size', async () => {
    peek.mockReturnValue({ ok: true, size: 2024 });
    const model = new PatchModel(emptyPatch());
    wireSizeStatusbar(root, model);
    expect(btn.textContent).toMatch(/size/);
    expect(btn.textContent).toMatch(/2024 B/);
    expect(btn.textContent).toMatch(/chip/);
    // The Shrinkler-packed size fills in asynchronously (spinner until then).
    await new Promise((r) => setTimeout(r, 0));
    expect(btn.textContent).toMatch(/751/);            // packed
    expect(btn.querySelector('.size-spin')).toBeNull();
  });

  it('shows a spinner while a new (uncached) patch is being assembled', () => {
    peek.mockReturnValue(undefined);
    const model = new PatchModel(emptyPatch());
    wireSizeStatusbar(root, model);
    expect(btn.querySelector('.size-spin')).not.toBeNull();
    expect(btn.textContent).toMatch(/chip/);
  });

  it('shows "size unavailable" when the patch cannot be assembled', () => {
    peek.mockReturnValue({ ok: false, error: 'variable enva' });
    const model = new PatchModel(emptyPatch());
    wireSizeStatusbar(root, model);
    expect(btn.querySelector('.size-warn')).not.toBeNull();
    expect(btn.textContent).toMatch(/unavailable/);
  });

  it('refreshes when the model emits a change', () => {
    peek.mockReturnValue({ ok: true, size: 2024 });
    const model = new PatchModel(emptyPatch());
    wireSizeStatusbar(root, model);
    const before = peek.mock.calls.length;
    model.insertSlot(0, 0, { ...emptySlot(), fn: 2, outVar: 1 });
    expect(peek.mock.calls.length).toBeGreaterThan(before);
  });

  it('opens the breakdown modal on click', () => {
    peek.mockReturnValue({ ok: true, size: 2024 });
    const model = new PatchModel(emptyPatch());
    wireSizeStatusbar(root, model);
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const overlay = root.querySelector('#size-breakdown-overlay') as HTMLElement;
    expect(overlay).toBeTruthy();
    expect(overlay.classList.contains('hidden')).toBe(false);
  });
});
