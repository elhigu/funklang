// src/ui/annotate-slot-sizes.ts
//
// Injects a per-slot RELATIVE op weight into slot-grid rows. Same DOM
// traversal as updateSlotWaves (slot-grid.ts): `.slots > .slot-wrap > .slot`
// keyed by data-model-slot. The .bin is sub-additive (ops share code), so this
// is a relative "how heavy is this op" hint, not an exact byte contribution.
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
    label.title = `~${fmtBytes(cost.weight)} relative op weight (ops share code in the .bin; the headline total is patch-wide and approximate)`;
    label.textContent = `~${fmtBytes(cost.weight)}`;
  }
}
