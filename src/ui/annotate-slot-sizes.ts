// src/ui/annotate-slot-sizes.ts
//
// Annotates each slot/phase with how much .bin code DELETING it would free, in
// the current patch context. Same DOM traversal as updateSlotWaves (slot-grid.ts):
// `.slots > .slot-wrap > .slot` keyed by data-model-slot. The freed amount is
// contextual: an op's shared routine is only freed when its LAST use is removed,
// so deleting one of two reverb phases frees just the connection — and the other
// phase's label jumps up (it now owns the routine). Recomputed on every edit.
import type { Patch } from '../patch/types';
import type { CalibrationData } from '../sizecalc/calibration-data';
import { phaseMarginal } from '../sizecalc/marginal';
import { opByCode } from '../schema/op-metadata';
import { fmtBytes } from '../sizecalc/format';

export function annotateSlotSizes(host: HTMLElement, patch: Patch, instrIdx: number, cal: CalibrationData): void {
  const slotsRoot = host.querySelector(':scope > .slots');
  if (!slotsRoot) return;
  const wraps = slotsRoot.querySelectorAll(':scope > .slot-wrap');
  for (const w of Array.from(wraps)) {
    const slotEl = (w as HTMLElement).querySelector(':scope > .slot') as HTMLElement | null;
    if (!slotEl) continue;
    const idxStr = slotEl.dataset['modelSlot'];
    if (idxStr === undefined) continue;
    const m = phaseMarginal(patch, instrIdx, parseInt(idxStr, 10), cal);
    if (!m) continue;

    let label = slotEl.querySelector('[data-slot-size]') as HTMLElement | null;
    if (!label) {
      label = document.createElement('span');
      label.className = 'slot-size';
      label.setAttribute('data-slot-size', '');
      slotEl.appendChild(label);
    }
    label.dataset['lastUse'] = m.lastUse ? '1' : '0';
    label.textContent = `−${fmtBytes(m.freed)}`;
    const opName = opByCode(m.fn)?.name ?? `op${m.fn}`;
    label.title = m.lastUse
      ? `Deleting frees ~${fmtBytes(m.freed)}: ${opName} routine ~${fmtBytes(m.routine)} (last use — not shared by any other phase) + connection ~${fmtBytes(m.connection)}` +
        (m.varBytes ? ` + variable operands ~${fmtBytes(m.varBytes)}` : '')
      : `Deleting frees ~${fmtBytes(m.freed)}: just this phase's connection (~${fmtBytes(m.connection)}` +
        (m.varBytes ? ` + variable operands ~${fmtBytes(m.varBytes)}` : '') +
        `). ${opName}'s routine ~${fmtBytes(m.routine)} stays — shared by ${m.opUses - 1} other phase${m.opUses - 1 === 1 ? '' : 's'}.`;
  }
}
