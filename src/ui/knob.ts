// Horizontal slider knob: label on the left, a wide CSS-rendered track in
// the middle (clickable + draggable to set value by X position), value on
// the right. The track is focusable; ArrowUp/ArrowDown fine-tune ±1, wheel
// steps ±1, dblclick opens a numeric <input> for exact entry, right-click
// resets to default.

export interface KnobOptions {
  label: string;
  value: number;
  min?: number | undefined;
  max?: number | undefined;
  defaultValue?: number | undefined;
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

  let value = opts.value;

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
    const ratio = range <= 0 ? 0 : clamp((value - min) / range, 0, 1);
    barEl.style.setProperty('--fill', `${ratio * 100}%`);
    barEl.setAttribute('aria-valuenow', String(value));
    barEl.setAttribute('aria-valuemin', String(min));
    barEl.setAttribute('aria-valuemax', String(max));
    valEl.textContent = String(value);
    const oor = value < min || value > max;
    valEl.classList.toggle('out-of-range', oor);
  };

  const emit = (newV: number): void => {
    const clamped = clamp(Math.round(newV), min, max);
    if (clamped === value) return;
    value = clamped;
    paint();
    opts.onChange(value);
  };

  // Step sizes are range-aware.
  //   Fine            = ±1 (held by Shift).
  //   Coarse (default) = ~3% of the value range so a wide param like
  //                     freq (0..32767) moves ~983 per tick instead of
  //                     imperceptible ±1.
  // Ranges smaller than COARSE_THRESHOLD samples don't need a separate
  // coarse mode — every step is already meaningful — so we return 1 in
  // both directions and the Shift modifier becomes a no-op.
  const COARSE_THRESHOLD = 64;
  const coarseStep = (): number => Math.max(1, Math.round(range * 0.03));
  const hasCoarse = (): boolean => range >= COARSE_THRESHOLD;
  /** Step to apply for a non-Shift event. Coarse on wide ranges, ±1 on narrow. */
  const wheelDefault = (): number => hasCoarse() ? coarseStep() : 1;
  /** Step to apply when Shift is held. Always ±1 (fine). */
  const shiftStep = (): number => 1;

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
    return min + r * range;
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
    // type=number → native ArrowUp/ArrowDown ±1 step (Shift+arrow ±10 too).
    input.type = 'number';
    input.min = String(min);
    input.max = String(max);
    input.step = '1';
    input.value = String(value);
    valEl.style.display = 'none';
    el.appendChild(input);
    input.focus();
    input.select();
    let closed = false;
    const submit = (): void => {
      if (closed) return;
      closed = true;
      const n = parseInt(input.value, 10);
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
      const clamped = clamp(Math.round(v), min, max);
      if (clamped === value) return;
      value = clamped;
      paint();
    },
    getValue(): number { return value; },
    destroy(): void { el.remove(); },
  };
}
