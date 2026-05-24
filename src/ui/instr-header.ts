// Per-instrument header: editable name + sampleLength / loopOffset / loopLength.
// Mutations go through the model so subscribers (slot grid, viewer) update.

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
  // Badge shows filled-slot count vs the UI cap, not the file-format cap.
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
        <label class="pair"><span class="k">loop ofs</span>
          <input data-id="instr-loopofs" type="number" class="meta-num" value="${ins.loopOffset}" /></label>
        <label class="pair"><span class="k">loop len</span>
          <input data-id="instr-looplen" type="number" class="meta-num" value="${ins.loopLength}" /></label>
        <span class="pair badge" data-id="slot-badge">${filled}/${N_SLOTS_EDITABLE}</span>
      </div>
    </div>
  `;

  const nameEl = root.querySelector('[data-id=instr-name]') as HTMLInputElement;
  const lenEl = root.querySelector('[data-id=instr-len]') as HTMLInputElement;
  const lofEl = root.querySelector('[data-id=instr-loopofs]') as HTMLInputElement;
  const llnEl = root.querySelector('[data-id=instr-looplen]') as HTMLInputElement;

  nameEl.addEventListener('input', () => {
    model.setInstrumentField(instrIdx, 'name', nameEl.value);
  });
  lenEl.addEventListener('input', () => {
    const v = parseInt(lenEl.value, 10);
    if (!Number.isFinite(v)) return;
    model.setInstrumentField(instrIdx, 'sampleLength', v);
  });
  lofEl.addEventListener('input', () => {
    const v = parseInt(lofEl.value, 10);
    if (!Number.isFinite(v)) return;
    model.setInstrumentField(instrIdx, 'loopOffset', v);
  });
  llnEl.addEventListener('input', () => {
    const v = parseInt(llnEl.value, 10);
    if (!Number.isFinite(v)) return;
    model.setInstrumentField(instrIdx, 'loopLength', v);
  });
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
