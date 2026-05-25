// Per-instrument header: editable name + sampleLength + slot-count badge.
//
// The loop region (loopOffset / loopLength) is no longer surfaced here.
// loopLength is derived (sampleLength − loopOffset, see loop-rules) and
// loopOffset belongs to the loop_gen slot (op22) — adjustable from the
// slot's own knob or by dragging the loop band in the wave-viewer.
//
// All mutations route through the model so subscribers (slot grid,
// viewer) update via the events bus.

import type { PatchModel } from '../patch/model';
import { N_SLOTS_EDITABLE } from '../patch/types';

export function renderInstrHeader(
  root: HTMLElement,
  model: PatchModel,
  instrIdx: number,
): void {
  const ins = model.patch.instruments[instrIdx];
  if (!ins) {
    root.innerHTML = '';
    return;
  }
  const num = String(instrIdx + 1).padStart(2, '0');
  const filled = ins.slots.reduce((n, s) => n + (s.fn !== 0 ? 1 : 0), 0);
  root.innerHTML = `
    <div class="instr-header">
      <div class="instr-title">
        <span class="label">INSTRUMENT</span>
        <span class="label" data-id="instr-num">${num}</span>
        <input data-id="instr-name" class="instr-name-input" value="${escapeHtmlAttr(ins.name)}" />
      </div>
      <div class="instr-meta">
        <label class="pair"><span class="k">length</span>
          <input data-id="instr-len" type="number" class="meta-num" value="${ins.sampleLength}" /></label>
        <span class="pair badge" data-id="slot-badge">${filled}/${N_SLOTS_EDITABLE}</span>
      </div>
    </div>
  `;

  const nameEl = root.querySelector('[data-id=instr-name]') as HTMLInputElement;
  const lenEl  = root.querySelector('[data-id=instr-len]')  as HTMLInputElement;

  nameEl.addEventListener('input', () => {
    model.setInstrumentField(instrIdx, 'name', nameEl.value);
  });
  lenEl.addEventListener('input', () => {
    const v = parseInt(lenEl.value, 10);
    if (!Number.isFinite(v)) return;
    // sampleLength is always even (Klang requirement). Round down to
    // the nearest even value on each keystroke.
    const even = v - (v & 1);
    model.setInstrumentField(instrIdx, 'sampleLength', even);
  });
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
