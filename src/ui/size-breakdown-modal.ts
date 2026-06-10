// src/ui/size-breakdown-modal.ts
//
// Exact size breakdown. Opens on a patch and computes, in the background, the
// total .bin size plus how many bytes deleting each phase would free — both by
// real assembly (size-service / ablation), not estimation. Each figure shows a
// spinner until its assembly resolves; results are cached so re-opening is
// instant. Each op is inlined per use (no shared subroutines), so a phase's
// freed-bytes figure is simply that phase's own code — a reverb frees ~the same
// whether or not other reverbs remain.
import type { Patch } from '../patch/types';
import { fmtBytes } from './format';
import { chipUsage } from '../patch/chip-ram';
import { exactSize } from '../asm/size-service';
import { phaseCost } from '../asm/size-ablation';
import { opByCode } from '../schema/op-metadata';

export interface BreakdownModal {
  open(patch: Patch): void;
  close(): void;
  isOpen(): boolean;
}

interface Phase { instr: number; slot: number; fn: number; name: string }

/** Create the overlay inside `root` and return control handles. */
export function mountBreakdownModal(root: HTMLElement): BreakdownModal {
  const overlay = document.createElement('div');
  overlay.id = 'size-breakdown-overlay';
  overlay.className = 'size-breakdown-overlay hidden';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  root.appendChild(overlay);

  let generation = 0;

  const close = (): void => { generation++; overlay.classList.add('hidden'); };
  const isOpen = (): boolean => !overlay.classList.contains('hidden');
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });

  const open = (patch: Patch): void => {
    const gen = ++generation;
    const chip = chipUsage(patch);

    // Gather non-empty phases, grouped by instrument for display.
    const byInstr = new Map<number, Phase[]>();
    patch.instruments.forEach((ins, i) => {
      ins.slots.forEach((s, sl) => {
        if (s.fn === 0) return;
        const arr = byInstr.get(i) ?? [];
        arr.push({ instr: i, slot: sl, fn: s.fn, name: opByCode(s.fn)?.name ?? `op${s.fn}` });
        byInstr.set(i, arr);
      });
    });

    const spin = '<span class="size-spin" aria-label="computing">⟳</span>';
    const phaseId = (p: Phase): string => `bd-${p.instr}-${p.slot}`;

    let instrRows = '';
    for (const [i, phases] of byInstr) {
      const ins = patch.instruments[i]!;
      const name = (ins.name ?? '').trim() || '(unnamed)';
      instrRows +=
        `<tr class="bd-instr-head"><td>${String(i + 1).padStart(2, '0')} ${name}</td>` +
        `<td class="num">${fmtBytes(Math.max(0, ins.sampleLength | 0))} chip</td></tr>`;
      for (const p of phases) {
        instrRows += `<tr><td>· ${p.name}</td><td class="num" id="${phaseId(p)}">${spin}</td></tr>`;
      }
    }
    if (!instrRows) instrRows = '<tr><td colspan="2">no phases</td></tr>';

    overlay.innerHTML = `
      <div class="size-breakdown-inner" role="document">
        <header><h2>SIZE BREAKDOWN</h2><button id="size-breakdown-close" aria-label="Close">✕</button></header>
        <p class="size-breakdown-note">Exact .bin code size, assembled in-browser. Each phase shows how many bytes <strong>deleting it</strong> would free. Every op is inlined per use, so each phase costs the same regardless of how many times that op appears.</p>
        <section>
          <table>
            <tr><td><strong>total .bin code</strong></td><td class="num" id="bd-total">${spin}</td></tr>
            <tr><td>chip-RAM (resident)</td><td class="num">${fmtBytes(chip.residentTotal)}</td></tr>
            <tr><td>· generated samples</td><td class="num">${fmtBytes(chip.sampleBytes)}</td></tr>
            <tr><td>· imported samples</td><td class="num">${fmtBytes(chip.importBytes)}</td></tr>
            <tr><td>· empty module</td><td class="num">${fmtBytes(chip.modBytes)}</td></tr>
          </table>
        </section>
        <section>
          <h3>Per phase — bytes freed by deleting it</h3>
          <table><tr><th>instrument / phase</th><th class="num">freed</th></tr>${instrRows}</table>
        </section>
      </div>`;
    (overlay.querySelector('#size-breakdown-close') as HTMLButtonElement).addEventListener('click', close);
    overlay.classList.remove('hidden');

    // Total size.
    void exactSize(patch).then((r) => {
      if (gen !== generation) return;
      const cell = overlay.querySelector('#bd-total');
      if (cell) cell.textContent = r.ok ? `${fmtBytes(r.size!)} (${r.size} B)` : 'unavailable';
    });

    // Per-phase ablation deltas.
    for (const phases of byInstr.values()) {
      for (const p of phases) {
        void phaseCost(patch, p.instr, p.slot).then((r) => {
          if (gen !== generation) return;
          const cell = overlay.querySelector(`#${phaseId(p)}`);
          if (cell) cell.textContent = r.ok ? `−${fmtBytes(r.bytes!)}` : '—';
        });
      }
    }
  };

  return { open, close, isOpen };
}
