// The touch value tuner — a thumb-friendly modal for editing a slider's value
// when a finger (not a mouse) presses it. A 22px bar is hopeless under a
// fingertip, so this overlay gives:
//   - a big draggable slider for coarse moves;
//   - four "roller" strips (±1 / ±10 / ±100 / ±1000) that step the value with
//     rotary drags;
//   - swipe up/down to walk to the next/previous tunable param of the
//     instrument (the neighbour labels are shown dimmed above/below);
//   - a live waveform of the "tuned phase" that follows the value.
//
// Decoupled from the model: the caller supplies `apply` (write a value),
// `sealUndo` (one drag = one undo point), and `wave` (the tuned-phase tap).

import { makeKnob } from './knob';
import type { Knob } from './knob';
import { formatInt } from './number-format';
import { drawWaveform } from './waveform';
import { rollerNotches, applyRoller, swipeRows } from './roller';
import type { TunableParam } from './param-list';

/** Drag distance (px) per rotary notch. Touch-feel constant — tune on device. */
export const PX_PER_NOTCH = 22;
/** Vertical drag (px) per param when swiping to the next/previous slider. */
export const SWIPE_PX_PER_PARAM = 48;
/** The four roller magnitudes, biggest first (reads top-to-bottom). */
export const ROLLER_STEPS = [1000, 100, 10, 1] as const;

export interface TouchTunerOpts {
  /** Header context, e.g. "INSTR 01 · sv_flt_n". */
  title: string;
  /** Every tunable param of the instrument, in order (spine for swipe nav). */
  params: TunableParam[];
  /** Index into `params` to open on. */
  activeIndex: number;
  /** Write `value` to the given param (caller does the live re-render). */
  apply: (p: TunableParam, value: number) => void;
  /** Called on each drag end (finger lift) so one gesture = one undo point. */
  sealUndo: () => void;
  /** Current display tap for a param's slot — the "tuned phase". */
  wave?: ((p: TunableParam) => Int16Array) | undefined;
  /** Called after the overlay is torn down. */
  onClose?: (() => void) | undefined;
}

export interface TouchTuner {
  close: () => void;
  /** The active param value (for tests / external reads). */
  value: () => number;
  /** The active param index (for tests). */
  index: () => number;
}

export function openTouchTuner(root: HTMLElement, opts: TouchTunerOpts): TouchTuner {
  const { params } = opts;
  if (!params[opts.activeIndex]) return { close: () => {}, value: () => 0, index: () => -1 };

  let activeIndex = opts.activeIndex;
  let param: TunableParam = params[activeIndex]!;
  let current = param.value;
  let slider: Knob | null = null;

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
      <div class="tt-wave" data-tt-wave><canvas data-tt-wave-cv width="420" height="84"></canvas></div>
      <div class="tt-nav" data-tt-nav>
        <div class="tt-neighbour" data-tt-prev></div>
        <div class="tt-active">
          <span class="tt-pname" data-tt-pname></span>
          <span class="tt-value" data-tt-value></span>
        </div>
        <div class="tt-neighbour" data-tt-next></div>
      </div>
      <div class="tt-slider" data-tt-slider></div>
      <div class="tt-rollers" data-tt-rollers></div>
    </div>`;
  root.appendChild(overlay);

  const $ = <T extends HTMLElement>(sel: string): T => overlay.querySelector(sel) as T;
  const valueEl = $('[data-tt-value]');
  const pnameEl = $('[data-tt-pname]');
  const prevEl = $('[data-tt-prev]');
  const nextEl = $('[data-tt-next]');
  const sliderHost = $('[data-tt-slider]');
  const rollersHost = $('[data-tt-rollers]');
  const waveCv = $<HTMLCanvasElement>('[data-tt-wave-cv]');

  const redrawWave = (): void => {
    if (!opts.wave) return;
    drawWaveform(waveCv, opts.wave(param), { width: waveCv.width, height: waveCv.height });
  };

  // Write a new value to the active param + reflect it everywhere. `fromSlider`
  // avoids echoing the value back into the slider that just produced it.
  const setCurrent = (v: number, fromSlider: boolean): void => {
    const clamped = Math.max(param.min, Math.min(param.max, v));
    if (clamped === current) return;
    current = clamped;
    valueEl.textContent = formatInt(current);
    opts.apply(param, current);
    if (!fromSlider && slider) slider.setValue(current);
    redrawWave();
  };

  // (Re)build everything tied to the ACTIVE param — used on open and on swipe.
  const mountActive = (index: number): void => {
    const len = params.length;
    activeIndex = ((index % len) + len) % len;
    param = params[activeIndex]!;
    current = param.value;

    pnameEl.textContent = param.label;
    valueEl.textContent = formatInt(current);
    // Dimmed neighbour labels (blank when there's only one param).
    prevEl.textContent = len > 1 ? params[((activeIndex - 1) % len + len) % len]!.label : '';
    nextEl.textContent = len > 1 ? params[(activeIndex + 1) % len]!.label : '';

    // Fresh slider for the new range/scale (finger-draggable; no onTouchTune).
    sliderHost.innerHTML = '';
    slider = makeKnob({
      label: '', value: current, min: param.min, max: param.max,
      step: param.step, scale: param.scale, onChange: (v) => setCurrent(v, true),
    });
    slider.el.classList.add('tt-knob');
    slider.el.addEventListener('pointerup', () => opts.sealUndo());
    slider.el.addEventListener('pointercancel', () => opts.sealUndo());
    sliderHost.appendChild(slider.el);

    // Fresh rollers bound to the new range.
    rollersHost.innerHTML = '';
    for (const step of ROLLER_STEPS) {
      rollersHost.appendChild(makeRoller(step, () => current,
        (v) => setCurrent(v, false), { min: param.min, max: param.max }, opts.sealUndo));
    }
    redrawWave();
  };

  // ── swipe up/down → next/previous param ─────────────────────────────────
  // The nav strip (label + neighbours) is the swipe zone; the slider drags
  // horizontally and the rollers vertically, so neither conflicts.
  const nav = $('[data-tt-nav]');
  let swActive = false, swPid = -1, swStartY = 0;
  nav.addEventListener('pointerdown', (e) => {
    swActive = true; swPid = e.pointerId; swStartY = e.clientY;
    try { nav.setPointerCapture(e.pointerId); } catch { /* jsdom */ }
  });
  const swipeEnd = (e: PointerEvent): void => {
    if (!swActive || e.pointerId !== swPid) return;
    swActive = false; swPid = -1;
    const rows = swipeRows(swStartY - e.clientY, SWIPE_PX_PER_PARAM);  // up = next
    if (rows !== 0) mountActive(activeIndex + rows);
  };
  nav.addEventListener('pointerup', swipeEnd);
  nav.addEventListener('pointercancel', swipeEnd);

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
  overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(); });
  $('#touch-tuner-close').addEventListener('click', close);

  mountActive(activeIndex);
  return { close, value: () => current, index: () => activeIndex };
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

  let active = false, pid = -1, startY = 0, startVal = 0;
  el.addEventListener('pointerdown', (e) => {
    active = true; pid = e.pointerId; startY = e.clientY; startVal = getCurrent();
    try { el.setPointerCapture(e.pointerId); } catch { /* jsdom */ }
    e.preventDefault();
    el.classList.add('active');
  });
  el.addEventListener('pointermove', (e) => {
    if (!active || e.pointerId !== pid) return;
    const notches = rollerNotches(startY - e.clientY, PX_PER_NOTCH);  // up-positive
    apply(applyRoller(startVal, notches, step, range.min, range.max));
  });
  const end = (e: PointerEvent): void => {
    if (e.pointerId !== pid) return;
    active = false; pid = -1;
    el.classList.remove('active');
    sealUndo();
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  return el;
}
