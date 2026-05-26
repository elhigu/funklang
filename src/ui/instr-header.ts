// Per-instrument header: editable name + sampleLength (number + slider)
// + slot-count badge + per-instrument IMPORT/EXPORT .AKI buttons.
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
import { formatInt, parseFlexInt } from './number-format';

export interface InstrHeaderHandlers {
  /** Called when the user clicks IMPORT .AKI in this header. */
  onImportAki?: (() => void) | undefined;
  /** Called when the user clicks EXPORT .AKI in this header. */
  onExportAki?: (() => void) | undefined;
}

/** Soft upper bound for the sample-length slider. The on-disk field is
 *  i32 so anything up to ~2GB is technically valid, but a usable slider
 *  has to cap somewhere. Even values only — Klang requires it. */
const SAMPLE_LENGTH_SLIDER_MAX = 65534;

export function renderInstrHeader(
  root: HTMLElement,
  model: PatchModel,
  instrIdx: number,
  handlers: InstrHeaderHandlers = {},
): void {
  const ins = model.patch.instruments[instrIdx];
  if (!ins) {
    root.innerHTML = '';
    return;
  }
  const num = String(instrIdx + 1).padStart(2, '0');
  const filled = ins.slots.reduce((n, s) => n + (s.fn !== 0 ? 1 : 0), 0);
  // Show the slider in dec for predictability — hex on a 0..65k slider
  // would just be confusing. The number input next to it follows the
  // global display base.
  const lenDisplay = formatInt(ins.sampleLength);
  root.innerHTML = `
    <div class="instr-header">
      <div class="instr-title">
        <span class="label">INSTRUMENT</span>
        <span class="label" data-id="instr-num">${num}</span>
        <input data-id="instr-name" class="instr-name-input" value="${escapeHtmlAttr(ins.name)}" />
        <button class="instr-aki-btn" data-id="aki-import" title="Replace this instrument with one loaded from a .aki file">IMPORT&nbsp;.AKI</button>
        <button class="instr-aki-btn" data-id="aki-export" title="Save this instrument as a standalone .aki file">EXPORT&nbsp;.AKI</button>
      </div>
      <div class="instr-meta">
        <label class="pair length-pair"><span class="k">length</span>
          <input data-id="instr-len" type="text" class="meta-num" value="${escapeHtmlAttr(lenDisplay)}" />
          <input data-id="instr-len-slider" type="range" min="0" max="${SAMPLE_LENGTH_SLIDER_MAX}" step="2" value="${ins.sampleLength}" class="meta-slider" />
        </label>
        <span class="pair badge" data-id="slot-badge">${filled}/${N_SLOTS_EDITABLE}</span>
      </div>
    </div>
  `;

  const nameEl  = root.querySelector('[data-id=instr-name]')        as HTMLInputElement;
  const lenEl   = root.querySelector('[data-id=instr-len]')         as HTMLInputElement;
  const slideEl = root.querySelector('[data-id=instr-len-slider]')  as HTMLInputElement;
  const impBtn  = root.querySelector('[data-id=aki-import]')        as HTMLButtonElement;
  const expBtn  = root.querySelector('[data-id=aki-export]')        as HTMLButtonElement;

  nameEl.addEventListener('input', () => {
    model.setInstrumentField(instrIdx, 'name', nameEl.value);
  });
  attachCommitOnEnter(nameEl);

  // Number field: accepts decimal OR `0x...` hex (per the global parser
  // — so the user can paste a hex value even when the global display is
  // dec). Live commits on input so undo coalescing groups keystrokes.
  lenEl.addEventListener('input', () => {
    const v = parseFlexInt(lenEl.value);
    if (!Number.isFinite(v)) return;
    const even = (v | 0) - ((v | 0) & 1);   // even, Klang requirement
    model.setInstrumentField(instrIdx, 'sampleLength', Math.max(0, even));
    slideEl.value = String(Math.max(0, even));
  });
  attachCommitOnEnter(lenEl);

  // Slider mirrors the number field. The slider's `step=2` means it's
  // always emitting even values; no extra clamping required.
  slideEl.addEventListener('input', () => {
    const v = parseInt(slideEl.value, 10);
    if (!Number.isFinite(v)) return;
    model.setInstrumentField(instrIdx, 'sampleLength', v);
    lenEl.value = formatInt(v);
  });

  if (handlers.onImportAki) impBtn.addEventListener('click', () => handlers.onImportAki?.());
  else impBtn.disabled = true;
  if (handlers.onExportAki) expBtn.addEventListener('click', () => handlers.onExportAki?.());
  else expBtn.disabled = true;
}

/**
 * Enter-to-commit-and-blur: pressing Enter while an input is focused
 * removes focus, which fires `change`/`blur` so any pending commits
 * land. User-stated UX rule: Enter should always feel like "done."
 */
function attachCommitOnEnter(input: HTMLInputElement): void {
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    }
  });
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
