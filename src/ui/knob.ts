// Vertical-bar knob component with drag / wheel / arrow / dblclick edit / contextmenu reset.
// Values stay numeric; out-of-range gets a red-tinted display but is still emitted to onChange
// so the caller (model) can clamp on serialize.

export interface KnobOptions {
  label: string;
  value: number;
  min?: number | undefined;
  max?: number | undefined;
  defaultValue?: number | undefined;
  /** Pixels-per-unit divisor for coarse drag (default 0.5 → ~2 units/px). */
  coarsePxPerUnit?: number | undefined;
  /** Pixels-per-unit divisor for shift-drag (default 1 → 1 unit/px). */
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

function barString(val: number, min: number, max: number, width = 6): string {
  const range = max - min;
  const ratio = range <= 0 ? 0 : (val - min) / range;
  const r = clamp(ratio, 0, 1);
  const filled = Math.round(r * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

export function makeKnob(opts: KnobOptions): Knob {
  const min = opts.min ?? 0;
  const max = opts.max ?? 255;
  const defaultValue = opts.defaultValue ?? 0;
  const coarse = opts.coarsePxPerUnit ?? 0.5;
  const fine = opts.finePxPerUnit ?? 1;

  let value = opts.value;

  const el = document.createElement('div');
  el.className = 'knob';
  el.innerHTML = `
    <span class="klabel"></span>
    <span class="kbar" tabindex="0"></span>
    <span class="kval"></span>
  `;
  const labelEl = el.querySelector('.klabel') as HTMLElement;
  const barEl = el.querySelector('.kbar') as HTMLElement;
  const valEl = el.querySelector('.kval') as HTMLElement;
  labelEl.textContent = opts.label;

  const range = max - min;

  const paint = (): void => {
    barEl.textContent = barString(value, min, max);
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

  // wheel: ±1, shift ±10
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    const dir = e.deltaY < 0 ? 1 : -1;
    emit(value + step * dir);
  };
  el.addEventListener('wheel', onWheel, { passive: false });

  // arrow keys when focused
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    const dir = e.key === 'ArrowUp' ? 1 : -1;
    emit(value + step * dir);
  };
  barEl.addEventListener('keydown', onKey);

  // drag: vertical, ~2 units/px coarse (px*2), 1 units/px shift fine.
  // Movement up = increase.
  let dragging = false;
  let startY = 0;
  let startV = 0;
  let dragShift = false;
  const onMouseMove = (e: MouseEvent): void => {
    if (!dragging) return;
    const dy = startY - e.clientY;
    const ppu = e.shiftKey ? fine : coarse;
    // pxPerUnit ppu means: 1 unit per ppu pixels → dy/ppu units (approximately).
    // For coarse default 0.5 → 1 unit per 0.5 px = 2 units/px.
    const delta = dy / ppu;
    emit(startV + delta);
    dragShift = e.shiftKey;
  };
  const onMouseUp = (): void => {
    dragging = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };
  barEl.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    startY = e.clientY;
    startV = value;
    dragShift = e.shiftKey;
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
  // Silence unused-var lint: dragShift is for future visual feedback.
  void dragShift;

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
    // Use type=number so the browser's native ArrowUp/ArrowDown ±1 step
    // (and Shift+arrow ±10) works inside the inline editor. min/max keep
    // typed/stepped values inside the param's declared range.
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
      if (Number.isFinite(n)) {
        emit(n);
      }
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
  void range;

  return {
    el,
    setValue(v: number): void {
      const clamped = clamp(Math.round(v), min, max);
      if (clamped === value) return;
      value = clamped;
      paint();
    },
    getValue(): number { return value; },
    destroy(): void {
      el.remove();
    },
  };
}
