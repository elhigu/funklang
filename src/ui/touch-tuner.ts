// The touch value tuner — a thumb-friendly modal for editing a slider's value
// when a finger (not a mouse) presses it. A 22px bar is hopeless under a
// fingertip, so this overlay gives: a big draggable slider for coarse moves,
// and four "roller" strips (±1 / ±10 / ±100 / ±1000) that step the value with
// rotary drags. (Swipe-to-next-param and the live waveform land in later
// increments; the API already carries the full param list + active index.)
//
// Decoupled from the model: the caller supplies `apply` (write a value) and
// `sealUndo` (called on each drag end, so one drag = one undo point).

import { makeKnob } from './knob';
import type { Knob } from './knob';
import { formatInt } from './number-format';
import { rollerNotches, applyRoller } from './roller';
import type { TunableParam } from './param-list';

/** Drag distance (px) per rotary notch. Touch-feel constant — tune on device. */
export const PX_PER_NOTCH = 22;

/** The four roller magnitudes, biggest first (reads top-to-bottom / left-right). */
export const ROLLER_STEPS = [1000, 100, 10, 1] as const;

export interface TouchTunerOpts {
  /** Header context, e.g. "INSTR 01 · slot 04 · sv_flt_n". */
  title: string;
  /** Every tunable param of the instrument (spine for swipe nav, later). */
  params: TunableParam[];
  /** Index into `params` to open on. */
  activeIndex: number;
  /** Write `value` to the given param (caller does the live re-render). */
  apply: (p: TunableParam, value: number) => void;
  /** Called on each drag end (finger lift) so one gesture = one undo point. */
  sealUndo: () => void;
  /** Called after the overlay is torn down. */
  onClose?: (() => void) | undefined;
}

export interface TouchTuner {
  close: () => void;
  /** The active param value (for tests / external reads). */
  value: () => number;
}

export function openTouchTuner(root: HTMLElement, opts: TouchTunerOpts): TouchTuner {
  const param = opts.params[opts.activeIndex];
  if (!param) return { close: () => {}, value: () => 0 };

  let current = param.value;

  const overlay = document.createElement('div');
  overlay.id = 'touch-tuner-overlay';
  overlay.className = 'touch-tuner-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = `
    <div class="tt-panel">
      <div class="tt-head">
        <span class="tt-title">${opts.title}</span>
        <button class="tt-close" id="touch-tuner-close" aria-label="Done">Done</button>
      </div>
      <div class="tt-wave" data-tt-wave><!-- live waveform (later increment) --></div>
      <div class="tt-active">
        <span class="tt-pname">${param.label}</span>
        <span class="tt-value" data-tt-value>${formatInt(current)}</span>
      </div>
      <div class="tt-slider" data-tt-slider></div>
      <div class="tt-rollers" data-tt-rollers></div>
    </div>`;
  root.appendChild(overlay);

  const valueEl = overlay.querySelector('[data-tt-value]') as HTMLElement;

  // ── teardown ────────────────────────────────────────────────────────────
  let closed = false;
  const close = (): void => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
    opts.onClose?.();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
  };
  document.addEventListener('keydown', onKey, true);
  // Tap the backdrop (outside the panel) to close.
  overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(); });
  (overlay.querySelector('#touch-tuner-close') as HTMLButtonElement)
    .addEventListener('click', close);

  // ── value plumbing ──────────────────────────────────────────────────────
  // setCurrent updates the model + the readout; `fromSlider` avoids echoing
  // the value back into the slider that just produced it.
  let slider: Knob | null = null;
  const setCurrent = (v: number, fromSlider: boolean): void => {
    const clamped = Math.max(param.min, Math.min(param.max, v));
    if (clamped === current) return;
    current = clamped;
    valueEl.textContent = formatInt(current);
    opts.apply(param, current);
    if (!fromSlider && slider) slider.setValue(current);
  };

  // ── big slider (reuse makeKnob; no onTouchTune → finger drags it) ────────
  slider = makeKnob({
    label: '',
    value: current,
    min: param.min,
    max: param.max,
    step: param.step,
    scale: param.scale,
    onChange: (v) => setCurrent(v, true),
  });
  slider.el.classList.add('tt-knob');
  (overlay.querySelector('[data-tt-slider]') as HTMLElement).appendChild(slider.el);
  // The slider drag is itself a gesture → seal its own undo point on lift.
  slider.el.addEventListener('pointerup', () => opts.sealUndo());
  slider.el.addEventListener('pointercancel', () => opts.sealUndo());

  // ── rollers (rotary stepping) ───────────────────────────────────────────
  const rollersHost = overlay.querySelector('[data-tt-rollers]') as HTMLElement;
  for (const step of ROLLER_STEPS) {
    rollersHost.appendChild(makeRoller(step, () => current,
      (v) => setCurrent(v, false), { min: param.min, max: param.max }, opts.sealUndo));
  }

  return { close, value: () => current };
}

/**
 * One roller strip. Drag up = increase, down = decrease; every PX_PER_NOTCH of
 * travel applies one `step`. Value is computed absolutely from the drag start,
 * so speed doesn't matter and there's no drift.
 */
function makeRoller(
  step: number,
  getCurrent: () => number,
  apply: (v: number) => void,
  range: { min: number; max: number },
  sealUndo: () => void,
): HTMLElement {
  const el = document.createElement('div');
  el.className = 'tt-roller';
  el.dataset['step'] = String(step);
  el.innerHTML = `<span class="tt-roller-up">▲</span>
    <span class="tt-roller-mag">±${step}</span>
    <span class="tt-roller-dn">▼</span>`;

  let active = false;
  let pid = -1;
  let startY = 0;
  let startVal = 0;
  el.addEventListener('pointerdown', (e) => {
    active = true; pid = e.pointerId; startY = e.clientY; startVal = getCurrent();
    try { el.setPointerCapture(e.pointerId); } catch { /* jsdom */ }
    e.preventDefault();
    el.classList.add('active');
  });
  el.addEventListener('pointermove', (e) => {
    if (!active || e.pointerId !== pid) return;
    const dragPx = startY - e.clientY;                 // up-positive
    const notches = rollerNotches(dragPx, PX_PER_NOTCH);
    apply(applyRoller(startVal, notches, step, range.min, range.max));
  });
  const end = (e: PointerEvent): void => {
    if (e.pointerId !== pid) return;
    active = false; pid = -1;
    el.classList.remove('active');
    sealUndo();                                        // one drag = one undo
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  return el;
}
