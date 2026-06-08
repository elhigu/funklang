// src/ui/size-breakdown-modal.ts
//
// Click-to-expand breakdown of the size estimate. Presentation only; it
// renders a PatchBreakdown handed to open(). Pattern follows help-modal.ts.
import type { PatchBreakdown } from '../sizecalc/breakdown';
import { CALIBRATION } from '../sizecalc/calibration-data';
import { fmtBytes } from '../sizecalc/format';

export interface BreakdownModal {
  open(b: PatchBreakdown): void;
  close(): void;
  isOpen(): boolean;
}

/** Create the overlay inside `root` and return control handles. */
export function mountBreakdownModal(root: HTMLElement): BreakdownModal {
  const overlay = document.createElement('div');
  overlay.id = 'size-breakdown-overlay';
  overlay.className = 'size-breakdown-overlay hidden';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  root.appendChild(overlay);

  const close = (): void => overlay.classList.add('hidden');
  const isOpen = (): boolean => !overlay.classList.contains('hidden');

  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) close();
  });

  const open = (b: PatchBreakdown): void => {
    const accuracy = `±~${CALIBRATION.fit.meanPct}% typical · mean ${fmtBytes(CALIBRATION.fit.meanErr)}, max ${fmtBytes(CALIBRATION.fit.maxErr)} vs real patches`;

    const opRows = b.opTypesUsed
      .map((o) => `<tr><td>${o.name}</td><td class="num">~${fmtBytes(o.routineBytes)}</td></tr>`)
      .join('');

    const instrRows = b.perInstrument
      .filter((i) => i.slots.length > 0 || i.sampleBytes > 0)
      .map(
        (i) =>
          `<tr><td>${String(i.instrIdx + 1).padStart(2, '0')}</td>` +
          `<td class="num">~${fmtBytes(i.codeBytes)}</td>` +
          `<td class="num">${fmtBytes(i.sampleBytes)}</td></tr>`,
      )
      .join('');

    const flooredRow = b.code.floored
      ? `<tr><td>· (min .bin floor)</td><td class="num">${fmtBytes(b.code.codeBytes)}</td></tr>`
      : '';
    const varRow = b.code.nVarOperands > 0
      ? `<tr><td>· ${b.code.nVarOperands} variable operand(s)</td><td class="num">${fmtBytes(b.code.varOperandBytes)}</td></tr>`
      : '';
    const importRow = b.code.importBytes > 0
      ? `<tr><td>· imported samples</td><td class="num">${fmtBytes(b.code.importBytes)}</td></tr>`
      : '';

    overlay.innerHTML = `
      <div class="size-breakdown-inner" role="document">
        <header><h2>SIZE BREAKDOWN</h2><button id="size-breakdown-close" aria-label="Close">✕</button></header>
        <p class="size-breakdown-note">Rough estimates — enough to get a hunch of which operations add lots of code and which are cheap. ${accuracy}. For the exact size, export the patch from the original AmigaKlang.</p>
        <section>
          <h3>Totals (these sum to the estimate)</h3>
          <table>
            <tr><td>size (rough)</td><td class="num">~${fmtBytes(b.code.totalBytes)}</td></tr>
            <tr><td>· base</td><td class="num">${fmtBytes(b.code.base)}</td></tr>
            <tr><td>· ${b.code.distinctOps.length} op routine(s)</td><td class="num">${fmtBytes(b.code.routineBytes)}</td></tr>
            <tr><td>· ${b.code.nSlots} slot(s)</td><td class="num">${fmtBytes(b.code.slotBytes)}</td></tr>
            ${varRow}
            ${flooredRow}
            ${importRow}
            <tr><td>chip-RAM (resident)</td><td class="num">${fmtBytes(b.chip.residentTotal)}</td></tr>
          </table>
        </section>
        <section>
          <h3>Op routines — code paid once per op type (heaviest first)</h3>
          <table><tr><th>op</th><th class="num">routine</th></tr>${opRows || '<tr><td colspan="2">none</td></tr>'}</table>
        </section>
        <section>
          <h3>Per instrument — code contribution + exact sample chip</h3>
          <table>
            <tr><th>#</th><th class="num">code</th><th class="num">sample chip</th></tr>
            ${instrRows || '<tr><td colspan="3">none</td></tr>'}
          </table>
        </section>
      </div>`;
    (overlay.querySelector('#size-breakdown-close') as HTMLButtonElement).addEventListener('click', close);
    overlay.classList.remove('hidden');
  };

  return { open, close, isOpen };
}
