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
    const sel = b.perInstrument[getSelectedInstr()];
    // Code is a ROUGH aggregate estimate (~±20%) → always prefix `~`. The
    // selected-instrument figure is a RELATIVE op weight (ops share code in the
    // .bin, so it can't be an exact per-instrument byte total). Chip is exact.
    const selTxt = sel && sel.weight > 0 ? ` · sel ~${fmtBytes(sel.weight)}` : '';
    btn.textContent =
      `~size ${fmtBytes(b.code.totalBytes)}${selTxt} · chip ${fmtBytes(b.chip.residentTotal)}`;
    btn.title = `Rough exported-size estimate (code ±~${CALIBRATION.fit.meanPct}%, + exact imported-sample bytes). Click for breakdown.`;
  };

  btn.addEventListener('click', () => {
    modal.open(computeBreakdown(model.patch, CALIBRATION));
  });

  model.events.on(() => refresh());
  refresh();

  return { refresh };
}
