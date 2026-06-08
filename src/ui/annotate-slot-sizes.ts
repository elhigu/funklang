// src/ui/annotate-slot-sizes.ts
//
// Injects each slot's MARGINAL .bin code contribution into slot-grid rows. Same
// DOM traversal as updateSlotWaves (slot-grid.ts): `.slots > .slot-wrap > .slot`
// keyed by data-model-slot. Op-routine cost is shown only on the first patch-wide
// use of an op (firstUse), so reused ops read cheap; slots with variable operands
// read costlier. These marginals sum to the headline estimate.
import type { InstrumentBreakdown } from '../sizecalc/breakdown';
import { fmtBytes } from '../sizecalc/format';

export function annotateSlotSizes(host: HTMLElement, instr: InstrumentBreakdown): void {
  const slotsRoot = host.querySelector(':scope > .slots');
  if (!slotsRoot) return;
  const byModelIdx = new Map<number, InstrumentBreakdown['slots'][number]>();
  for (const sc of instr.slots) byModelIdx.set(sc.slotIdx, sc);

  const wraps = slotsRoot.querySelectorAll(':scope > .slot-wrap');
  for (const w of Array.from(wraps)) {
    const slotEl = (w as HTMLElement).querySelector(':scope > .slot') as HTMLElement | null;
    if (!slotEl) continue;
    const idxStr = slotEl.dataset['modelSlot'];
    if (idxStr === undefined) continue;
    const modelIdx = parseInt(idxStr, 10);
    const cost = byModelIdx.get(modelIdx);
    if (!cost) continue;

    let label = slotEl.querySelector('[data-slot-size]') as HTMLElement | null;
    if (!label) {
      label = document.createElement('span');
      label.className = 'slot-size';
      label.setAttribute('data-slot-size', '');
      slotEl.appendChild(label);
    }
    label.dataset['firstUse'] = cost.firstUse ? '1' : '0';
    const parts = [
      cost.firstUse ? `${fmtBytes(cost.routineBytes)} op routine (first use)` : 'op routine already counted',
      cost.varOperands > 0 ? `${cost.varOperands} variable operand(s)` : 'all-const',
    ];
    label.title = `~${fmtBytes(cost.marginalBytes)} marginal — ${parts.join(', ')}`;
    label.textContent = `~${fmtBytes(cost.marginalBytes)}`;
  }
}
