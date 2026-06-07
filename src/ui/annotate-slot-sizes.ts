// src/ui/annotate-slot-sizes.ts
//
// Injects the per-slot marginal byte cost into slot-grid rows. Same DOM
// traversal as updateSlotWaves (slot-grid.ts): `.slots > .slot-wrap > .slot`
// keyed by data-model-slot. The op-code cost is shown only on the first
// patch-wide use of each op (firstUse), so reused ops read near-free.
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
    label.title = cost.firstUse
      ? `${fmtBytes(cost.codeBytes)} op code (first use) + ${fmtBytes(cost.streamBytes)} stream`
      : `${fmtBytes(cost.streamBytes)} stream (op code already counted)`;
    label.textContent = fmtBytes(cost.marginalBytes);
  }
}
