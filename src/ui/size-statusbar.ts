// src/ui/size-statusbar.ts
//
// Footer size readout. The code size is now EXACT: the patch is assembled to its
// real Amiga .bin in a Web Worker (size-service) and the byte count shown is the
// ship size, not an estimate. Chip-RAM is computed exactly on the main thread.
//
// Repaint policy: a cached/seen patch (and selection-only changes) repaints
// instantly via peekSize(); a genuinely new patch shows a spinner and assembles
// after a short debounce so rapid edits don't queue an assembly per keystroke.
// Patches the asm generator can't handle show "size unavailable".
import type { PatchModel } from '../patch/model';
import { fmtBytes } from './format';
import { chipUsage } from '../patch/chip-ram';
import { exactSize, packedSize, peekSize, type SizeResult } from '../asm/size-service';
import { mountBreakdownModal } from './size-breakdown-modal';
import type { StatusBar } from './status-bar';

const DEBOUNCE_MS = 250;

export interface SizeStatusbar {
  /** Recompute and repaint (call after selection changes). */
  refresh(): void;
}

export function wireSizeStatusbar(
  root: HTMLElement,
  model: PatchModel,
  status?: StatusBar,
): SizeStatusbar {
  const btn = root.querySelector('#size-status') as HTMLButtonElement;
  const modal = mountBreakdownModal(root);
  let token = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const chipPart = (): string => `chip ${fmtBytes(chipUsage(model.patch).residentTotal)}`;

  const paintPending = (): void => {
    btn.innerHTML = `size <span class="size-spin" aria-label="computing">⟳</span> · ${chipPart()}`;
    btn.title = 'Assembling the exact .bin size…';
  };

  // Paint a result, with `packedHtml` for the "→ … shrinkled" segment (the exact
  // assembled size shows immediately; the slower Shrinkler figure fills in after).
  // Both figures are exact byte counts — no kB rounding — and colour-coded: the
  // raw size amber, the shrinkled (shipped) size green.
  const paint = (r: SizeResult, packedHtml: string): void => {
    if (r.ok) {
      btn.innerHTML = `size <span class="size-raw">${r.size} B</span>${packedHtml} · ${chipPart()}`;
      btn.title = 'Exact .bin size (assembled in-browser); → is the Shrinkler-packed (shrinkled) shipped size. Click for a per-phase breakdown.';
    } else {
      btn.innerHTML = `<span class="size-warn">size unavailable</span> · ${chipPart()}`;
      btn.title = `This patch can't be assembled (${r.error ?? 'unsupported op'}) — an instrument is flagged red. Chip-RAM is still exact.`;
    }
  };

  // Paint the raw size now, then request + fill the Shrinkler-packed size.
  const paintResult = (my: number, r: SizeResult): void => {
    if (!r.ok) { paint(r, ''); return; }
    paint(r, ` → <span class="size-spin" aria-label="shrinkling">⟳</span>`);   // packed pending
    const endShrink = status?.begin('SHRINKLING');
    void packedSize(model.patch).then((p) => {
      endShrink?.();
      if (my !== token) return;
      paint(r, p.ok ? ` → <span class="size-packed">${p.packed} B</span> <span class="size-dim">shrinkled</span>` : '');
    });
  };

  const refresh = (): void => {
    const my = ++token;
    if (timer) { clearTimeout(timer); timer = null; }
    const peek = peekSize(model.patch);
    if (peek) { paintResult(my, peek); return; }  // cached or codegen-fail → instant
    paintPending();
    timer = setTimeout(() => {
      const endAsm = status?.begin('ASSEMBLING');
      void exactSize(model.patch).then((r) => {
        endAsm?.();
        if (my === token) paintResult(my, r);     // ignore superseded edits
      });
    }, DEBOUNCE_MS);
  };

  btn.addEventListener('click', () => modal.open(model.patch));
  model.events.on(() => refresh());
  refresh();

  return { refresh };
}
