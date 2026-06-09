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
import { makeKnob } from './knob';

export interface InstrHeaderHandlers {
  /** Called when the user clicks IMPORT .AKI in this header. */
  onImportAki?: (() => void) | undefined;
  /** Called when the user clicks EXPORT .AKI in this header. */
  onExportAki?: (() => void) | undefined;
  /** Called when the user clicks REMOVE. The host runs the confirm
   *  dialog and the reset — this widget just dispatches the intent. */
  onRemove?: (() => void) | undefined;
}

/** Soft upper bound for the sample-length knob. The on-disk field is
 *  i32 so anything up to ~2GB is technically valid, but a usable
 *  horizontal knob has to cap somewhere. Even values only — Klang
 *  requires it, enforced by the knob's `step: 2`. */
const SAMPLE_LENGTH_KNOB_MAX = 65534;

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
  // "Empty / never-touched" = no slots, no name, no length. Length
  // controls (number field + slider) are disabled in that state so the
  // user can't put a sample length on an instrument that has nothing
  // to sample yet — inserting the first slot auto-applies the 12 KB
  // default, which is what re-enables the controls.
  const isUntouched = filled === 0 && !ins.name && ins.sampleLength === 0;
  root.innerHTML = `
    <div class="instr-header">
      <div class="instr-title">
        <span class="label">INSTRUMENT</span>
        <span class="label" data-id="instr-num">${num}</span>
        <input data-id="instr-name" class="instr-name-input" value="${escapeHtmlAttr(ins.name)}" />
        <div class="instr-menu" data-id="instr-menu">
          <button class="instr-menu-btn" data-id="instr-menu-toggle" title="Instrument actions: import / export / remove" aria-haspopup="true" aria-expanded="false">⋯</button>
          <div class="instr-menu-items">
            <button class="instr-aki-btn" data-id="aki-import" title="Replace this instrument with one loaded from a .aki file">IMPORT&nbsp;.AKI</button>
            <button class="instr-aki-btn" data-id="aki-export" title="Save this instrument as a standalone .aki file">EXPORT&nbsp;.AKI</button>
            <button class="instr-aki-btn instr-remove-btn" data-id="instr-remove" title="Wipe this instrument back to empty (asks for confirmation)">REMOVE</button>
          </div>
        </div>
      </div>
      <div class="instr-meta">
        <span class="pair length-pair${isUntouched ? ' disabled' : ''}" data-id="instr-len-host"></span>
        <span class="pair badge" data-id="slot-badge">${filled}/${N_SLOTS_EDITABLE}</span>
      </div>
    </div>
  `;

  const nameEl  = root.querySelector('[data-id=instr-name]')   as HTMLInputElement;
  const lenHost = root.querySelector('[data-id=instr-len-host]') as HTMLElement;
  const menu    = root.querySelector('[data-id=instr-menu]')   as HTMLElement;
  const menuTog = root.querySelector('[data-id=instr-menu-toggle]') as HTMLButtonElement;
  const impBtn  = root.querySelector('[data-id=aki-import]')   as HTMLButtonElement;
  const expBtn  = root.querySelector('[data-id=aki-export]')   as HTMLButtonElement;
  const rmBtn   = root.querySelector('[data-id=instr-remove]') as HTMLButtonElement;

  // Import / Export / Remove live behind a ⋯ menu so they don't crowd the
  // name + length. Open on the toggle; an outside pointerdown closes (the
  // listener self-removes, so re-renders don't leak it). Picking an action
  // re-renders the header, which disposes the menu.
  const setMenuOpen = (open: boolean): void => {
    menu.classList.toggle('open', open);
    menuTog.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) document.addEventListener('pointerdown', onDocDown, true);
    else document.removeEventListener('pointerdown', onDocDown, true);
  };
  function onDocDown(e: PointerEvent): void {
    if (!menu.contains(e.target as Node)) setMenuOpen(false);
  }
  menuTog.addEventListener('click', (e) => {
    e.stopPropagation();
    setMenuOpen(!menu.classList.contains('open'));
  });

  nameEl.addEventListener('input', () => {
    model.setInstrumentField(instrIdx, 'name', nameEl.value);
  });
  attachCommitOnEnter(nameEl);

  // Sample length is now a `makeKnob` — same widget the slot rows use.
  // step=2 makes wheel / arrow / drag / numeric editor all snap to
  // even values, so the Klang invariant is enforced at the UI layer
  // and we get the hex/dec display, Enter-to-commit, drag-to-position
  // and logarithmic coarse step for free.
  const lenKnob = makeKnob({
    label: 'length',
    value: ins.sampleLength,
    min: 0,
    max: SAMPLE_LENGTH_KNOB_MAX,
    step: 2,
    onChange: (v) => model.setInstrumentField(instrIdx, 'sampleLength', v),
  });
  if (isUntouched) {
    lenKnob.el.classList.add('knob-disabled');
    // Block every interaction surface — pointer-events:none lets the
    // hover state stay quiet too.
    (lenKnob.el.querySelector('.kbar') as HTMLElement | null)?.setAttribute('tabindex', '-1');
    lenKnob.el.style.pointerEvents = 'none';
  }
  lenHost.appendChild(lenKnob.el);

  if (handlers.onImportAki) impBtn.addEventListener('click', () => handlers.onImportAki?.());
  else impBtn.disabled = true;
  if (handlers.onExportAki) expBtn.addEventListener('click', () => handlers.onExportAki?.());
  else expBtn.disabled = true;
  if (handlers.onRemove) {
    rmBtn.addEventListener('click', () => handlers.onRemove?.());
    // Greyed-out if the instrument is already empty — nothing to remove.
    const filled = ins.slots.some((s) => s.fn !== 0);
    if (!filled && !ins.name && ins.sampleLength === 0) rmBtn.disabled = true;
  } else {
    rmBtn.disabled = true;
  }
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
