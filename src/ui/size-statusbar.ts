// src/ui/size-statusbar.ts
//
// Populates the footer size readout and owns the breakdown modal. Recomputes
// on every PatchModel change and whenever the host calls refresh() (e.g. on
// selection change). Extends the existing <footer> (app.ts) — not a new bar.
import type { PatchModel } from '../patch/model';
import { computeBreakdown } from '../sizecalc/breakdown';
import { CALIBRATION } from '../sizecalc/calibration-data';
import { fmtBytes } from '../sizecalc/format';
import { mountBreakdownModal } from './size-breakdown-modal';

export interface SizeStatusbar {
  /** Recompute and repaint (call after selection changes). */
  refresh(): void;
}

export function wireSizeStatusbar(
  root: HTMLElement,
  model: PatchModel,
  getSelectedInstr: () => number,
): SizeStatusbar {
  const btn = root.querySelector('#size-status') as HTMLButtonElement;
  const modal = mountBreakdownModal(root);

  const refresh = (): void => {
    const b = computeBreakdown(model.patch, CALIBRATION);
    const selIdx = getSelectedInstr();
    const sel = b.perInstrument[selIdx];
    const rough = CALIBRATION.fitted ? '' : '~';
    // `sel.shrinkled` is the instrument's MARGINAL contribution (its op code +
    // stream, compressed) — deliberately not the absolute headline formula:
    // base/shrink.base/imports are patch-global and would double-count here.
    const selTxt = sel ? `${rough}${fmtBytes(sel.shrinkled)}` : '—';
    btn.textContent =
      `exe ${rough}${fmtBytes(b.exe.shrinkled)} ` +
      `(sel ${selTxt}) · chip ${fmtBytes(b.chip.residentTotal)}`;
  };

  btn.addEventListener('click', () => {
    modal.open(computeBreakdown(model.patch, CALIBRATION));
  });

  model.events.on(() => refresh());
  refresh();

  return { refresh };
}
