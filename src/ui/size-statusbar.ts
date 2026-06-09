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
import { exactSize, peekSize, type SizeResult } from '../asm/size-service';
import { mountBreakdownModal } from './size-breakdown-modal';

const DEBOUNCE_MS = 250;

export interface SizeStatusbar {
  /** Recompute and repaint (call after selection changes). */
  refresh(): void;
}

export function wireSizeStatusbar(
  root: HTMLElement,
  model: PatchModel,
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

  const paintResult = (r: SizeResult): void => {
    if (r.ok) {
      btn.innerHTML = `size ${fmtBytes(r.size!)} <span class="size-dim">(${r.size} B)</span> · ${chipPart()}`;
      btn.title = 'Exact .bin code size (assembled in-browser). Click for a per-phase breakdown.';
    } else {
      btn.innerHTML = `<span class="size-warn">size unavailable</span> · ${chipPart()}`;
      btn.title = `This patch can't be assembled by the asm generator (${r.error ?? 'unsupported op'}). Chip-RAM is still exact.`;
    }
  };

  const refresh = (): void => {
    const my = ++token;
    if (timer) { clearTimeout(timer); timer = null; }
    const peek = peekSize(model.patch);
    if (peek) { paintResult(peek); return; }  // cached or codegen-fail → instant
    paintPending();
    timer = setTimeout(() => {
      void exactSize(model.patch).then((r) => {
        if (my === token) paintResult(r);     // ignore superseded edits
      });
    }, DEBOUNCE_MS);
  };

  btn.addEventListener('click', () => modal.open(model.patch));
  model.events.on(() => refresh());
  refresh();

  return { refresh };
}
