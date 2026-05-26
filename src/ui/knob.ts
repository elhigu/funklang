// Horizontal slider knob: label on the left, a wide CSS-rendered track in
// the middle (clickable + draggable to set value by X position), value on
// the right. The track is focusable; ArrowUp/ArrowDown fine-tune ±1, wheel
// steps ±1, dblclick opens a numeric <input> for exact entry, right-click
// resets to default.

import { formatInt, parseFlexInt } from './number-format';

export interface KnobOptions {
  label: string;
  value: number;
  min?: number | undefined;
  max?: number | undefined;
  defaultValue?: number | undefined;
  /**
   * Granularity of legal values, defaulting to 1. When `step > 1` every
   * source of mutation (wheel, arrow keys, drag-to-position, numeric
   * editor) snaps to the nearest multiple of `step`, AND the fine /
   * Shift modifier moves by `step` instead of ±1 — so loop_gen offset
   * (step = 2) feels right: even values only, even on Shift+wheel.
   */
  step?: number | undefined;
  /**
   * Position-to-value mapping for the draggable bar. `'linear'`
   * (default) is the classic uniform mapping. `'log'` gives small
   * values a much bigger slice of the bar — useful for parameters like
   * audio frequency where 5..50 Hz needs as much real-estate as
   * 5000..10000 Hz. Wheel / arrow stepping is unaffected (those still
   * move by additive `coarseStep` / `shiftStep`).
   *
   * Only valid for ranges where min >= 0; mixed-sign log mapping is
   * not well defined, so we silently fall back to linear in that case.
   */
  scale?: 'linear' | 'log' | undefined;
  /** Legacy: ignored. Drag is now position-based (click X → value at that ratio). */
  coarsePxPerUnit?: number | undefined;
  /** Legacy: ignored. */
  finePxPerUnit?: number | undefined;
  onChange: (v: number) => void;
}

export interface Knob {
  el: HTMLElement;
  setValue(v: number): void;
  getValue(): number;
  destroy(): void;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function makeKnob(opts: KnobOptions): Knob {
  const min = opts.min ?? 0;
  const max = opts.max ?? 255;
  const defaultValue = opts.defaultValue ?? 0;
  const range = max - min;
  const step = Math.max(1, Math.round(opts.step ?? 1));
  // Log scale only kicks in when the range is entirely non-negative
  // (mixed-sign log is undefined). +1 below the log so a min of 0
  // doesn't blow up to -Infinity.
  const useLog = opts.scale === 'log' && min >= 0 && max > min;
  const LOG_OFFSET = 1;
  const logMinV = Math.log(min + LOG_OFFSET);
  const logMaxV = Math.log(max + LOG_OFFSET);
  const logSpan = logMaxV - logMinV;

  /** value → ratio in [0, 1] for paint + drag mirror. */
  const valueToRatio = (v: number): number => {
    if (range <= 0) return 0;
    if (useLog) {
      const r = (Math.log(Math.max(min, v) + LOG_OFFSET) - logMinV) / logSpan;
      return clamp(r, 0, 1);
    }
    return clamp((v - min) / range, 0, 1);
  };
  /** ratio in [0, 1] → raw (unsnapped) value for drag-to-position. */
  const ratioToValue = (r: number): number => {
    const cr = clamp(r, 0, 1);
    if (useLog) return Math.exp(logMinV + cr * logSpan) - LOG_OFFSET;
    return min + cr * range;
  };

  /** Round `v` to the nearest multiple of `step` measured from `min`,
   *  then clamp to [min, max]. When step = 1 this collapses to the
   *  usual `clamp(round(v), …)`. */
  const snap = (v: number): number => {
    const off = v - min;
    const snapped = min + Math.round(off / step) * step;
    return clamp(snapped, min, max);
  };

  let value = snap(opts.value);

  const el = document.createElement('div');
  el.className = 'knob';
  el.innerHTML = `
    <span class="klabel"></span>
    <span class="kbar" tabindex="0" role="slider"></span>
    <span class="kval"></span>
  `;
  const labelEl = el.querySelector('.klabel') as HTMLElement;
  const barEl = el.querySelector('.kbar') as HTMLElement;
  const valEl = el.querySelector('.kval') as HTMLElement;
  labelEl.textContent = opts.label;

  const paint = (): void => {
    const ratio = valueToRatio(value);
    barEl.style.setProperty('--fill', `${ratio * 100}%`);
    barEl.setAttribute('aria-valuenow', String(value));
    barEl.setAttribute('aria-valuemin', String(min));
    barEl.setAttribute('aria-valuemax', String(max));
    valEl.textContent = formatInt(value);
    const oor = value < min || value > max;
    valEl.classList.toggle('out-of-range', oor);
  };

  const emit = (newV: number): void => {
    const snapped = snap(newV);
    if (snapped === value) return;
    value = snapped;
    paint();
    opts.onChange(value);
  };

  // Step sizes are range-aware (and value-aware on big ranges).
  //   Fine            = ±1 (held by Shift).
  //   Coarse (default) = ~3% of the value range. But on REALLY wide
  //                     ranges (> LOG_THRESHOLD) a linear 3% means
  //                     every tick is enormous at the low end (~983
  //                     per tick on freq 0..32767 even when the value
  //                     is 5). Switch to "3% of the CURRENT VALUE" so
  //                     small numbers step small and big numbers step
  //                     big — the classic logarithmic knob feel.
  // Ranges smaller than COARSE_THRESHOLD don't need a separate coarse
  // mode at all; every step is already meaningful.
  const COARSE_THRESHOLD = 64;
  const LOG_THRESHOLD = 1000;
  /** Round a raw step UP to the nearest multiple of `step`. Guarantees
   *  that wheel/arrow events always move by a legal increment when the
   *  knob is even-only (step = 2) or any other granularity. */
  const toStep = (raw: number): number =>
    Math.max(step, Math.round(raw / step) * step);
  const linearCoarse = (): number => toStep(range * 0.03);
  const logCoarse = (): number => toStep(Math.abs(value) * 0.03);
  const coarseStep = (): number =>
    range > LOG_THRESHOLD ? logCoarse() : linearCoarse();
  const hasCoarse = (): boolean => range >= COARSE_THRESHOLD;
  /** Step to apply for a non-Shift event. Coarse on wide ranges, ±step on narrow. */
  const wheelDefault = (): number => hasCoarse() ? coarseStep() : step;
  /** Step to apply when Shift is held. Fine = ±step (always a legal increment). */
  const shiftStep = (): number => step;

  // wheel: COARSE by default (or ±1 on small ranges), Shift → fine ±1.
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const step = e.shiftKey ? shiftStep() : wheelDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    emit(value + step * dir);
  };
  el.addEventListener('wheel', onWheel, { passive: false });

  // Arrow keys when bar is focused — same default/shift inversion as the
  // wheel, plus dedicated Left/Right = coarse (for users who reach for
  // horizontal direction):
  //   Up / Down   = coarse by default (fine when Shift held)
  //   Left / Right = always coarse (no Shift needed)
  // On small ranges, coarseStep collapses to 1 so all four arrows do ±1.
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      emit(value + (e.shiftKey ? shiftStep() : wheelDefault()));
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      emit(value - (e.shiftKey ? shiftStep() : wheelDefault()));
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      emit(value + coarseStep());
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      emit(value - coarseStep());
    }
  };
  barEl.addEventListener('keydown', onKey);

  // Click+drag: value follows mouse X relative to the bar's bounding rect.
  // Single click at X = set value to that ratio (and focus the bar so arrow
  // keys can fine-tune from there).
  const valueFromClientX = (clientX: number): number => {
    const rect = barEl.getBoundingClientRect();
    if (rect.width <= 0) return value;
    const r = clamp((clientX - rect.left) / rect.width, 0, 1);
    return ratioToValue(r);
  };
  let dragging = false;
  const onMouseMove = (e: MouseEvent): void => {
    if (!dragging) return;
    emit(valueFromClientX(e.clientX));
  };
  const onMouseUp = (): void => {
    dragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };
  barEl.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;  // ignore right/middle
    e.preventDefault();
    barEl.focus();
    dragging = true;
    emit(valueFromClientX(e.clientX));
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  // contextmenu: reset to default
  barEl.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    emit(defaultValue);
  });

  // double-click on value or bar: inline editor
  const openEditor = (): void => {
    if (el.querySelector('input.kedit')) return;
    const input = document.createElement('input');
    input.className = 'kedit';
    // Plain text (not type=number) so users can type "0x1A" hex. Native
    // ArrowUp/Down ±1 stepping is gone, but the underlying bar widget
    // still has wheel + arrow stepping, so no real loss.
    input.type = 'text';
    input.value = formatInt(value);
    valEl.style.display = 'none';
    el.appendChild(input);
    input.focus();
    input.select();
    let closed = false;
    const submit = (): void => {
      if (closed) return;
      closed = true;
      const n = parseFlexInt(input.value);
      if (Number.isFinite(n)) emit(n);
      input.remove();
      valEl.style.display = '';
    };
    const cancel = (): void => {
      if (closed) return;
      closed = true;
      input.remove();
      valEl.style.display = '';
    };
    input.addEventListener('blur', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
    });
  };
  valEl.addEventListener('dblclick', openEditor);
  barEl.addEventListener('dblclick', openEditor);

  paint();

  return {
    el,
    setValue(v: number): void {
      const snapped = snap(v);
      if (snapped === value) return;
      value = snapped;
      paint();
    },
    getValue(): number { return value; },
    destroy(): void { el.remove(); },
  };
}
