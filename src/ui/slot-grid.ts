// Slot-grid component: filled rows only, with [+] insertion targets and
// hover-revealed delete. Per-op param rendering is strictly driven by the
// OP_DEFS registry in funklang/src/dsp/op-metadata.ts.

import type { PatchModel } from '../patch/model';
import { N_SLOTS_EDITABLE, N_SLOTS_MAX, N_INSTRUMENTS, N_IMPORTS, emptySlot } from '../patch/types';
import type { Slot } from '../patch/types';
import { pickOp, OP_NAME } from './op-picker';
import { makeKnob } from './knob';
import { drawWaveform } from './waveform';
import { attachWheelStep } from './wheel';
import { opByCode, resetSlotForOp } from '../dsp/op-metadata';
import type { ParamDef } from '../dsp/op-metadata';

export interface SlotGridOptions {
  /** Recursion depth for clone expansion (0 = top level). */
  depth?: number | undefined;
  /**
   * Currently EDIT-SELECTED slot. Set by single-clicking a slot row.
   * Used purely for visual highlighting + as the keyboard/hover focus.
   * Changing knob values does NOT touch this — it's the user's "I'm
   * looking at this slot" indicator.
   */
  selectedSlot?: number | null | undefined;
  /**
   * Slot whose tap is currently the AUDIO PLAYBACK TARGET. Set explicitly
   * via the per-row speaker button (or the header dropdown). Drawn with a
   * magenta `►` glyph in the # column — independent of the selection.
   */
  outputSlot?: number | null | undefined;
  /** Called when user clicks a slot row to make it the edit selection. */
  onSelect?: ((slotIdx: number) => void) | undefined;
  /** Called when user clicks the per-row speaker button to retarget output. */
  onSetOutput?: ((slotIdx: number) => void) | undefined;
}

/**
 * Update all per-slot wave canvases inside `root` from `slotTaps`.
 * Each rendered row carries `data-model-slot` with the source instrument's
 * model slot index — we look up `slotTaps[modelIdx]` instead of the visible
 * row position so that hidden op0 rows (which still occupy slotTaps[] for
 * DSP `instance`-indexed state) don't cause a mismatch.
 *
 * Pass `{ recursive: true }` to also refresh canvases inside expanded clone
 * blocks (one slot-grid per source instrument, found via `data-instr`).
 */
export function updateSlotWaves(root: HTMLElement, slotTaps: Int16Array[]): void {
  const slotsRoot = root.querySelector(':scope > .slots');
  if (!slotsRoot) return;
  const wraps = slotsRoot.querySelectorAll(':scope > .slot-wrap');
  for (const w of Array.from(wraps)) {
    const wrap = w as HTMLElement;
    const slotEl = wrap.querySelector(':scope > .slot') as HTMLElement | null;
    if (!slotEl) continue;
    const idxStr = slotEl.dataset['modelSlot'];
    if (idxStr === undefined) continue;
    const modelIdx = parseInt(idxStr, 10);
    if (!Number.isFinite(modelIdx)) continue;
    const cv = slotEl.querySelector('canvas[data-wave]') as HTMLCanvasElement | null;
    if (!cv) continue;
    const tap = slotTaps[modelIdx] ?? null;
    // Render at the canvas' ACTUAL on-screen size (set by CSS), not its
    // intrinsic 320×40 — otherwise the stretched-to-fill canvas looks
    // blurry/pixelated when the wave-cell column is wider than 320.
    const W = Math.max(64, cv.clientWidth | 0);
    const H = Math.max(24, cv.clientHeight | 0);
    drawWaveform(cv, tap, { width: W, height: H });
  }
}

/**
 * Find all expanded clone-block grid hosts inside `root` and return the
 * source instrument index for each. Used by app.ts to refresh waveform
 * canvases for clone-source instruments inside an outer instrument's grid.
 */
export function findExpandedCloneGrids(
  root: HTMLElement,
): Array<{ instrIdx: number; host: HTMLElement }> {
  const out: Array<{ instrIdx: number; host: HTMLElement }> = [];
  // Each recursive renderSlotGrid creates a `.slots[data-instr]` element.
  // Skip the outermost (depth=0) which is handled by the regular path.
  const hosts = root.querySelectorAll('.slots[data-instr]');
  for (const h of Array.from(hosts)) {
    const el = h as HTMLElement;
    const depth = parseInt(el.dataset['depth'] ?? '0', 10);
    if (depth === 0) continue;
    const instrIdx = parseInt(el.dataset['instr'] ?? '-1', 10);
    if (instrIdx < 0) continue;
    // The "host" for updateSlotWaves is the renderSlotGrid root that
    // contains this .slots child — that's the immediate parent of the
    // `.slots` element when renderSlotGrid wrote into a dedicated host.
    const host = el.parentElement;
    if (!host) continue;
    out.push({ instrIdx, host });
  }
  return out;
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
  // Filled = slots with a non-empty op. Empty (fn===0) slots exist in the
  // model only because the on-disk file format pads to 20 and the DSP layer
  // uses position-stable `instance` indices for per-slot state. Hide them
  // from the editor entirely.
  const filledCount = ins.slots.reduce((n, s) => n + (s.fn !== 0 ? 1 : 0), 0);
  const full = filledCount >= N_SLOTS_EDITABLE;

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

  // Build the visible row list (model indices of non-empty slots).
  const visibleIdx: number[] = [];
  for (let i = 0; i < ins.slots.length; i++) {
    if (ins.slots[i]!.fn !== 0) visibleIdx.push(i);
  }

  // [+] at top — inserts at model position 0.
  if (!full) slots.appendChild(makeInserter(model, instrIdx, 0));

  for (let r = 0; r < visibleIdx.length; r++) {
    const modelIdx = visibleIdx[r]!;
    const slot = ins.slots[modelIdx]!;
    slots.appendChild(renderRow(model, instrIdx, modelIdx, r, slot, opts));
    if (!full) {
      // Insert position for "after this row" = modelIdx + 1.
      slots.appendChild(makeInserter(model, instrIdx, modelIdx + 1));
    }
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
    // UI cap: count of FILLED slots can't exceed N_SLOTS_EDITABLE.
    const filled = ins.slots.reduce((n, s) => n + (s.fn !== 0 ? 1 : 0), 0);
    if (filled >= N_SLOTS_EDITABLE) return;
    // Hard cap: the underlying array can't exceed the file-format cap.
    if (ins.slots.length >= N_SLOTS_MAX) return;
    const slot: Slot = { ...emptySlot(), fn: code, outVar: 1 };
    model.insertSlot(instrIdx, atIdx, slot);
  });
  return row;
}

// ── Parameter widgets ────────────────────────────────────────────────────

interface VarSelectOpts {
  /** Current value (0..4). */
  value: number;
  /**
   * `allowNone` is accepted for API compatibility but is purely cosmetic
   * now — the 0 option always reads as "—" because Klang treats 0 as
   * "no source connected" in EVERY var-source field (`v0` doesn't exist).
   * Ops that require a source still surface 0 → "—" so the user can SEE
   * that nothing is wired and pick a real variable.
   */
  allowNone: boolean;
  title?: string | undefined;
  onChange: (v: number) => void;
}
function makeVarSelect(opts: VarSelectOpts): HTMLSelectElement {
  const sel = document.createElement('select');
  sel.className = 'param-var-select';
  if (opts.title) sel.title = opts.title;
  void opts.allowNone;       // intentionally ignored; see comment above
  const labels: ReadonlyArray<{ value: number; text: string }> = [
    { value: 0, text: '—' },
    { value: 1, text: 'v1' },
    { value: 2, text: 'v2' },
    { value: 3, text: 'v3' },
    { value: 4, text: 'v4' },
  ];
  for (const o of labels) {
    const optEl = document.createElement('option');
    optEl.value = String(o.value);
    optEl.textContent = o.text;
    if (o.value === opts.value) optEl.selected = true;
    sel.appendChild(optEl);
  }
  sel.addEventListener('change', () => {
    const v = parseInt(sel.value, 10);
    if (Number.isFinite(v)) opts.onChange(v);
  });
  sel.addEventListener('click', (e) => e.stopPropagation());
  sel.addEventListener('mousedown', (e) => e.stopPropagation());
  attachWheelStep(sel);
  return sel;
}

interface EnumSelectOpts {
  value: number;
  options: ReadonlyArray<{ value: number; label: string }>;
  title?: string | undefined;
  onChange: (v: number) => void;
}
function makeEnumSelect(opts: EnumSelectOpts): HTMLSelectElement {
  const sel = document.createElement('select');
  sel.className = 'param-enum-select';
  if (opts.title) sel.title = opts.title;
  for (const o of opts.options) {
    const optEl = document.createElement('option');
    optEl.value = String(o.value);
    optEl.textContent = o.label;
    if (o.value === opts.value) optEl.selected = true;
    sel.appendChild(optEl);
  }
  sel.addEventListener('change', () => {
    const v = parseInt(sel.value, 10);
    if (Number.isFinite(v)) opts.onChange(v);
  });
  sel.addEventListener('click', (e) => e.stopPropagation());
  sel.addEventListener('mousedown', (e) => e.stopPropagation());
  attachWheelStep(sel);
  return sel;
}

interface RefSelectOpts {
  value: number;
  count: number;
  /** Label provider — defaults to `${i+1}. <name>`. */
  labelFor: (idx: number) => string;
  title?: string | undefined;
  onChange: (v: number) => void;
}
function makeRefSelect(opts: RefSelectOpts): HTMLSelectElement {
  const sel = document.createElement('select');
  sel.className = 'param-ref-select';
  if (opts.title) sel.title = opts.title;
  for (let i = 0; i < opts.count; i++) {
    const optEl = document.createElement('option');
    optEl.value = String(i);
    optEl.textContent = opts.labelFor(i);
    if (i === opts.value) optEl.selected = true;
    sel.appendChild(optEl);
  }
  sel.addEventListener('change', () => {
    const v = parseInt(sel.value, 10);
    if (Number.isFinite(v)) opts.onChange(v);
  });
  sel.addEventListener('click', (e) => e.stopPropagation());
  sel.addEventListener('mousedown', (e) => e.stopPropagation());
  attachWheelStep(sel);
  return sel;
}

/**
 * Render a single ParamDef as a DOM element (which the slot-grid appends
 * into the per-row .params host). Each widget is wired to model.setSlotParam.
 */
function renderParam(
  model: PatchModel,
  instrIdx: number,
  slotIdx: number,
  slot: Slot,
  param: ParamDef,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'param';

  const writeValue = (v: number): void => {
    model.setSlotParam(instrIdx, slotIdx, param.field, v);
  };

  switch (param.type.kind) {
    case 'const-int': {
      const knob = makeKnob({
        label: param.type.label,
        value: slot[param.field] as number,
        min: param.type.min,
        max: param.type.max,
        defaultValue: 0,
        onChange: writeValue,
      });
      knob.el.addEventListener('mousedown', (e) => e.stopPropagation());
      knob.el.addEventListener('click', (e) => e.stopPropagation());
      knob.el.addEventListener('dblclick', (e) => e.stopPropagation());
      wrap.appendChild(knob.el);
      break;
    }

    case 'var-source': {
      const label = document.createElement('span');
      label.className = 'pname';
      label.textContent = param.type.label;
      wrap.appendChild(label);
      const sel = makeVarSelect({
        value: slot[param.field] as number,
        allowNone: param.type.allowNone ?? true,
        title: param.type.label,
        onChange: writeValue,
      });
      wrap.appendChild(sel);
      break;
    }

    case 'var-or-const': {
      const selFieldKey = param.selector;
      if (!selFieldKey) {
        // Misconfigured — fail loud during dev.
        wrap.textContent = `${param.type.label}: missing selector`;
        break;
      }
      const label = document.createElement('span');
      label.className = 'pname';
      label.textContent = param.type.label;
      wrap.appendChild(label);

      // Selector dropdown: "const" | v1..v4.
      const sel = document.createElement('select');
      sel.className = 'param-mode-select';
      sel.title = `${param.type.label}: source`;
      const modes: ReadonlyArray<{ value: number; text: string }> = [
        { value: 0, text: 'const' },
        { value: 1, text: 'v1' },
        { value: 2, text: 'v2' },
        { value: 3, text: 'v3' },
        { value: 4, text: 'v4' },
      ];
      const curSelector = slot[selFieldKey] as number;
      for (const m of modes) {
        const optEl = document.createElement('option');
        optEl.value = String(m.value);
        optEl.textContent = m.text;
        if (m.value === curSelector) optEl.selected = true;
        sel.appendChild(optEl);
      }
      sel.addEventListener('click', (e) => e.stopPropagation());
      sel.addEventListener('mousedown', (e) => e.stopPropagation());
      attachWheelStep(sel);
      wrap.appendChild(sel);

      // Knob for the literal value (only meaningful when selector === 0).
      const knob = makeKnob({
        label: '',
        value: slot[param.field] as number,
        min: param.type.min,
        max: param.type.max,
        defaultValue: 0,
        onChange: writeValue,
      });
      knob.el.classList.add('param-const-knob');
      knob.el.addEventListener('mousedown', (e) => e.stopPropagation());
      knob.el.addEventListener('click', (e) => e.stopPropagation());
      knob.el.addEventListener('dblclick', (e) => e.stopPropagation());
      wrap.appendChild(knob.el);

      const applyMode = (mode: number): void => {
        if (mode === 0) {
          knob.el.classList.remove('disabled');
        } else {
          knob.el.classList.add('disabled');
        }
      };
      applyMode(curSelector);

      sel.addEventListener('change', () => {
        const v = parseInt(sel.value, 10);
        if (!Number.isFinite(v)) return;
        model.setSlotParam(instrIdx, slotIdx, selFieldKey, v);
        applyMode(v);
      });
      break;
    }

    case 'enum': {
      const label = document.createElement('span');
      label.className = 'pname';
      label.textContent = param.type.label;
      wrap.appendChild(label);
      const sel = makeEnumSelect({
        value: slot[param.field] as number,
        options: param.type.options,
        title: param.type.label,
        onChange: writeValue,
      });
      wrap.appendChild(sel);
      break;
    }

    case 'instr-ref': {
      const label = document.createElement('span');
      label.className = 'pname';
      label.textContent = param.type.label;
      wrap.appendChild(label);
      const sel = makeRefSelect({
        value: slot[param.field] as number,
        count: N_INSTRUMENTS,
        labelFor: (i) => {
          const ins = model.patch.instruments[i];
          const name = (ins?.name ?? '').trim();
          return name
            ? `${String(i + 1).padStart(2, '0')} ${name}`
            : String(i + 1).padStart(2, '0');
        },
        title: param.type.label,
        onChange: (v) => {
          writeValue(v);
          // Changing a clone/chordgen source instrument is structural,
          // not parametric — the expanded clone block, title, dependency
          // graph and any cached source render are now stale. Re-emit
          // as 'structure' so the slot grid rebuilds and the clone
          // graph reverse-index is refreshed.
          model.events.emit({ instrIdx, kind: 'structure' });
        },
      });
      wrap.appendChild(sel);
      break;
    }

    case 'sample-ref': {
      const label = document.createElement('span');
      label.className = 'pname';
      label.textContent = param.type.label;
      wrap.appendChild(label);
      const sel = makeRefSelect({
        value: slot[param.field] as number,
        count: N_IMPORTS,
        labelFor: (i) => {
          const samp = model.patch.importedSamples[i];
          const name = (samp?.name ?? '').trim();
          return name ? `${String(i + 1)} ${name}` : `${String(i + 1)} (empty)`;
        },
        title: param.type.label,
        onChange: writeValue,
      });
      wrap.appendChild(sel);
      break;
    }
  }
  return wrap;
}

function renderRow(
  model: PatchModel,
  instrIdx: number,
  slotIdx: number,
  rowIdx: number,
  slot: Slot,
  opts: SlotGridOptions,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'slot-wrap';
  const row = document.createElement('div');
  row.className = 'slot';
  row.dataset['slot'] = String(slotIdx);
  row.dataset['modelSlot'] = String(slotIdx);
  row.dataset['rowIdx'] = String(rowIdx);
  row.draggable = true;
  if (opts.selectedSlot === slotIdx) row.classList.add('selected', 'active');
  const isOutputTarget = opts.outputSlot === slotIdx;
  if (isOutputTarget) row.classList.add('output-target');

  // Display 1-based position by visible row, not by model index — empty
  // slots are hidden so the user sees a contiguous 01..N numbering.
  const num = String(rowIdx + 1).padStart(2, '0');
  const opLabel = OP_NAME[slot.fn] ?? `op${slot.fn}`;
  const outGlyph = isOutputTarget
    ? `<span class="out-glyph" title="Playback output target">►</span>`
    : '';
  const speakerTitle = isOutputTarget
    ? 'Currently the playback output'
    : 'Set as playback output';
  const speakerBtn = `<button class="slot-output-btn${isOutputTarget ? ' active' : ''}" data-output-btn title="${speakerTitle}">🔊</button>`;

  const isClone = slot.fn === 17;
  const expandToggle = isClone
    ? `<button class="clone-toggle" data-clone-toggle title="Expand source">▶</button>`
    : '';

  row.innerHTML = `
    <div class="col col-num">
      ${outGlyph}${num}
      <button class="slot-del" title="Delete this slot">✕</button>
    </div>
    <div class="col col-out">
      <select class="out-select" title="Output variable">
        <option value="0"${slot.outVar === 0 ? ' selected' : ''}>·</option>
        <option value="1"${slot.outVar === 1 ? ' selected' : ''}>v1</option>
        <option value="2"${slot.outVar === 2 ? ' selected' : ''}>v2</option>
        <option value="3"${slot.outVar === 3 ? ' selected' : ''}>v3</option>
        <option value="4"${slot.outVar === 4 ? ' selected' : ''}>v4</option>
      </select>
    </div>
    <div class="col col-op">${expandToggle}<button class="op-name-btn" data-op-name title="Click to change op">${opLabel}</button></div>
    <div class="col col-params"><div class="params" data-knobs></div></div>
    <div class="col wave-cell">
      <canvas class="wave" width="320" height="40" data-wave></canvas>
      ${speakerBtn}
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
  attachWheelStep(sel);

  const del = row.querySelector('.slot-del') as HTMLButtonElement;
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    model.removeSlot(instrIdx, slotIdx);
  });

  // Click on the function-name button to change the op type for this slot.
  const opNameBtn = row.querySelector('[data-op-name]') as HTMLButtonElement;
  opNameBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const code = await pickOp();
    if (code == null || code === slot.fn) return;
    const next = resetSlotForOp(slot, code);
    // Apply each changed field via setSlotParam so model events fire properly
    // (one event per write is fine — the listener debounces redraw).
    for (const key of Object.keys(next) as Array<keyof Slot>) {
      if (next[key] !== slot[key]) {
        model.setSlotParam(instrIdx, slotIdx, key, next[key]);
      }
    }
  });

  // Strict per-op param schema. Render exactly the controls OP_DEFS specifies.
  const knobsHost = row.querySelector('[data-knobs]') as HTMLElement;
  const opDef = opByCode(slot.fn);
  if (opDef) {
    for (const p of opDef.params) {
      knobsHost.appendChild(renderParam(model, instrIdx, slotIdx, slot, p));
    }
  }
  // If no OpDef entry exists for slot.fn, render no param controls — the
  // function-name button still lets the user change to a known op.

  if (opts.onSelect) {
    const select = opts.onSelect;
    row.addEventListener('click', () => select(slotIdx));
  }

  const outBtn = row.querySelector('[data-output-btn]') as HTMLButtonElement | null;
  if (outBtn) {
    outBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (opts.onSetOutput) opts.onSetOutput(slotIdx);
    });
    outBtn.addEventListener('mousedown', (e) => e.stopPropagation());
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
