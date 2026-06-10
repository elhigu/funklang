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

  it('shows raw byte counts (no kB) and labels the packed figure "shrinkled"', async () => {
    peek.mockReturnValue({ ok: true, size: 2024 });
    const model = new PatchModel(emptyPatch());
    wireSizeStatusbar(root, model);
    await new Promise((r) => setTimeout(r, 0));
    // The code/shrinkled figures are exact byte counts — no "2.0 kB" rounding.
    const sizeSeg = btn.textContent!.split('·')[0]!;     // drop the chip segment
    expect(sizeSeg).not.toMatch(/kB/);
    expect(btn.textContent).toMatch(/2024 B/);
    expect(btn.textContent).toMatch(/751 B/);
    expect(btn.textContent).toMatch(/shrinkled/);
    expect(btn.textContent).not.toMatch(/packed/);
  });

  it('reports assembling + shrinkling to the status light', async () => {
    peek.mockReturnValue(undefined);                     // force an async assemble
    const begun: string[] = [];
    let live = 0;
    const status = {
      begin(label: string) {
        begun.push(label);
        live++;
        return () => { live--; };
      },
    };
    const model = new PatchModel(emptyPatch());
    wireSizeStatusbar(root, model, status);
    await new Promise((r) => setTimeout(r, 300));         // past the debounce + async work
    expect(begun).toContain('ASSEMBLING');
    expect(begun).toContain('SHRINKLING');
    expect(live).toBe(0);                                 // every task ended
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
