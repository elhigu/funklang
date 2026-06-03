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
    const rough = CALIBRATION.fitted
      ? `±${fmtBytes(CALIBRATION.fit.meanErrShrinkled)} typical (max ${fmtBytes(CALIBRATION.fit.maxErrShrinkled)})`
      : 'rough — calibration not yet run';

    const opRows = b.opTypesUsed
      .map((o) => `<tr><td>${o.name}</td><td class="num">${fmtBytes(o.codeBytes)}</td></tr>`)
      .join('');

    const instrRows = b.perInstrument
      .filter((i) => i.slots.length > 0 || i.sampleBytes > 0)
      .map(
        (i) =>
          `<tr><td>${String(i.instrIdx + 1).padStart(2, '0')}</td>` +
          `<td class="num">${fmtBytes(i.shrinkled)}</td>` +
          `<td class="num">${fmtBytes(i.uncompressed)}</td>` +
          `<td class="num">${fmtBytes(i.sampleBytes)}</td></tr>`,
      )
      .join('');

    overlay.innerHTML = `
      <div class="size-breakdown-inner" role="document">
        <header><h2>SIZE BREAKDOWN</h2><button id="size-breakdown-close" aria-label="Close">✕</button></header>
        <p class="size-breakdown-note">Estimate (${rough}). Generated samples cost no exe bytes — only imports and the synth program do.</p>
        <section>
          <h3>Totals</h3>
          <table>
            <tr><td>exe (shrinkled, est.)</td><td class="num">${fmtBytes(b.exe.shrinkled)}</td></tr>
            <tr><td>exe (uncompressed, est.)</td><td class="num">${fmtBytes(b.exe.uncompressed)}</td></tr>
            <tr><td>· base</td><td class="num">${fmtBytes(b.exe.base)}</td></tr>
            <tr><td>· op code</td><td class="num">${fmtBytes(b.exe.opCodeBytes)}</td></tr>
            <tr><td>· op stream</td><td class="num">${fmtBytes(b.exe.slotStreamBytes)}</td></tr>
            <tr><td>· imported samples</td><td class="num">${fmtBytes(b.exe.importBytes)}</td></tr>
            <tr><td>chip-RAM (resident)</td><td class="num">${fmtBytes(b.chip.residentTotal)}</td></tr>
          </table>
        </section>
        <section>
          <h3>Op types used (code paid once each)</h3>
          <table><tr><th>op</th><th class="num">code</th></tr>${opRows || '<tr><td colspan="2">none</td></tr>'}</table>
        </section>
        <section>
          <h3>Per instrument</h3>
          <table>
            <tr><th>#</th><th class="num">shrinkled</th><th class="num">uncompressed</th><th class="num">sample chip</th></tr>
            ${instrRows || '<tr><td colspan="4">none</td></tr>'}
          </table>
        </section>
      </div>`;
    (overlay.querySelector('#size-breakdown-close') as HTMLButtonElement).addEventListener('click', close);
    overlay.classList.remove('hidden');
  };

  return { open, close, isOpen };
}
