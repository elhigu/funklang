// Slot-grid component: filled rows only, with [+] insertion targets and
// hover-revealed delete. Knob params + waveform tap added by later sub-tasks.

import type { PatchModel } from '../patch/model';
import { N_SLOTS_MAX, emptySlot } from '../patch/types';
import type { Slot } from '../patch/types';
import { pickOp, OP_NAME } from './op-picker';
import { makeKnob } from './knob';
import { drawWaveform } from './waveform';

/** Per-op param surface: ordered list of slot fields to expose as knobs. */
interface KnobSpec {
  field: keyof Slot;
  label: string;
  min: number;
  max: number;
}

const I16_MIN = -32768;
const I16_MAX = 32767;
const U8_MAX = 255;

function knobSpecForOp(fn: number): KnobSpec[] {
  // Generic surface: freqVal (i16), gainVal (u8), widthVal (u8),
  // val1Value (i16), val2Value (i16). Tuned per op where helpful.
  switch (fn) {
    case 1: // vol
      return [{ field: 'gainVal', label: 'gain', min: 0, max: U8_MAX }];
    case 2: case 3: case 4: // osc_saw/tri/sine
      return [
        { field: 'freqVal', label: 'freq', min: I16_MIN, max: I16_MAX },
        { field: 'gainVal', label: 'gain', min: 0, max: U8_MAX },
      ];
    case 5: // osc_pulse
      return [
        { field: 'freqVal', label: 'freq', min: I16_MIN, max: I16_MAX },
        { field: 'gainVal', label: 'gain', min: 0, max: U8_MAX },
        { field: 'widthVal', label: 'duty', min: 0, max: U8_MAX },
      ];
    case 6: // osc_noise
      return [{ field: 'gainVal', label: 'gain', min: 0, max: U8_MAX }];
    case 7: // enva
      return [
        { field: 'val1Value', label: 'attack', min: I16_MIN, max: I16_MAX },
        { field: 'gainVal', label: 'gain', min: 0, max: U8_MAX },
      ];
    case 8: // envd
      return [
        { field: 'val1Value', label: 'decay', min: I16_MIN, max: I16_MAX },
        { field: 'val2Value', label: 'sustain', min: I16_MIN, max: I16_MAX },
        { field: 'gainVal', label: 'gain', min: 0, max: U8_MAX },
      ];
    case 9: case 10: // add / mul
      return [{ field: 'val2Value', label: 'val2', min: I16_MIN, max: I16_MAX }];
    case 11: // dly_cyc
      return [
        { field: 'freqVal', label: 'delay', min: I16_MIN, max: I16_MAX },
        { field: 'gainVal', label: 'gain', min: 0, max: U8_MAX },
      ];
    case 12: // cmb_flt_n
      return [
        { field: 'freqVal', label: 'delay', min: I16_MIN, max: I16_MAX },
        { field: 'val2Value', label: 'fbk', min: I16_MIN, max: I16_MAX },
        { field: 'gainVal', label: 'gain', min: 0, max: U8_MAX },
      ];
    case 13: // reverb
      return [
        { field: 'val2Value', label: 'fbk', min: I16_MIN, max: I16_MAX },
        { field: 'gainVal', label: 'gain', min: 0, max: U8_MAX },
      ];
    case 15: // sv_flt_n
      return [
        { field: 'freqVal', label: 'cutoff', min: I16_MIN, max: I16_MAX },
        { field: 'val2Value', label: 'res', min: I16_MIN, max: I16_MAX },
        { field: 'gain', label: 'mode', min: 0, max: U8_MAX },
      ];
    case 16: // distortion
      return [{ field: 'gainVal', label: 'gain', min: 0, max: U8_MAX }];
    case 17: // clone
      return [
        { field: 'freqVal', label: 'transpose', min: I16_MIN, max: I16_MAX },
        { field: 'gain', label: 'srcInstr', min: 0, max: U8_MAX },
        { field: 'gainVal', label: 'reverse', min: 0, max: U8_MAX },
        { field: 'val2Value', label: 'offset', min: I16_MIN, max: I16_MAX },
      ];
    case 19: // sh
      return [{ field: 'gainVal', label: 'step', min: 0, max: U8_MAX }];
    case 20: // imported
      return [{ field: 'gain', label: 'import', min: 0, max: U8_MAX }];
    case 21: // onepole_flt
      return [
        { field: 'freqVal', label: 'cutoff', min: I16_MIN, max: I16_MAX },
        { field: 'gain', label: 'mode', min: 0, max: U8_MAX },
      ];
    case 23: // adsr
      return [
        { field: 'val2Value', label: 'attack', min: I16_MIN, max: I16_MAX },
        { field: 'val1Value', label: 'decay', min: I16_MIN, max: I16_MAX },
        { field: 'widthVal', label: 'sustain', min: 0, max: U8_MAX },
        { field: 'freqVal', label: 'release', min: I16_MIN, max: I16_MAX },
        { field: 'gainVal', label: 'peak', min: 0, max: U8_MAX },
      ];
    default:
      // Generic fallback: expose the five common value fields.
      return [
        { field: 'freqVal', label: 'freq', min: I16_MIN, max: I16_MAX },
        { field: 'gainVal', label: 'gain', min: 0, max: U8_MAX },
        { field: 'widthVal', label: 'width', min: 0, max: U8_MAX },
        { field: 'val1Value', label: 'val1', min: I16_MIN, max: I16_MAX },
        { field: 'val2Value', label: 'val2', min: I16_MIN, max: I16_MAX },
      ];
  }
}

export interface SlotGridOptions {
  /** Recursion depth for clone expansion (0 = top level). */
  depth?: number | undefined;
  /** Currently auditioned slot (or null for instrument-final output). */
  auditionSlot?: number | null | undefined;
  /** Called when user clicks a slot row to audition it. */
  onAudition?: ((slotIdx: number) => void) | undefined;
}

/**
 * Update all per-slot wave canvases inside `root` from `slotTaps`.
 * Order is positional (i-th outer slot row ↔ slotTaps[i]). Canvases nested
 * inside expanded clone blocks are skipped — they belong to the source
 * instrument and would need their own render result.
 */
export function updateSlotWaves(root: HTMLElement, slotTaps: Int16Array[]): void {
  // Only look at the top-level .slots > .slot-wrap > .slot canvases.
  const slotsRoot = root.querySelector(':scope > .slots');
  if (!slotsRoot) return;
  const wraps = slotsRoot.querySelectorAll(':scope > .slot-wrap');
  for (let i = 0; i < wraps.length; i++) {
    const wrap = wraps[i] as HTMLElement;
    const cv = wrap.querySelector(':scope > .slot canvas[data-wave]') as HTMLCanvasElement | null;
    if (!cv) continue;
    const tap = slotTaps[i] ?? null;
    drawWaveform(cv, tap, { width: cv.width, height: cv.height });
  }
}

export function renderSlotGrid(
  root: HTMLElement,
  model: PatchModel,
  instrIdx: number,
  opts: SlotGridOptions = {},
): void {
  const ins = model.patch.instruments[instrIdx];
  if (!ins) {
    root.innerHTML = '';
    return;
  }
  const depth = opts.depth ?? 0;
  const full = ins.slots.length >= N_SLOTS_MAX;

  root.innerHTML = '';
  const head = document.createElement('div');
  head.className = 'grid-head';
  head.innerHTML = `
    <div style="text-align:right">#</div>
    <div>OUT</div>
    <div>FUNCTION</div>
    <div>PARAMETERS</div>
    <div>WAVEFORM</div>
  `;
  root.appendChild(head);

  const slots = document.createElement('div');
  slots.className = 'slots';
  slots.dataset['instr'] = String(instrIdx);
  slots.dataset['depth'] = String(depth);
  root.appendChild(slots);

  // [+] at top
  if (!full) slots.appendChild(makeInserter(model, instrIdx, 0));

  for (let i = 0; i < ins.slots.length; i++) {
    const slot = ins.slots[i]!;
    slots.appendChild(renderRow(model, instrIdx, i, slot, opts));
    if (!full) slots.appendChild(makeInserter(model, instrIdx, i + 1));
  }
}

function makeInserter(model: PatchModel, instrIdx: number, atIdx: number): HTMLElement {
  const row = document.createElement('div');
  row.className = 'slot-insert';
  row.dataset['at'] = String(atIdx);
  row.innerHTML = `<button class="slot-insert-btn" title="Insert slot here">[+]</button>`;
  const btn = row.querySelector('button')!;
  btn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const code = await pickOp();
    if (code == null) return;
    const ins = model.patch.instruments[instrIdx];
    if (!ins) return;
    if (ins.slots.length >= N_SLOTS_MAX) return;
    const slot: Slot = { ...emptySlot(), fn: code, outVar: 1 };
    model.insertSlot(instrIdx, atIdx, slot);
  });
  return row;
}

function renderRow(
  model: PatchModel,
  instrIdx: number,
  slotIdx: number,
  slot: Slot,
  opts: SlotGridOptions,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'slot-wrap';
  const row = document.createElement('div');
  row.className = 'slot';
  row.dataset['slot'] = String(slotIdx);
  row.draggable = true;
  if (opts.auditionSlot === slotIdx) row.classList.add('audition', 'active');

  const num = String(slotIdx + 1).padStart(2, '0');
  const opLabel = OP_NAME[slot.fn] ?? `op${slot.fn}`;

  const isClone = slot.fn === 17;
  const expandToggle = isClone
    ? `<button class="clone-toggle" data-clone-toggle title="Expand source">▶</button>`
    : '';

  row.innerHTML = `
    <div class="col col-num">${num}</div>
    <div class="col col-out">
      <select class="out-select" title="Output variable">
        <option value="0"${slot.outVar === 0 ? ' selected' : ''}>·</option>
        <option value="1"${slot.outVar === 1 ? ' selected' : ''}>v1</option>
        <option value="2"${slot.outVar === 2 ? ' selected' : ''}>v2</option>
        <option value="3"${slot.outVar === 3 ? ' selected' : ''}>v3</option>
        <option value="4"${slot.outVar === 4 ? ' selected' : ''}>v4</option>
      </select>
    </div>
    <div class="col col-op">${expandToggle}${opLabel}</div>
    <div class="col"><div class="params" data-knobs></div></div>
    <div class="col wave-cell">
      <canvas class="wave" width="160" height="32" data-wave></canvas>
      <button class="slot-del" title="Delete this slot">✕</button>
    </div>
  `;

  const sel = row.querySelector('.out-select') as HTMLSelectElement;
  sel.addEventListener('change', (e) => {
    e.stopPropagation();
    const v = parseInt(sel.value, 10);
    if (!Number.isFinite(v)) return;
    model.setSlotParam(instrIdx, slotIdx, 'outVar', v);
  });
  sel.addEventListener('click', (e) => e.stopPropagation());

  const del = row.querySelector('.slot-del') as HTMLButtonElement;
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    model.removeSlot(instrIdx, slotIdx);
  });

  // Knobs
  const knobsHost = row.querySelector('[data-knobs]') as HTMLElement;
  const specs = knobSpecForOp(slot.fn);
  for (const spec of specs) {
    const initial = slot[spec.field] as number;
    const knob = makeKnob({
      label: spec.label,
      value: initial,
      min: spec.min,
      max: spec.max,
      defaultValue: 0,
      onChange: (v) => {
        model.setSlotParam(instrIdx, slotIdx, spec.field, v);
      },
    });
    knob.el.addEventListener('mousedown', (e) => e.stopPropagation());
    knob.el.addEventListener('click', (e) => e.stopPropagation());
    knob.el.addEventListener('dblclick', (e) => e.stopPropagation());
    knobsHost.appendChild(knob.el);
  }

  if (opts.onAudition) {
    const handler = opts.onAudition;
    row.addEventListener('click', () => handler(slotIdx));
  }

  // drag-to-reorder (lifted from editor-mockup.html)
  row.addEventListener('dragstart', (e) => {
    e.dataTransfer?.setData('text/plain', String(slotIdx));
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
    row.classList.add('dragging');
  });
  row.addEventListener('dragend', () => {
    row.classList.remove('dragging');
    document.querySelectorAll('.slot.drop-above, .slot.drop-below')
      .forEach((el) => el.classList.remove('drop-above', 'drop-below'));
  });
  row.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const rect = row.getBoundingClientRect();
    const above = (e.clientY - rect.top) < rect.height / 2;
    row.classList.toggle('drop-above', above);
    row.classList.toggle('drop-below', !above);
  });
  row.addEventListener('dragleave', () => {
    row.classList.remove('drop-above', 'drop-below');
  });
  row.addEventListener('drop', (e) => {
    e.preventDefault();
    const fromStr = e.dataTransfer?.getData('text/plain');
    if (!fromStr) return;
    const from = parseInt(fromStr, 10);
    if (!Number.isFinite(from)) return;
    const rect = row.getBoundingClientRect();
    const above = (e.clientY - rect.top) < rect.height / 2;
    let to = above ? slotIdx : slotIdx + 1;
    if (from === to || from === to - 1) return;
    if (to > from) to -= 1;
    model.moveSlot(instrIdx, from, to);
  });

  wrap.appendChild(row);

  // Clone expansion (depth-aware).
  if (isClone) {
    const depth = opts.depth ?? 0;
    const srcIdx = slot.gain;
    const expandedHost = document.createElement('div');
    wrap.appendChild(expandedHost);
    const toggle = row.querySelector('[data-clone-toggle]') as HTMLButtonElement;
    let expanded = depth < 2;
    const draw = (): void => {
      toggle.textContent = expanded ? '▼' : '▶';
      if (!expanded) { expandedHost.innerHTML = ''; return; }
      // Bounds check + cycle catch.
      const srcIns = model.patch.instruments[srcIdx];
      if (!srcIns || srcIdx === instrIdx) {
        expandedHost.innerHTML = `<div class="cycle-chip">invalid clone source ${srcIdx}</div>`;
        return;
      }
      expandedHost.innerHTML = '';
      const block = document.createElement('div');
      block.className = 'clone-block';
      const title = document.createElement('div');
      title.className = 'clone-block-title';
      title.textContent = `↪ from instrument ${String(srcIdx + 1).padStart(2, '0')} "${srcIns.name || '(unnamed)'}"`;
      block.appendChild(title);
      const inner = document.createElement('div');
      block.appendChild(inner);
      expandedHost.appendChild(block);
      try {
        renderSlotGrid(inner, model, srcIdx, { depth: depth + 1 });
      } catch (err) {
        block.innerHTML += `<div class="cycle-chip">would create cycle</div>`;
        void err;
      }
    };
    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      expanded = !expanded;
      draw();
    });
    draw();
  }

  return wrap;
}
