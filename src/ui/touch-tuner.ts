// The touch value tuner — a thumb-friendly modal for editing a slider's value
// when a finger (not a mouse) presses it. A 22px bar is hopeless under a
// fingertip, so this overlay gives:
//   - the whole PHASE (the active slot) laid out as a list of its tunable
//     params; the selected one is emphasised and gets the live controls;
//   - a big draggable slider for coarse moves;
//   - three "roller" strips (±1 / ±10 / ±100) that step the value with rotary
//     drags (±1 first — the most-used);
//   - swipe up/down to walk to the next/previous param across the instrument;
//     when that crosses into another slot the model's selected phase follows
//     (via onActiveChange);
//   - a live waveform of the "tuned phase" that follows the value.
//
// Decoupled from the model: the caller supplies `apply` (write a value),
// `sealUndo` (one drag = one undo point), `wave` (the tuned-phase tap), and
// `onActiveChange` (sync the editor's selected slot).

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
/** Below this much travel a press counts as a tap (row select), not a swipe. */
export const TAP_SLOP_PX = 8;
/** Roller magnitudes, ±1 first (most used); ±1000 dropped as unnecessary. */
export const ROLLER_STEPS = [1, 10, 100] as const;

export interface TouchTunerOpts {
  /** Header context, e.g. "INSTR 01 · sv_flt_n". */
  title: string;
  /** Every tunable param of the instrument, in (slot, param) order. */
  params: TunableParam[];
  /** Index into `params` to open on. */
  activeIndex: number;
  /** Write `value` to the given param (caller does the live re-render). */
  apply: (p: TunableParam, value: number) => void;
  /** Called on each drag end (finger lift) so one gesture = one undo point. */
  sealUndo: () => void;
  /** Current display tap for a param's slot — the "tuned phase". */
  wave?: ((p: TunableParam) => Int16Array) | undefined;
  /** The active param's slot changed — sync the editor's selected phase. */
  onActiveChange?: ((slotIdx: number) => void) | undefined;
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
  let mountedSlot = -1;                     // last slot we told the caller about
  let slider: Knob | null = null;
  let activeRowVal: HTMLElement | null = null;
  // Live values for THIS session (the params list is a snapshot), so every
  // phase row shows the up-to-date number as the user tunes.
  const live = new Map<number, number>();
  const valOf = (i: number): number => live.has(i) ? live.get(i)! : params[i]!.value;

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
      <div class="tt-phase" data-tt-phase></div>
      <div class="tt-active-value" data-tt-value></div>
      <div class="tt-slider" data-tt-slider></div>
      <div class="tt-rollers" data-tt-rollers></div>
    </div>`;
  root.appendChild(overlay);

  const $ = <T extends HTMLElement>(sel: string): T => overlay.querySelector(sel) as T;
  const valueEl = $('[data-tt-value]');
  const phaseEl = $('[data-tt-phase]');
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
    if (clamped === valOf(activeIndex)) return;
    live.set(activeIndex, clamped);
    valueEl.textContent = formatInt(clamped);
    if (activeRowVal) activeRowVal.textContent = formatInt(clamped);
    opts.apply(param, clamped);
    if (!fromSlider && slider) slider.setValue(clamped);
    redrawWave();
  };

  // (Re)build everything tied to the ACTIVE param — used on open / swipe / tap.
  const mountActive = (index: number): void => {
    const len = params.length;
    activeIndex = ((index % len) + len) % len;
    param = params[activeIndex]!;
    const current = valOf(activeIndex);

    // The phase = the active slot. List all of its tunable params; emphasise
    // the selected one. Rows carry their full-list index for tap-to-select.
    phaseEl.innerHTML = '';
    activeRowVal = null;
    for (let i = 0; i < len; i++) {
      if (params[i]!.slotIdx !== param.slotIdx) continue;
      const row = document.createElement('div');
      row.className = 'tt-prow' + (i === activeIndex ? ' active' : '');
      row.dataset['idx'] = String(i);
      row.innerHTML = `<span class="tt-prow-name">${params[i]!.label}</span>
        <span class="tt-prow-val">${formatInt(valOf(i))}</span>`;
      phaseEl.appendChild(row);
      if (i === activeIndex) activeRowVal = row.querySelector('.tt-prow-val');
    }

    valueEl.textContent = formatInt(current);

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
      rollersHost.appendChild(makeRoller(step, () => valOf(activeIndex),
        (v) => setCurrent(v, false), { min: param.min, max: param.max }, opts.sealUndo));
    }
    redrawWave();

    // Sync the editor's selected phase when the slot changes.
    if (param.slotIdx !== mountedSlot) {
      mountedSlot = param.slotIdx;
      opts.onActiveChange?.(param.slotIdx);
    }
  };

  // ── swipe (next/prev param) + tap (select a phase row) ──────────────────
  // A vertical drag past TAP_SLOP swipes through params (crossing into the
  // next slot rebuilds the phase + moves the model selection). A tap on a row
  // selects that param. The slider drags horizontally and rollers vertically,
  // so neither conflicts with the phase-list gesture.
  let swPid = -1, swStartY = 0;
  phaseEl.addEventListener('pointerdown', (e) => {
    swPid = e.pointerId; swStartY = e.clientY;
    try { phaseEl.setPointerCapture(e.pointerId); } catch { /* jsdom */ }
  });
  const swipeEnd = (e: PointerEvent): void => {
    if (e.pointerId !== swPid) return;
    swPid = -1;
    const dy = swStartY - e.clientY;
    const rows = swipeRows(dy, SWIPE_PX_PER_PARAM);    // up = next
    if (rows !== 0) { mountActive(activeIndex + rows); return; }
    if (Math.abs(dy) <= TAP_SLOP_PX) {                 // a tap → select that row
      const row = (e.target as HTMLElement).closest('.tt-prow') as HTMLElement | null;
      const idx = row?.dataset['idx'];
      if (idx != null) mountActive(parseInt(idx, 10));
    }
  };
  phaseEl.addEventListener('pointerup', swipeEnd);
  phaseEl.addEventListener('pointercancel', swipeEnd);

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
  return { close, value: () => valOf(activeIndex), index: () => activeIndex };
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
