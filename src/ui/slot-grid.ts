// Slot-grid component: filled rows only, with [+] insertion targets and
// hover-revealed delete. Per-op param rendering is strictly driven by the
// OP_DEFS registry in funklang/src/dsp/op-metadata.ts.

import type { PatchModel } from '../patch/model';
import { N_SLOTS_EDITABLE, N_SLOTS_MAX, N_INSTRUMENTS, N_IMPORTS, emptySlot, DEFAULT_SAMPLE_LENGTH } from '../patch/types';
import type { Slot } from '../patch/types';
import { pickOp, OP_NAME } from './op-picker';
import { makeKnob } from './knob';
import { drawWaveform } from './waveform';
import { attachWheelStep } from './wheel';
import { opByCode, resetSlotForOp, applyInsertDefaults } from '../dsp/op-metadata';
import { pickSmartOutVar } from '../patch/smart-out-var';
import { generateInstrumentName } from './name-generator';
import { clampLoopOffset, loopLengthFor, minLoopOffset, maxLoopOffset } from '../patch/loop-rules';
import { isValidCloneSource } from '../patch/clone-graph';
import type { ParamDef } from '../dsp/op-metadata';

// Per-clone-slot expansion state, preserved across re-renders. Keyed by
// the slot object itself so it survives `moveSlot` reordering and is
// reclaimed by GC when the slot is removed entirely.
const cloneExpanded = new WeakMap<Slot, boolean>();

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
  /** Instrument index of the current output target — used so the ► glyph
   *  highlights the right slot inside expanded clone blocks (whose rows
   *  belong to a DIFFERENT instrIdx than the active outer one). */
  outputInstr?: number | undefined;
  /** Called when user clicks a slot row to make it the edit selection. */
  onSelect?: ((slotIdx: number) => void) | undefined;
  /** Called when user clicks the per-row speaker button to retarget output. */
  /**
   * Set this slot as the playback output target. `instrIdx` is the
   * instrument the slot belongs to — different from the active instrument
   * when the user clicks 🔊 inside an expanded clone block (the inner
   * grid is rendered for the SOURCE instrument).
   */
  onSetOutput?: ((instrIdx: number, slotIdx: number) => void) | undefined;
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

  // No filled slots → a single empty-state placeholder row whose corner
  // button opens the picker for model index 0.
  if (visibleIdx.length === 0) {
    slots.appendChild(makeEmptyPlaceholder(model, instrIdx, full));
    return;
  }

  for (let r = 0; r < visibleIdx.length; r++) {
    const modelIdx = visibleIdx[r]!;
    const slot = ins.slots[modelIdx]!;
    slots.appendChild(
      renderRow(model, instrIdx, modelIdx, r, slot, opts, {
        full,
        // Only the very first row gets the top-left "+ before me" button —
        // every row has the bottom-left "+ after me" button.
        showInsertBefore: r === 0,
      }),
    );
  }
}

/**
 * Try to insert a new slot at `atIdx`. Bails if the UI/file caps would
 * be exceeded (caller is expected to keep the button disabled too — this
 * is a defensive second line of defence).
 */
async function tryInsertAt(model: PatchModel, instrIdx: number, atIdx: number): Promise<void> {
  const code = await pickOp();
  if (code == null) return;
  const ins = model.patch.instruments[instrIdx];
  if (!ins) return;
  const filled = ins.slots.reduce((n, s) => n + (s.fn !== 0 ? 1 : 0), 0);
  if (filled >= N_SLOTS_EDITABLE) return;
  if (ins.slots.length >= N_SLOTS_MAX) return;
  // loop_gen (op 22) is a post-render side effect that, on the Amiga
  // runtime, is only honoured when it sits in the LAST slot. Enforce
  // that here:
  //   * inserting loop_gen → always lands at the end, regardless of
  //     the [+] button the user clicked.
  //   * inserting anything else when loop_gen exists → clamp atIdx so
  //     it lands BEFORE the loop_gen row, never after it.
  //   * a second loop_gen on the same instrument is silently rejected
  //     (the engine only triggers one anyway).
  const loopGenIdx = ins.slots.findIndex((s) => s.fn === 22);
  if (code === 22) {
    if (loopGenIdx >= 0) return;          // already has one
    atIdx = ins.slots.length;
  } else if (loopGenIdx >= 0 && atIdx > loopGenIdx) {
    atIdx = loopGenIdx;
  }
  // Smart outVar default + per-op factory values from
  // `INSERT_DEFAULTS` (see `src/dsp/op-metadata.ts`).
  const smartOut = pickSmartOutVar(ins, atIdx);
  const base: Slot = { ...emptySlot(), fn: code, outVar: smartOut };
  const slot = applyInsertDefaults(base, code);
  // If this is the first slot landing in the instrument, write the
  // auto-name + 12 KB default length BEFORE the insertSlot call. The
  // insert emits a `structure` event which makes app.ts rebuild the
  // instrument header — that rebuild must see the new name + length
  // already in place, otherwise the header keeps its stale (empty)
  // values until something else triggers another rebuild.
  if (filled === 0) {
    if (ins.sampleLength === 0) {
      model.setInstrumentField(instrIdx, 'sampleLength', DEFAULT_SAMPLE_LENGTH);
    }
    if (!ins.name) {
      model.setInstrumentField(instrIdx, 'name', generateInstrumentName());
    }
  }
  model.insertSlot(instrIdx, atIdx, slot);
}

/**
 * Build a corner `+` button for a slot row. `atIdx` is the model index at
 * which the new slot will be spliced in. `disabled` mirrors the `full`
 * state so visually-full instruments still SHOW the buttons (so the user
 * knows where they would appear) but greyed-out, per user request.
 */
function makeCornerInsertBtn(
  model: PatchModel,
  instrIdx: number,
  atIdx: number,
  position: 'before' | 'after',
  disabled: boolean | string,
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = `slot-corner-insert slot-corner-insert--${position}`;
  btn.dataset[position === 'before' ? 'insertBefore' : 'insertAfter'] = String(atIdx);
  btn.textContent = '+';
  const isDisabled = !!disabled;
  const disabledReason = typeof disabled === 'string' ? disabled : `Instrument is full (max ${N_SLOTS_EDITABLE} slots)`;
  btn.title = isDisabled
    ? disabledReason
    : (position === 'before' ? 'Insert slot before this row' : 'Insert slot after this row');
  if (isDisabled) btn.disabled = true;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (isDisabled) return;
    void tryInsertAt(model, instrIdx, atIdx);
  });
  btn.addEventListener('mousedown', (e) => e.stopPropagation());
  return btn;
}

function makeEmptyPlaceholder(model: PatchModel, instrIdx: number, disabled: boolean): HTMLElement {
  // Cap-of-zero shouldn't ever fire in practice (N_SLOTS_EDITABLE > 0) but
  // we honour `disabled` for consistency with the per-row buttons.
  const ph = document.createElement('div');
  ph.className = 'slot empty-placeholder';
  const btn = document.createElement('button');
  btn.className = 'slot-corner-insert slot-corner-insert--empty';
  btn.dataset['emptyInsert'] = '0';
  btn.textContent = '+';
  btn.title = disabled
    ? `Instrument is full (max ${N_SLOTS_EDITABLE} slots)`
    : 'Add the first slot to this instrument';
  if (disabled) btn.disabled = true;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (disabled) return;
    void tryInsertAt(model, instrIdx, 0);
  });
  ph.appendChild(btn);
  // Guide text so the user understands what the [+] does — adding the
  // first slot also auto-names the instrument (demoscene generator) and
  // sets sampleLength to the 12 KB default.
  const hint = document.createElement('span');
  hint.className = 'empty-placeholder-hint';
  hint.dataset['emptyHint'] = '1';
  hint.textContent = 'Add the first slot to initialize this instrument — picks a name and a 12 KB sample length.';
  ph.appendChild(hint);
  return ph;
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
  /**
   * Set of variable indices (1..4) that have been written to by any
   * earlier slot in the same instrument. Options outside this set get
   * a "(unset)" suffix and, when SELECTED-but-unset, the whole control
   * gets a red border so the user knows the input will be silence.
   */
  availableVars?: ReadonlySet<number> | undefined;
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
  const avail = opts.availableVars;
  for (const o of labels) {
    const optEl = document.createElement('option');
    optEl.value = String(o.value);
    // v1..v4 that aren't yet written get a "(unset)" suffix so the user
    // knows picking them feeds silence into this slot.
    const isUnset = o.value > 0 && !!avail && !avail.has(o.value);
    optEl.textContent = isUnset ? `${o.text} (unset)` : o.text;
    if (o.value === opts.value) optEl.selected = true;
    sel.appendChild(optEl);
  }
  // If the currently-selected source is unset, highlight the whole control
  // so the warning is visible without opening the dropdown.
  const currentlyUnset = opts.value > 0 && !!avail && !avail.has(opts.value);
  sel.classList.toggle('var-unset', currentlyUnset);
  if (currentlyUnset) sel.title = (sel.title ? sel.title + ' — ' : '') + `v${opts.value} is not written by any earlier slot`;
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
  /**
   * If provided, returns true when index `i` is a valid choice. Invalid
   * indices are OMITTED from the dropdown. If the current value isn't
   * valid, the dropdown still surfaces it (with a red `.var-unset` style)
   * so the user can SEE the bogus reference and pick a real one.
   */
  validFor?: ((i: number) => boolean) | undefined;
  title?: string | undefined;
  onChange: (v: number) => void;
}
function makeRefSelect(opts: RefSelectOpts): HTMLSelectElement {
  const sel = document.createElement('select');
  sel.className = 'param-ref-select';
  if (opts.title) sel.title = opts.title;
  let curIsInvalid = false;
  for (let i = 0; i < opts.count; i++) {
    const valid = opts.validFor ? opts.validFor(i) : true;
    if (!valid && i !== opts.value) continue;   // hide invalid options
    const optEl = document.createElement('option');
    optEl.value = String(i);
    optEl.textContent = valid ? opts.labelFor(i) : `${opts.labelFor(i)} (invalid)`;
    if (i === opts.value) {
      optEl.selected = true;
      if (!valid) curIsInvalid = true;
    }
    sel.appendChild(optEl);
  }
  if (curIsInvalid) {
    sel.classList.add('var-unset');
    sel.title = (sel.title ? sel.title + ' — ' : '') + 'current source is not a valid choice';
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
/**
 * The set of variables (1..4) written to by any slot BEFORE `slotIdx` in
 * the given instrument. A var-source dropdown picking a variable outside
 * this set is referencing silence — surfaced as `(unset)` + red border.
 */
function writtenVarsBefore(
  model: PatchModel,
  instrIdx: number,
  slotIdx: number,
): Set<number> {
  const ins = model.patch.instruments[instrIdx];
  if (!ins) return new Set();
  const out = new Set<number>();
  for (let i = 0; i < slotIdx; i++) {
    const s = ins.slots[i];
    if (s && s.fn !== 0 && s.outVar > 0) out.add(s.outVar);
  }
  return out;
}

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
      // Clone op (fn=17) `val2Value` is the SOURCE-sample read offset. Its
      // valid range is dictated by the source instrument's sampleLength —
      // max = SL − 2 (Klang reads pairs of bytes, so the last legal start
      // is SL − 2), with a defensive floor of 2 when the source has no
      // sample yet. Step is 2 because the engine treats offset as a
      // 2-byte stride.
      const isCloneOffset = slot.fn === 17 && param.field === 'val2Value';
      const cloneMax = isCloneOffset
        ? Math.max(2, (model.patch.instruments[slot.gain]?.sampleLength ?? param.type.max) - 2)
        : param.type.max;
      const knob = makeKnob({
        label: param.type.label,
        value: slot[param.field] as number,
        min: param.type.min,
        max: cloneMax,
        scale: param.type.scale,
        ...(isCloneOffset ? { step: 2 } : {}),
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
        availableVars: writtenVarsBefore(model, instrIdx, slotIdx),
        title: param.type.label,
        onChange: (v) => {
          writeValue(v);
          // Force the row to rebuild so this dropdown's .var-unset class
          // and the (unset) suffixes in the option list reflect the new
          // value (the underlying availableVars set didn't change, but
          // the SELECTED option may now be unset/valid).
          model.events.emit({ instrIdx, kind: 'structure' });
        },
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

      // Selector dropdown: "const" | v1..v4. Variables not written by any
      // earlier slot get a "(unset)" suffix, and when one is the current
      // selection the whole dropdown gets a red border (.var-unset).
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
      const availV = writtenVarsBefore(model, instrIdx, slotIdx);
      for (const m of modes) {
        const optEl = document.createElement('option');
        optEl.value = String(m.value);
        const isUnsetVar = m.value > 0 && !availV.has(m.value);
        optEl.textContent = isUnsetVar ? `${m.text} (unset)` : m.text;
        if (m.value === curSelector) optEl.selected = true;
        sel.appendChild(optEl);
      }
      if (curSelector > 0 && !availV.has(curSelector)) {
        sel.classList.add('var-unset');
        sel.title += ` — v${curSelector} is not written by any earlier slot`;
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
        scale: param.type.scale,
        defaultValue: 0,
        onChange: writeValue,
      });
      knob.el.classList.add('param-const-knob');
      knob.el.addEventListener('mousedown', (e) => e.stopPropagation());
      knob.el.addEventListener('click', (e) => e.stopPropagation());
      knob.el.addEventListener('dblclick', (e) => e.stopPropagation());
      wrap.appendChild(knob.el);

      // Mul (fn=10) — sidecar fractional editor for val2Value. The
      // underlying field is the same int (-32767..32767-ish); we just
      // surface a /32767 view for users who think in floats. Hoisted so
      // applyMode() can disable it in lock-step with the knob when the
      // value is sourced from a variable rather than the literal.
      let mulFrac: HTMLInputElement | null = null;
      if (slot.fn === 10 && param.field === 'val2Value') {
        const frac = document.createElement('input');
        frac.type = 'text';
        frac.className = 'param-mul-frac';
        mulFrac = frac;
        frac.title = 'val2Value / 32767 — same field, fractional view';
        let reverting = false;
        const refresh = (): void => {
          frac.value = ((slot.val2Value | 0) / 32767).toFixed(4);
        };
        refresh();
        const commit = (): void => {
          // Escape teardown calls frac.blur() which would otherwise trigger
          // this listener and write back the (already-reverted) value as a
          // fresh param event. The guard suppresses that redundant write
          // while still letting legitimate blur (e.g. clicking away) commit.
          if (reverting) return;
          const f = parseFloat(frac.value);
          if (!Number.isFinite(f)) { refresh(); return; }
          const clamped = Math.max(-1, Math.min(1, f));
          const next = Math.round(clamped * 32767);
          writeValue(next);
          refresh();
        };
        frac.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); frac.blur(); }
          else if (e.key === 'Escape') {
            e.preventDefault();
            reverting = true;
            refresh();
            frac.blur();
            reverting = false;
          }
        });
        frac.addEventListener('blur', commit);
        // Keep the float in sync if the int knob is dragged. Capture the
        // disposer so we can detach the listener when this row is rebuilt
        // — otherwise each slot-grid re-render would stack a fresh listener
        // on the bus while the orphaned ones live forever.
        const off = model.events.on((ev) => {
          if (ev.kind === 'param' && ev.instrIdx === instrIdx
              && ev.coalesceKey?.field === 'val2Value'
              && ev.coalesceKey?.slotIdx === slotIdx) {
            refresh();
          }
        });
        // The slot-grid rebuilds by replacing whole subtrees, so frac becomes
        // disconnected after a structure event. Watch the document for that
        // and clean both the subscription and the observer in one go.
        const obs = new MutationObserver(() => {
          if (!frac.isConnected) { off(); obs.disconnect(); }
        });
        obs.observe(document.body, { childList: true, subtree: true });
        wrap.appendChild(frac);
      }

      const applyMode = (mode: number): void => {
        const literal = mode === 0;
        knob.el.classList.toggle('disabled', !literal);
        // The mul fractional sidecar edits the same literal field, so it
        // must disable alongside the knob when a variable drives the value.
        if (mulFrac) {
          mulFrac.disabled = !literal;
          mulFrac.classList.toggle('disabled', !literal);
        }
      };
      applyMode(curSelector);

      sel.addEventListener('change', () => {
        const v = parseInt(sel.value, 10);
        if (!Number.isFinite(v)) return;
        model.setSlotParam(instrIdx, slotIdx, selFieldKey, v);
        applyMode(v);
        // Force row rebuild so the .var-unset class + (unset) suffixes
        // reflect the new selector value immediately.
        model.events.emit({ instrIdx, kind: 'structure' });
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
        // Klang ordering rule: clone/chordgen source must be a LOWER
        // instrument index than this one. (Instrument 0 has no valid
        // source at all — its dropdown will be empty except for whatever
        // bogus value the patch already stored.)
        validFor: (i) => isValidCloneSource(instrIdx, i),
        title: param.type.label,
        onChange: (v) => {
          // Clone op (fn=17): switching the source instrument rescales
          // val2Value so the FRACTION of the source sample is preserved.
          // new_offset = round(old_offset * new_SL / old_SL), then snap
          // to even and clamp to [0, new_SL - 2]. Write the rescaled
          // offset BEFORE the source change so any param/structure
          // listener that re-reads the slot sees consistent state.
          // Guard against old SL = 0 (no division by zero — leave offset
          // alone in that case).
          if (slot.fn === 17 && param.field === 'gain') {
            const oldSrc = model.patch.instruments[slot.gain];
            const newSrc = model.patch.instruments[v];
            if (oldSrc && newSrc && oldSrc.sampleLength > 0 && newSrc.sampleLength > 0) {
              const oldOffset = slot.val2Value | 0;
              const scaled = Math.round(oldOffset * newSrc.sampleLength / oldSrc.sampleLength);
              const even = scaled - (scaled & 1);
              const clamped = Math.max(0, Math.min(newSrc.sampleLength - 2, even));
              if (clamped !== oldOffset) {
                model.setSlotParam(instrIdx, slotIdx, 'val2Value', clamped);
              }
            }
          }
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

interface InsertCornerOpts {
  /** Instrument is at the editor cap — render the buttons but disabled. */
  full: boolean;
  /** Render the top-left "+ before me" button (only true for the first row). */
  showInsertBefore: boolean;
}

function renderRow(
  model: PatchModel,
  instrIdx: number,
  slotIdx: number,
  rowIdx: number,
  slot: Slot,
  opts: SlotGridOptions,
  insertCorners?: InsertCornerOpts,
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
  const isOutputTarget = opts.outputSlot === slotIdx
    && (opts.outputInstr === undefined || opts.outputInstr === instrIdx);
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
  // loop_gen (op 22) has no slot params, but it owns the instrument's
  // loop region. Surface a single "offset" knob that drives
  // ins.loopOffset, snapping to the loop-rules valid set. loopLength is
  // derived (sampleLength − loopOffset).
  if (slot.fn === 22) {
    const ins = model.patch.instruments[instrIdx];
    if (ins) {
      const minOff = minLoopOffset(ins.sampleLength);
      const maxOff = maxLoopOffset(ins.sampleLength);
      const wrap = document.createElement('div');
      wrap.className = 'param';
      const offsetKnob = makeKnob({
        label: 'offset',
        value: ins.loopOffset,
        min: minOff,
        max: maxOff,
        defaultValue: minOff,
        // Loop offset must be even — let the knob enforce that on every
        // mutation source (wheel, arrow, drag, dblclick editor). The
        // clampLoopOffset call below is now a redundant belt-and-
        // suspenders against any future caller that bypasses the knob.
        step: 2,
        onChange: (v) => {
          // The user's wheel/arrow stepping doesn't know the loop-rules
          // even-only constraint, so snap here and write the snapped
          // value to BOTH the model and back into the knob's own
          // display — otherwise the knob shows the unclamped value
          // (e.g. an odd number) until the next full row rebuild.
          const snapped = clampLoopOffset(ins.sampleLength, v);
          if (snapped !== v) offsetKnob.setValue(snapped);
          if (snapped !== ins.loopOffset) {
            model.setInstrumentField(instrIdx, 'loopOffset', snapped);
          }
          const newLen = loopLengthFor(ins.sampleLength, snapped);
          if (newLen !== ins.loopLength) {
            model.setInstrumentField(instrIdx, 'loopLength', newLen);
          }
        },
      });
      offsetKnob.el.addEventListener('mousedown', (e) => e.stopPropagation());
      offsetKnob.el.addEventListener('click', (e) => e.stopPropagation());
      offsetKnob.el.addEventListener('dblclick', (e) => e.stopPropagation());
      wrap.appendChild(offsetKnob.el);
      knobsHost.appendChild(wrap);
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
      if (opts.onSetOutput) opts.onSetOutput(instrIdx, slotIdx);
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

  // Corner insert buttons: bottom-left on every row ("+ after"), top-left
  // ONLY on the first visible row ("+ before"). The buttons live on the
  // row itself (position:absolute via CSS) so they hover at the corners
  // without disturbing the grid layout. The loop_gen (op 22) row is the
  // hard-coded last slot — its bottom-left + is disabled so the user
  // can't even attempt to insert after it.
  if (insertCorners) {
    if (insertCorners.showInsertBefore) {
      row.appendChild(makeCornerInsertBtn(model, instrIdx, slotIdx, 'before', insertCorners.full));
    }
    const afterDisabled: boolean | string =
      slot.fn === 22 ? 'loop_gen must stay in the last slot — insert above it'
      : insertCorners.full ? true
      : false;
    row.appendChild(makeCornerInsertBtn(model, instrIdx, slotIdx + 1, 'after', afterDisabled));
  }

  wrap.appendChild(row);

  // Clone expansion (depth-aware).
  if (isClone) {
    const depth = opts.depth ?? 0;
    const srcIdx = slot.gain;
    const expandedHost = document.createElement('div');
    wrap.appendChild(expandedHost);
    const toggle = row.querySelector('[data-clone-toggle]') as HTMLButtonElement;
    // Per user feedback: clone blocks start COLLAPSED by default. The
    // current instrument's details should be the focus; the user clicks
    // ▶ when they actually want to drill into the source. Subsequent
    // re-renders (caused by editing inside the expanded block, like
    // changing the source dropdown) preserve the prior state via
    // `cloneExpanded` so the block doesn't collapse on the user.
    let expanded = cloneExpanded.get(slot) ?? false;
    const draw = (): void => {
      cloneExpanded.set(slot, expanded);
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
        // Forward the interaction callbacks so 🔊 / row click / drag-
        // reorder inside the expanded block fire the same handlers as
        // the outer grid (with the correct srcIdx for instr-aware
        // callbacks). The outer code uses `outputInstr` to decide
        // which row carries the ► glyph.
        renderSlotGrid(inner, model, srcIdx, {
          depth: depth + 1,
          selectedSlot: opts.selectedSlot,
          outputSlot: opts.outputSlot,
          outputInstr: opts.outputInstr,
          onSelect: opts.onSelect,
          onSetOutput: opts.onSetOutput,
        });
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
