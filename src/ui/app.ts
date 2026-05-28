import { PatchModel } from '../patch/model';
import { HistoryManager } from '../patch/history';
import { emptyPatch, emptyInstrument, N_SLOTS_EDITABLE } from '../patch/types';
import { parseAkp, serializeAkp } from '../fileio/akp';
import { parseAki, serializeAki } from '../fileio/aki';
import { renderInstrument, CyclicCloneError } from '../dsp/engine';
import type { RenderResult } from '../dsp/types';
import { Player } from '../audio/player';
import { buildCloneGraph, allDependentsOf } from '../patch/clone-graph';
import { clampLoopOffset, loopLengthFor } from '../patch/loop-rules';
import { normalizePatch } from '../patch/normalize';
import type { CloneGraph } from '../patch/clone-graph';
import { renderSidebar } from './sidebar';
import { renderInstrHeader } from './instr-header';
import { renderSlotGrid, updateSlotWaves, findExpandedCloneGrids } from './slot-grid';
import { bytesToInt16, bytesToInt16WithLoop } from './waveform';
import { makeWaveViewer } from './wave-viewer';
import type { WaveViewer } from './wave-viewer';
import { openFileBytes, openFileWithHandle, saveFileBytes, saveToHandle } from './file-dialog';
import { attachWheelStep } from './wheel';
import { getDisplayBase, setDisplayBase, onDisplayBaseChange } from './number-format';
import {
  startAutosaveLoop, latestAutosave, listAutosaves, restoreAutosave, saveAutosave,
} from './autosave';
import { NOTE_LIST, noteRateHz, DEFAULT_NOTE } from './note-table';

const DEBOUNCE_MS = 80;
const NOTE_LS_KEY = 'funklang.previewNote';

/**
 * Two separate concepts:
 *  - `selection`:    which slot the user is "looking at" (edit focus).
 *                    Set by clicking a slot row. Mutating knob values does
 *                    NOT change this.
 *  - `outputTarget`: which signal feeds the audio player. `slotIdx === null`
 *                    means "play the instrument's final v1 output". Only the
 *                    user explicitly retargets this (header dropdown or the
 *                    per-row 🔊 button).
 */
interface SelectionState {
  instrIdx: number;
  slotIdx: number | null;
}

interface OutputTarget {
  instrIdx: number;
  slotIdx: number | null; // null = final output (v1)
}

function loadStoredNote(): string {
  try {
    const v = localStorage.getItem(NOTE_LS_KEY);
    if (v && NOTE_LIST.includes(v)) return v;
  } catch { /* localStorage unavailable */ }
  return DEFAULT_NOTE;
}

function saveStoredNote(note: string): void {
  try { localStorage.setItem(NOTE_LS_KEY, note); }
  catch { /* localStorage unavailable */ }
}

function instrHasOp(model: PatchModel, instrIdx: number, op: number): boolean {
  const ins = model.patch.instruments[instrIdx];
  if (!ins) return false;
  for (const s of ins.slots) if (s.fn === op) return true;
  return false;
}

function warnPatchOver16Slots(model: PatchModel): void {
  for (let i = 0; i < model.patch.instruments.length; i++) {
    const ins = model.patch.instruments[i]!;
    const filled = ins.slots.reduce((n, s) => n + (s.fn !== 0 ? 1 : 0), 0);
    if (filled > N_SLOTS_EDITABLE) {
      // eslint-disable-next-line no-console
      console.warn(
        `[funklang] instrument ${i + 1} "${ins.name}" has ${filled} filled slots ` +
        `(editor cap is ${N_SLOTS_EDITABLE}); existing slots remain editable but ` +
        `no new slots can be inserted until some are removed.`,
      );
    }
  }
}

export function bootApp(root: HTMLElement): void {
  const model = new PatchModel(emptyPatch());
  const history = new HistoryManager(model);
  const player = new Player();
  let activeIdx = 0;
  let patchFileName = '';
  // File System Access handle if open via FSA; undefined otherwise.
  let patchFileHandle: FileSystemFileHandle | undefined = undefined;
  let selection: SelectionState = { instrIdx: 0, slotIdx: null };
  let outputTarget: OutputTarget = { instrIdx: 0, slotIdx: null };
  let previewNote: string = loadStoredNote();
  // Reverse clone-dependency index. Rebuilt on structure changes.
  let cloneGraph: CloneGraph = buildCloneGraph(model.patch);

  const noteOptions = NOTE_LIST
    .map((n) => `<option value="${n}"${n === previewNote ? ' selected' : ''}>${n}</option>`)
    .join('');

  root.innerHTML = `
    <div class="app">
      <header>
        <div class="brand"><div class="dot"></div><span>FUNKLANG.WEB</span></div>
        <div class="menu">
          <button id="btn-close" title="Close the current patch — gives you a blank project ready to edit. Disabled when nothing has been done.">CLOSE</button>
          <button id="btn-open">OPEN&nbsp;PATCH</button>
          <button id="btn-save">SAVE</button>
          <button id="btn-save-as">SAVE&nbsp;AS</button>
          <button id="btn-undo" title="Undo (Ctrl+Z)" disabled>↶&nbsp;UNDO</button>
          <button id="btn-redo" title="Redo (Ctrl+Shift+Z)" disabled>↷&nbsp;REDO</button>
          <button id="btn-revert" title="Browse autosaves (snapshot every minute to localStorage)">REVERT&nbsp;AUTOSAVE</button>
          <label class="base-toggle-wrap" title="Display numbers as decimal or hexadecimal everywhere">
            <span class="base-toggle-label">BASE</span>
            <select id="display-base">
              <option value="dec">DEC</option>
              <option value="hex">HEX</option>
            </select>
          </label>
          <label class="note-select-wrap" title="Audition note (playback rate)">
            <span class="note-select-label">NOTE</span>
            <select id="note-select">${noteOptions}</select>
          </label>
          <div class="output-select-wrap" title="Which signal is sent to the audio output">
            <span class="output-select-label">OUTPUT</span>
            <button id="btn-output-master" class="output-master active" title="Route the active instrument's final v1 output to playback. Grayed out when a per-slot 🔊 is the current output.">MASTER&nbsp;V1</button>
            <button id="btn-audio-toggle" class="audio-toggle on" title="Audio on — click to mute (changes still re-render). Spacebar replays.">▶</button>
          </div>
          <button id="btn-help" class="help-btn" title="Keyboard shortcuts (?)">?</button>
        </div>
        <div class="file-info">
          <span class="file-name" id="file-name">(no patch)</span>
        </div>
      </header>
      <div id="help-overlay" class="help-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <div class="help-card">
          <div class="help-head">
            <span id="help-title">FUNKLANG.WEB</span>
            <button class="help-close" id="help-close" aria-label="Close">✕</button>
          </div>
          <div class="help-body">
            <h3>Playback &amp; transport</h3>
            <table class="help-kbd">
              <tbody>
                <tr><td><kbd>Space</kbd></td><td>Replay the selected output (always — even if the audio toggle is muted)</td></tr>
                <tr><td>Click 🔊 on a slot</td><td>Set that slot as the playback output and audition it once</td></tr>
                <tr><td>Click ▶ next to OUTPUT</td><td>Toggle auto-playback (green = plays on every change, red = no auto play)</td></tr>
                <tr><td><kbd>Shift</kbd>+click ▶</td><td>Play a 0.8 s sine test tone (audio-chain diagnostic — logs Player state)</td></tr>
              </tbody>
            </table>

            <h3>Instrument selection (sidebar)</h3>
            <table class="help-kbd">
              <tbody>
                <tr><td>Click instrument</td><td>Select + audition (if audio toggle is on)</td></tr>
                <tr><td>Mouse wheel over list</td><td>Step ± to previous / next non-empty instrument</td></tr>
                <tr><td><kbd>↑</kbd> / <kbd>↓</kbd></td><td>Same — wraps around past the ends</td></tr>
              </tbody>
            </table>

            <h3>Slider (when bar is focused — click it once)</h3>
            <table class="help-kbd">
              <tbody>
                <tr><td>Click anywhere on the bar</td><td>Set value to that position; bar gains focus</td></tr>
                <tr><td>Drag</td><td>Value follows the mouse X (release to commit)</td></tr>
                <tr><td><kbd>↑</kbd> / <kbd>↓</kbd></td><td>Coarse (~3% of the slider's range)</td></tr>
                <tr><td><kbd>Shift</kbd>+<kbd>↑</kbd> / <kbd>↓</kbd></td><td>Fine ±1</td></tr>
                <tr><td><kbd>←</kbd> / <kbd>→</kbd></td><td>Always coarse</td></tr>
                <tr><td>Wheel over the slider</td><td>Coarse (~3% of range)</td></tr>
                <tr><td><kbd>Shift</kbd>+wheel</td><td>Fine ±1</td></tr>
                <tr><td><i>(small ranges)</i></td><td>Sliders with fewer than 64 values are always ±1 — no separate coarse mode</td></tr>
                <tr><td>Double-click the value</td><td>Type exact value (<kbd>↑</kbd>/<kbd>↓</kbd> step in the editor too)</td></tr>
                <tr><td>Right-click</td><td>Reset to default</td></tr>
              </tbody>
            </table>

            <h3>Slots</h3>
            <table class="help-kbd">
              <tbody>
                <tr><td>Click slot row</td><td>Set as the edit selection (amber bar on the left)</td></tr>
                <tr><td>Click slot function name</td><td>Change op type (opens the op picker)</td></tr>
                <tr><td>Click ✕ next to slot #</td><td>Delete the slot</td></tr>
                <tr><td>Drag slot # column</td><td>Reorder slots within the instrument</td></tr>
                <tr><td>New slot outVar default</td><td>Picks a variable that an earlier slot already reads (so the chain feeds something), falling back to the first unused variable</td></tr>
                <tr><td>Newly inserted slot defaults</td><td>Per-op factory values applied on insert — e.g. osc_saw/tri/sine = freq 50/gain 64, osc_pulse adds width 63, vol = gain 128, envd = decay 16/sustain 64/gain 64, dly_cyc = gain 128, cmb_flt_n = gain 64 (delay 0, feedback 0), reverb = feedback 64/gain 64, sv_flt_n = cutoff 16/reso 16/LP, distortion = gain 64, sample_hold = step 8. See <code>src/dsp/op-metadata.ts::INSERT_DEFAULTS</code></td></tr>
                <tr><td>add op input</td><td>val1 is variable-only (no constant); first insert defaults to v1</td></tr>
                <tr><td>cmb_flt_n / reverb feedback label</td><td>Re-labelled from <code>fbk</code> to <code>feedback</code> (no behaviour change)</td></tr>
                <tr><td>imported_sample, vocoder</td><td>Marked unsupported in the op picker (no engine codegen)</td></tr>
                <tr><td>Sample length</td><td>The instrument header's length is the same horizontal knob the slot rows use — click/drag the bar to set, dblclick to type, wheel for coarse/fine. Step 2 (even only)</td></tr>
                <tr><td>Even-only fields</td><td>For knobs with step=2 (loop_gen offset, sample length) Shift+wheel moves ±2 and every step (drag / wheel / arrow / numeric editor) snaps to the nearest even value</td></tr>
                <tr><td>Frequency knobs</td><td>Drag uses a SOFT power-curve taper (bar midpoint ≈ 25 % of the range) so the low end is reachable without becoming the whole bar. Wheel / arrows still step linearly</td></tr>
                <tr><td>BASE selector (header)</td><td>Flip every numeric display between decimal and hex. Inputs accept either format ("0x10" works in dec mode too)</td></tr>
                <tr><td><kbd>Enter</kbd> in a text/number field</td><td>Commits the value and removes focus</td></tr>
                <tr><td>Click empty instrument row</td><td>Selects it — first inserted slot auto-names the instrument and sets length to 12288 (12 KB)</td></tr>
                <tr><td>Hover an instrument row</td><td>✕ button appears — reset the instrument (confirms first)</td></tr>
                <tr><td>CLOSE</td><td>Discards the current patch and opens a fresh, blank project. Disabled when the patch is already empty</td></tr>
                <tr><td>IMPORT / EXPORT .AKI</td><td>Now lives in the instrument header next to the name — they only ever applied to the active instrument anyway</td></tr>
                <tr><td>REMOVE (instrument header)</td><td>Wipes the active instrument back to empty. Asks for confirmation; greyed out when the instrument is already empty. Length field + slider also grey out for an untouched instrument and re-enable when you add the first slot</td></tr>
                <tr><td>Autosave</td><td>Every minute the patch is snapshotted to localStorage (up to 30 minutes of history). On page refresh, the latest snapshot loads automatically</td></tr>
                <tr><td>REVERT AUTOSAVE</td><td>Opens the autosave panel on the right. First row is your CURRENT state (saved at open time) so you can always click your way back. Click any row to restore it; arrow-up/down browses with audition playback. Escape closes</td></tr>
                <tr><td>Click <kbd>+</kbd> at a slot's bottom-left corner</td><td>Insert a new slot right after this one</td></tr>
                <tr><td>Click <kbd>+</kbd> at the FIRST row's top-left corner</td><td>Insert a new slot at the very beginning</td></tr>
                <tr><td>Empty instrument</td><td>Shows a single placeholder row with a <kbd>+</kbd> button — click it to add the first slot</td></tr>
                <tr><td>Grey-out <kbd>+</kbd> buttons</td><td>Instrument is at the editor cap (16 slots) — delete one to insert another</td></tr>
                <tr><td>Click ▶ on a clone slot</td><td>Expand the source instrument inline (collapsed by default)</td></tr>
                <tr><td>loop_gen is pinned to the bottom</td><td>Picking loop_gen from the op picker always lands at the last slot; inserting any other op when loop_gen exists lands BEFORE it. The bottom-left [+] on the loop_gen row is disabled — only ONE loop_gen per instrument</td></tr>
                <tr><td>Wheel over a dropdown</td><td>Step through its options</td></tr>
              </tbody>
            </table>

            <h3>Validation</h3>
            <table class="help-kbd">
              <tbody>
                <tr><td>Red instrument row in the sidebar</td><td>One or more of this instrument's slots has an unwired var-source, an unset var-or-const selector, or a clone/chordgen source that isn't a lower-indexed instrument. Fix the underlying red dropdown and the row returns to normal</td></tr>
                <tr><td>Red var-source dropdown</td><td>The selected v1..v4 isn't written by any earlier slot — input will be silence</td></tr>
                <tr><td>(unset) suffix in dropdown</td><td>Same: that variable hasn't been written yet</td></tr>
                <tr><td>Clone source dropdown is empty / red</td><td>Clone source must be a LOWER-numbered instrument; instrument 01 can never clone</td></tr>
                <tr><td>Loop offset</td><td>Always even, ≥ floor(sampleLength/4)×2, ≤ sampleLength−2. The loop_gen slot's offset knob and the wave-viewer's left edge both snap to the same valid set</td></tr>
                <tr><td>Drag loop edge in the top wave-viewer</td><td>Hover near the pink left edge — cursor turns into ↔. Drag to retune the offset (auto-snapped to the valid even position)</td></tr>
                <tr><td>Sample length</td><td>Always even (odd values round down on every keystroke). Patches loaded from .akp are normalised at load so the displayed length is always even</td></tr>
              </tbody>
            </table>

            <h3>File &amp; history</h3>
            <table class="help-kbd">
              <tbody>
                <tr><td><kbd>Ctrl</kbd>+<kbd>S</kbd></td><td>Save patch (silent if the file was opened via OPEN PATCH)</td></tr>
                <tr><td><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd></td><td>Save patch as…</td></tr>
                <tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd></td><td>Undo (knob drags coalesce into one entry)</td></tr>
                <tr><td><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> or <kbd>Ctrl</kbd>+<kbd>Y</kbd></td><td>Redo</td></tr>
                <tr><td><kbd>?</kbd> or <kbd>Esc</kbd></td><td>Toggle / close this help</td></tr>
              </tbody>
            </table>

            <p class="help-foot">Mac: use <kbd>⌘</kbd> wherever <kbd>Ctrl</kbd> is listed.</p>
          </div>
        </div>
      </div>
      <aside class="sidebar">
        <div class="sidebar-title">PATCH · INSTRUMENTS</div>
        <ul class="instr-list" id="instr-list"></ul>
      </aside>
      <main id="main-area"></main>
      <footer>
        <div></div>
        <div class="footer-status">
          <span class="k">selected →</span>
          <span class="selection" id="selection-label">—</span>
          <span class="k">output →</span>
          <span class="output" id="output-label">—</span>
        </div>
        <div class="footer-right"><span class="blink">●</span><span>READY</span></div>
      </footer>
      <aside id="revert-panel" class="revert-panel hidden" aria-hidden="true">
        <div class="revert-head">
          <span>AUTOSAVES</span>
          <button class="revert-close" id="revert-close" aria-label="Close">✕</button>
        </div>
        <div class="revert-hint">Click an entry to load it. The first row is your CURRENT state, captured when you opened this panel — click it to bail out without changing anything.</div>
        <ul class="revert-list" id="revert-list"></ul>
      </aside>
      <input id="hidden-file-input" type="file" accept=".akp" style="display:none" />
    </div>
  `;

  const listEl = root.querySelector('#instr-list') as HTMLElement;
  const nameEl = root.querySelector('#file-name') as HTMLElement;
  const mainEl = root.querySelector('#main-area') as HTMLElement;
  const hidden = root.querySelector('#hidden-file-input') as HTMLInputElement;
  const selectionLabel = root.querySelector('#selection-label') as HTMLElement;
  const outputLabel = root.querySelector('#output-label') as HTMLElement;
  const outputMasterBtn = root.querySelector('#btn-output-master') as HTMLButtonElement;
  const undoBtn = root.querySelector('#btn-undo') as HTMLButtonElement;
  const redoBtn = root.querySelector('#btn-redo') as HTMLButtonElement;

  // Per-render caches of the slot-grid container and wave viewer so we can
  // call updateSlotWaves / viewer.setSample without rebuilding the DOM.
  let gridHostEl: HTMLElement | null = null;
  let waveViewer: WaveViewer | null = null;
  let lastRender: RenderResult | null = null;
  let cycleError: CyclicCloneError | null = null;

  const rebuildCloneGraph = (): void => {
    cloneGraph = buildCloneGraph(model.patch);
  };

  const updateUndoRedoButtons = (): void => {
    undoBtn.disabled = !history.canUndo();
    redoBtn.disabled = !history.canRedo();
  };

  /**
   * If `outputTarget.slotIdx` no longer references a valid slot (e.g. the
   * row was deleted by undo / removeSlot), fall back to the instrument's
   * final output.
   */
  const validateOutputTarget = (): void => {
    const ins = model.patch.instruments[outputTarget.instrIdx];
    if (!ins) {
      outputTarget = { instrIdx: activeIdx, slotIdx: null };
      return;
    }
    if (outputTarget.slotIdx != null) {
      const slot = ins.slots[outputTarget.slotIdx];
      if (!slot || slot.fn === 0) {
        outputTarget = { instrIdx: outputTarget.instrIdx, slotIdx: null };
      }
    }
  };

  /**
   * Build a stable CSS selector for `el` based on its ancestor chain inside
   * `root`, using tag+data-* attributes. Used to find the equivalent element
   * after a `renderMain()` wipe so we can put focus back. Returns null if
   * the element isn't inside `root`.
   */
  const focusSelector = (el: HTMLElement, root: HTMLElement): string | null => {
    if (!root.contains(el)) return null;
    const parts: string[] = [];
    let cur: HTMLElement | null = el;
    while (cur && cur !== root) {
      let part = cur.tagName.toLowerCase();
      for (const attr of Array.from(cur.attributes)) {
        if (attr.name.startsWith('data-')) {
          part += `[${attr.name}="${CSS.escape(attr.value)}"]`;
        }
      }
      // Disambiguate by class only when no data-* attrs anchored it.
      if (!part.includes('[') && cur.classList.length > 0) {
        for (const cls of Array.from(cur.classList)) part += `.${CSS.escape(cls)}`;
      }
      parts.unshift(part);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  };

  const renderMain = (): void => {
    // Capture which element (if any) is focused inside mainEl so we can
    // restore focus after the rebuild. Otherwise a select-change that
    // fires a structure event yanks focus away mid-interaction — the
    // user hits ArrowDown on a clone-source dropdown and the next arrow
    // press hits the body instead.
    const ae = document.activeElement as HTMLElement | null;
    const focusSel = ae ? focusSelector(ae, mainEl) : null;

    mainEl.innerHTML = '';
    const ins = model.patch.instruments[activeIdx];
    if (!ins) {
      gridHostEl = null;
      waveViewer = null;
      return;
    }
    const headerHost = document.createElement('div');
    mainEl.appendChild(headerHost);
    renderInstrHeader(headerHost, model, activeIdx, {
      onImportAki: () => { void importAkiForActive(); },
      onExportAki: () => { void exportAkiForActive(); },
      onRemove:    () => removeInstrumentWithConfirm(activeIdx),
    });

    const viewerHost = document.createElement('div');
    viewerHost.className = 'wave-viewer';
    mainEl.appendChild(viewerHost);
    waveViewer = makeWaveViewer(viewerHost, {
      onLoopChange: (rawOffset, _rawLength) => {
        // loopLength is no longer user-modifiable — it's always derived
        // as `sampleLength − loopOffset`. The wave-viewer's drag emits
        // a raw offset; we snap it to the nearest valid even value per
        // loop-rules, then update BOTH instrument fields so the
        // serialized .akp stays consistent. Only meta events fire
        // here — emitting `structure` mid-drag would destroy the
        // wave-viewer canvas (renderMain rebuild) and the document-
        // level mousemove handler would then divide by a zero rect.
        const ins = model.patch.instruments[activeIdx];
        if (!ins) return;
        const snapped = clampLoopOffset(ins.sampleLength, rawOffset);
        const newLen = loopLengthFor(ins.sampleLength, snapped);
        if (snapped !== ins.loopOffset) {
          model.setInstrumentField(activeIdx, 'loopOffset', snapped);
        }
        if (newLen !== ins.loopLength) {
          model.setInstrumentField(activeIdx, 'loopLength', newLen);
        }
      },
      onLoopCommit: () => {
        // Drag finished — NOW it's safe to do the structural refresh
        // that rebuilds the slot-grid so the loop_gen slot's `offset`
        // knob picks up the new value. (The slot grid is the only
        // listener that has a stale view of `ins.loopOffset` after
        // the meta events above.)
        model.events.emit({ instrIdx: activeIdx, kind: 'structure' });
      },
    });

    const gridHost = document.createElement('div');
    gridHost.className = 'slot-grid-host';
    mainEl.appendChild(gridHost);
    gridHostEl = gridHost;
    renderSlotGrid(gridHost, model, activeIdx, {
      selectedSlot: selection.instrIdx === activeIdx ? selection.slotIdx : null,
      outputSlot: outputTarget.slotIdx,
      outputInstr: outputTarget.instrIdx,
      onSelect: (slotIdx) => {
        selection = { instrIdx: activeIdx, slotIdx };
        // Refresh only the row highlights + footer label — don't replay audio
        // and don't change the output target.
        refreshSelectionHighlight();
        updateLabels();
      },
      onSetOutput: (srcInstrIdx, slotIdx) => {
        // srcInstrIdx may not be activeIdx if 🔊 was clicked inside an
        // expanded clone block — the inner grid belongs to the source
        // instrument. Honour the actual instr the slot belongs to so the
        // user hears that slot's tap, not the active instrument's.
        outputTarget = { instrIdx: srcInstrIdx, slotIdx };
        refreshOutputHighlight();
        refreshOutputMasterBtn();
        updateLabels();
        runRender();
        // Force-play so clicking the 🔊 always auditions the new target,
        // even when autoplayback-on-change is muted.
        playAuditionInternal({ force: true });
      },
    });
    runRender();
    refreshOutputMasterBtn();
    updateLabels();

    // Restore focus to whatever the user was on before this rebuild.
    // querySelector matches the first equivalent element under the new
    // DOM tree — for slot-grid widgets the data-* anchors (data-slot,
    // data-row-idx, …) make this unambiguous.
    if (focusSel) {
      const target = mainEl.querySelector(focusSel) as HTMLElement | null;
      if (target) target.focus();
    }
  };

  /** Re-tag .selected / .active on slot rows without rebuilding the grid. */
  const refreshSelectionHighlight = (): void => {
    if (!gridHostEl) return;
    const rows = gridHostEl.querySelectorAll('.slots > .slot-wrap > .slot');
    for (const r of Array.from(rows)) {
      const el = r as HTMLElement;
      const idx = parseInt(el.dataset['slot'] ?? '-1', 10);
      const isSel = selection.instrIdx === activeIdx && idx === selection.slotIdx;
      el.classList.toggle('selected', isSel);
      el.classList.toggle('active', isSel);
    }
  };

  /** Re-tag .output-target + redraw the ► glyph + 🔊 button highlight. */
  const refreshOutputHighlight = (): void => {
    if (!gridHostEl) return;
    const rows = gridHostEl.querySelectorAll('.slots > .slot-wrap > .slot');
    for (const r of Array.from(rows)) {
      const el = r as HTMLElement;
      const idx = parseInt(el.dataset['slot'] ?? '-1', 10);
      const isOut = outputTarget.instrIdx === activeIdx && idx === outputTarget.slotIdx;
      el.classList.toggle('output-target', isOut);
      const numCol = el.querySelector('.col-num');
      if (numCol) {
        const existing = numCol.querySelector('.out-glyph');
        if (isOut && !existing) {
          const span = document.createElement('span');
          span.className = 'out-glyph';
          span.title = 'Playback output target';
          span.textContent = '►';
          numCol.prepend(span);
        } else if (!isOut && existing) {
          existing.remove();
        }
      }
      const btn = el.querySelector('[data-output-btn]') as HTMLButtonElement | null;
      if (btn) {
        btn.classList.toggle('active', isOut);
        btn.title = isOut ? 'Currently the playback output' : 'Set as playback output';
      }
    }
  };

  /** Rebuild the header OUTPUT dropdown to list the active instr's slots. */
  /**
   * Refresh the MASTER V1 button's visual state. It's "active" (highlighted
   * amber/cyan) when the playback target IS the active instrument's final
   * v1; otherwise it dims to show that some per-slot 🔊 has taken over.
   * Clicking it always returns the output to MASTER V1 of the active instr.
   */
  const refreshOutputMasterBtn = (): void => {
    const isMaster = outputTarget.instrIdx === activeIdx && outputTarget.slotIdx == null;
    outputMasterBtn.classList.toggle('active', isMaster);
    outputMasterBtn.classList.toggle('dimmed', !isMaster);
  };

  /**
   * Activate `i` (clamped to the nearest non-empty instrument if `i` is
   * empty or out of range), re-render, and optionally retrigger audio.
   * Used by sidebar clicks, mouse wheel, ArrowUp/Down, and `NEW`/`OPEN`.
   */
  const selectInstrument = (i: number, opts: { play?: boolean } = {}): void => {
    const n = model.patch.instruments.length;
    let want = Math.max(0, Math.min(n - 1, i));
    if (want === activeIdx) return;
    activeIdx = want;
    selection = { instrIdx: want, slotIdx: null };
    outputTarget = { instrIdx: want, slotIdx: null };
    renderMain();
    repaint();
    if (opts.play) playAudition();   // gated by audioEnabled
  };

  /**
   * Step the sidebar selection by `delta`, skipping over empty instruments
   * so wheel/arrow nav lands only on something audible. Wraps around past
   * the ends so you can scroll continuously.
   */
  const stepInstrument = (delta: number, opts: { play?: boolean } = {}): void => {
    const list = model.patch.instruments;
    const n = list.length;
    if (n === 0) return;
    const dir = delta > 0 ? 1 : -1;
    let next = activeIdx;
    for (let tries = 0; tries < n; tries++) {
      next = (next + dir + n) % n;
      const ins = list[next];
      if (ins && ins.slots.some((s) => s.fn !== 0)) {
        selectInstrument(next, opts);
        return;
      }
    }
    // No non-empty instrument anywhere — leave activeIdx alone.
  };

  // .AKI import/export hoisted out of the top menu and into the per-
  // instrument header. They only ever apply to the active instrument
  // anyway — keeping the buttons next to the name makes that obvious.
  let importing = false;
  const importAkiForActive = async (): Promise<void> => {
    if (importing) return;
    importing = true;
    try {
      const f = await openFileBytes('.aki');
      if (!f) return;
      const ins = parseAki(f.bytes);
      const stem = f.name.replace(/\.aki$/i, '');
      if (!ins.name) ins.name = stem;
      model.patch.instruments[activeIdx] = ins;
      rebuildCloneGraph();
      model.events.emit({ instrIdx: activeIdx, kind: 'structure' });
      renderMain();
      repaint();
    } finally {
      setTimeout(() => { importing = false; }, 300);
    }
  };
  let exporting = false;
  const exportAkiForActive = async (): Promise<void> => {
    if (exporting) return;
    exporting = true;
    try {
      const ins = model.patch.instruments[activeIdx];
      if (!ins) return;
      const bytes = serializeAki(ins);
      const stem = (ins.name || `instr_${activeIdx + 1}`).replace(/[^\w.-]+/g, '_');
      await saveFileBytes(bytes, `${stem}.aki`, '.aki');
    } finally {
      setTimeout(() => { exporting = false; }, 300);
    }
  };

  // "Nothing to close" = no instrument has any filled slot AND no patch
  // file is associated. CLOSE button greys out in that state because
  // clicking it would be a no-op.
  const patchHasContent = (): boolean => {
    if (patchFileName) return true;
    for (const ins of model.patch.instruments) {
      if (ins.slots.some((s) => s.fn !== 0)) return true;
    }
    return false;
  };
  const updateCloseButton = (): void => {
    const btn = root.querySelector('#btn-close') as HTMLButtonElement | null;
    if (btn) btn.disabled = !patchHasContent();
  };

  // Shared "reset this instrument to empty" path used by BOTH the
  // sidebar ✕ button and the instrument header's REMOVE button. Always
  // asks for confirmation — the operation isn't reachable via Ctrl+Z.
  const removeInstrumentWithConfirm = (i: number): void => {
    const ins = model.patch.instruments[i];
    if (!ins) return;
    const label = ins.name || `instrument ${String(i + 1).padStart(2, '0')}`;
    if (!confirm(`Remove "${label}" — clears the name, sample length and all slots. Cannot be undone with Ctrl+Z. Continue?`)) return;
    model.patch.instruments[i] = emptyInstrument();
    rebuildCloneGraph();
    model.events.emit({ instrIdx: i, kind: 'structure' });
    if (i === activeIdx) renderMain();
    repaint();
  };

  const repaint = (): void => {
    renderSidebar(listEl, model.patch, activeIdx, {
      // Sidebar click also auto-plays (subject to the audio toggle), same
      // as wheel/arrow nav. Empty rows are clickable now too — the slot
      // grid renders an empty-state placeholder with a [+] button there.
      onPick: (i) => selectInstrument(i, { play: true }),
      onDelete: removeInstrumentWithConfirm,
    });
    updateCloseButton();
  };

  // Sidebar wheel + arrow nav. Wheel anywhere over the list scrolls the
  // SELECTION (not the DOM scroll); arrows do the same when the keydown
  // target isn't inside a text field. Both auto-play if audio is on.
  listEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    stepInstrument(e.deltaY > 0 ? 1 : -1, { play: true });
  }, { passive: false });

  /**
   * loop_gen (op22) produces no per-tick output — its slotTap[i] is silent.
   * To make the loop_gen slot's tap (and the dedicated wave-viewer when
   * loop_gen is in play) actually show the crossfaded loop region, we use
   * the engine's post-loopgen `bytes` buffer (upscaled to Int16) as that
   * slot's display tap.
   */
  function slotDisplayTap(
    ins: typeof model.patch.instruments[number],
    render: NonNullable<typeof lastRender>,
    slotIdx: number,
  ): Int16Array {
    const slot = ins.slots[slotIdx];
    if (slot?.fn === 22 && render.bytes.length > 0) {
      return bytesToInt16(render.bytes);
    }
    return render.slotTaps[slotIdx] ?? new Int16Array(0);
  }

  function displayTapsFor(
    ins: typeof model.patch.instruments[number],
    render: NonNullable<typeof lastRender>,
  ): Int16Array[] {
    const out: Int16Array[] = new Array(render.slotTaps.length);
    for (let i = 0; i < render.slotTaps.length; i++) {
      out[i] = slotDisplayTap(ins, render, i);
    }
    return out;
  }

  // Debounced re-render + audio replay for the active instrument.
  let debounceHandle: ReturnType<typeof setTimeout> | null = null;
  const scheduleRender = (play: boolean): void => {
    if (debounceHandle) clearTimeout(debounceHandle);
    debounceHandle = setTimeout(() => {
      debounceHandle = null;
      runRender();
      if (play) playAudition();
    }, DEBOUNCE_MS);
  };

  const runRender = (): void => {
    const ins = model.patch.instruments[activeIdx];
    if (!ins) return;
    try {
      lastRender = renderInstrument(model.patch, activeIdx);
      cycleError = null;
    } catch (err) {
      if (err instanceof CyclicCloneError) {
        cycleError = err;
        lastRender = null;
      } else {
        throw err;
      }
    }
    if (gridHostEl && lastRender) {
      updateSlotWaves(gridHostEl, displayTapsFor(ins, lastRender));
      // Also refresh canvases inside any expanded clone-blocks (they show
      // taps from the SOURCE instrument, not the outer one). Render each
      // visible source instrument independently and update its canvases.
      const expanded = findExpandedCloneGrids(gridHostEl);
      // De-dup by instrIdx (same source may be expanded under multiple
      // parents; we render once, then update each host).
      const renderedBySrc = new Map<number, Int16Array[]>();
      for (const { instrIdx: srcIdx, host } of expanded) {
        let taps = renderedBySrc.get(srcIdx);
        if (!taps) {
          try {
            const srcRender = renderInstrument(model.patch, srcIdx);
            const srcIns = model.patch.instruments[srcIdx]!;
            taps = displayTapsFor(srcIns, srcRender);
            renderedBySrc.set(srcIdx, taps);
          } catch (err) {
            // Cyclic clone in the recursive render — skip and leave the
            // canvases blank rather than crashing the whole pass.
            if (!(err instanceof CyclicCloneError)) throw err;
            continue;
          }
        }
        updateSlotWaves(host, taps);
      }
    }
    if (waveViewer) {
      const finalAudible = lastRender ? bytesToInt16(lastRender.bytes) : null;
      const target = (outputTarget.instrIdx === activeIdx && outputTarget.slotIdx != null && lastRender)
        ? (slotDisplayTap(ins, lastRender, outputTarget.slotIdx))
        : finalAudible;
      // Loop overlay only when the patch uses op22 (Loop Generator) somewhere
      // in the active instrument. The user wants the band hidden otherwise.
      const showLoop = instrHasOp(model, activeIdx, 22);
      waveViewer.setSample(target, {
        loopOffset: ins.loopOffset,
        loopLength: ins.loopLength,
        showLoop,
        // Renderer emits sampleLength + 1 ticks; report the authoritative
        // (always even) sampleLength so the meta line never shows odd.
        instrumentLength: ins.sampleLength,
      });
    }
    if (cycleError) {
      annotateCycle(cycleError);
    }
  };

  const annotateCycle = (err: CyclicCloneError): void => {
    if (!gridHostEl) return;
    const banner = document.createElement('div');
    banner.className = 'cycle-chip';
    banner.textContent = `cyclic clone chain: ${err.chain.join(' → ')}`;
    gridHostEl.prepend(banner);
  };

  let audioEnabled = true;
  // Cache the brand-dot element so we can drive its "autoplayback active"
  // pulse animation off audioEnabled. The CSS pulse runs only while the
  // `.audio-on` class is present on the brand container.
  const brandEl = root.querySelector('.brand') as HTMLElement | null;
  const reflectAudioOnDot = (): void => {
    if (brandEl) brandEl.classList.toggle('audio-on', audioEnabled);
  };

  /**
   * Build the Int16 buffer that represents what we actually want to
   * audition for the instrument's FINAL output. When the instrument has
   * an op22 loop_gen slot AND the loop region is non-empty, we append a
   * few iterations of the loop region after the original sample so the
   * user audibly hears the loop behaviour the Amiga would produce, not
   * just one-shot the whole buffer.
   */
  const FINAL_LOOP_REPEATS = 1 ;
  const buildFinalAudible = (
    ins: typeof model.patch.instruments[number],
    render: NonNullable<typeof lastRender>,
    instrIdx: number,
  ): Int16Array => {
    if (instrHasOp(model, instrIdx, 22) && ins.loopLength > 0) {
      return bytesToInt16WithLoop(
        render.bytes, ins.loopOffset, ins.loopLength, FINAL_LOOP_REPEATS,
      );
    }
    return bytesToInt16(render.bytes);
  };

  /** Internal core; callers can bypass the audioEnabled gate via `force`. */
  const playAuditionInternal = (opts: { force?: boolean } = {}): void => {
    if (!audioEnabled && !opts.force) return;

    // When outputTarget.instrIdx differs from activeIdx (e.g. user clicked
    // 🔊 inside an expanded clone block), render THAT instrument so we
    // can pull its sample / slotTap rather than the active one's.
    let render: typeof lastRender = lastRender;
    let renderIns = model.patch.instruments[activeIdx];
    if (outputTarget.instrIdx !== activeIdx) {
      try {
        render = renderInstrument(model.patch, outputTarget.instrIdx);
        renderIns = model.patch.instruments[outputTarget.instrIdx];
      } catch {
        // Cyclic clone, etc. — just bail; nothing to play.
        return;
      }
    }
    if (!render || !renderIns) return;

    // For final output (slotIdx == null) and for the loop_gen slot's tap
    // we want the looped bytes; intermediate slot taps stay one-shot.
    const targetIsLoopGenSlot = outputTarget.slotIdx != null
      && renderIns.slots[outputTarget.slotIdx]?.fn === 22;
    const sample = (outputTarget.slotIdx != null && !targetIsLoopGenSlot)
      ? slotDisplayTap(renderIns, render, outputTarget.slotIdx)
      : buildFinalAudible(renderIns, render, outputTarget.instrIdx);
    if (!sample || sample.length === 0) return;
    player.play(sample, noteRateHz(previewNote));
  };

  /** Auto-replay-on-change path — gated by the audio toggle. */
  const playAudition = (): void => playAuditionInternal();

  /**
   * Replay whatever's already rendered (does not re-run DSP). Used by spacebar.
   * `force` bypasses the audioEnabled gate — spacebar is an explicit user
   * action, so it always plays even when "autoplayback on changes" is muted.
   */
  const retriggerAudio = (opts: { force?: boolean } = {}): void => {
    if (!audioEnabled && !opts.force) return;
    if (!lastRender) {
      runRender();
    }
    playAuditionInternal({ force: !!opts.force });
  };

  const updateLabels = (): void => {
    const sNum = String(selection.instrIdx + 1).padStart(2, '0');
    if (selection.slotIdx == null) {
      selectionLabel.textContent = `instr ${sNum} / —`;
    } else {
      const ins = model.patch.instruments[selection.instrIdx];
      const slot = ins?.slots[selection.slotIdx];
      const vlabel = slot && slot.outVar > 0 ? ` · v${slot.outVar}` : '';
      selectionLabel.textContent =
        `instr ${sNum} / slot ${String(selection.slotIdx + 1).padStart(2, '0')}${vlabel}`;
    }
    const oNum = String(outputTarget.instrIdx + 1).padStart(2, '0');
    if (outputTarget.slotIdx == null) {
      outputLabel.textContent = `instr ${oNum} / final`;
    } else {
      const ins = model.patch.instruments[outputTarget.instrIdx];
      const slot = ins?.slots[outputTarget.slotIdx];
      const vlabel = slot && slot.outVar > 0 ? ` · v${slot.outVar}` : '';
      outputLabel.textContent =
        `instr ${oNum} / slot ${String(outputTarget.slotIdx + 1).padStart(2, '0')}${vlabel}`;
    }
    updateUndoRedoButtons();
  };

  // MASTER V1 button → route playback to the active instrument's final v1.
  // Always force-plays so the user hears the change immediately, even when
  // the audio toggle is muted (consistent with clicking a slot's 🔊).
  outputMasterBtn.addEventListener('click', () => {
    outputTarget = { instrIdx: activeIdx, slotIdx: null };
    refreshOutputHighlight();
    refreshOutputMasterBtn();
    updateLabels();
    runRender();
    playAuditionInternal({ force: true });
  });

  model.events.on((e) => {
    // Undo/redo synthesises a 'reset' event — rebuild everything from scratch.
    if (e.kind === 'reset') {
      rebuildCloneGraph();
      validateOutputTarget();
      renderMain();
      repaint();
      updateUndoRedoButtons();
      return;
    }
    // Structure changes can rewire the clone graph; rebuild before we decide
    // which instruments are affected. Any structure event can also flip an
    // instrument's validity (var-source becoming unwired, clone source
    // moved out of the legal range, etc.), so always repaint the sidebar.
    if (e.kind === 'structure') {
      rebuildCloneGraph();
      validateOutputTarget();
      repaint();
    }
    // Meta events include the instrument name — the sidebar shows it,
    // so refresh on every meta event so the list stays in sync as the
    // user types. (Repaint is cheap: 31 list items.)
    if (e.kind === 'meta') {
      repaint();
    }
    // The active instrument re-renders whenever IT changes OR when any
    // instrument it (transitively) clones changes. Output target also
    // matters because the user may be playing a different instrument
    // than activeIdx — although currently the UI keeps them aligned.
    const affectsActive =
      e.instrIdx === activeIdx ||
      outputTarget.instrIdx === e.instrIdx ||
      allDependentsOf(cloneGraph, e.instrIdx).has(activeIdx);
    updateUndoRedoButtons();
    if (!affectsActive) return;
    if (e.kind === 'structure') {
      // Layout change → full DOM rebuild (sidebar already repainted above).
      renderMain();
    }
    scheduleRender(true);
  });

  history.on(() => {
    updateUndoRedoButtons();
  });

  // Help modal: open via ? button or unmodified '?' key; close via X / Esc.
  const helpOverlay = root.querySelector('#help-overlay') as HTMLElement;
  const helpCloseBtn = root.querySelector('#help-close') as HTMLButtonElement;
  const showHelp = (): void => helpOverlay.classList.remove('hidden');
  const hideHelp = (): void => helpOverlay.classList.add('hidden');
  const toggleHelp = (): void =>
    helpOverlay.classList.contains('hidden') ? showHelp() : hideHelp();
  (root.querySelector('#btn-help') as HTMLButtonElement).addEventListener('click', toggleHelp);
  helpCloseBtn.addEventListener('click', hideHelp);
  helpOverlay.addEventListener('click', (ev) => {
    if (ev.target === helpOverlay) hideHelp();   // outside click
  });

  // Global keydown / beforeunload. Stored on window so Vite HMR re-mounts
  // don't accumulate duplicate listeners (which would fire savePatch
  // multiple times for one Ctrl+S — the "saving opens twice" bug).
  const w = window as unknown as {
    __funklangKeydown?: (ev: KeyboardEvent) => void;
    __funklangBeforeUnload?: (ev: BeforeUnloadEvent) => void;
  };
  if (w.__funklangKeydown) document.removeEventListener('keydown', w.__funklangKeydown);
  if (w.__funklangBeforeUnload) window.removeEventListener('beforeunload', w.__funklangBeforeUnload);

  const keydownHandler = (ev: KeyboardEvent): void => {
    // If a focused inner control already handled this key (e.g. a knob bar's
    // ArrowUp), defer to it — don't double-fire the global behavior.
    if (ev.defaultPrevented) return;

    // Use BOTH the event target AND document.activeElement to decide if the
    // user is currently typing somewhere. activeElement is more reliable for
    // cases where keydown is delivered to <body> while focus actually sits
    // inside an INPUT (e.g. shortly after a click).
    //
    // `inField` = the user is typing in a text input / dropdown / editable
    // region. Buttons + sliders are NOT counted (they auto-blur on click —
    // see the delegated click handler — so focus shouldn't linger on
    // non-text controls).
    const ae = document.activeElement as HTMLElement | null;
    const target = ev.target as HTMLElement | null;
    const isText = (el: HTMLElement | null): boolean => !!el && (
      el.isContentEditable ||
      el.tagName === 'INPUT' ||
      el.tagName === 'TEXTAREA' ||
      el.tagName === 'SELECT'
    );
    const inField = isText(ae) || isText(target);

    // Esc closes the help modal first.
    if (ev.key === 'Escape' && !helpOverlay.classList.contains('hidden')) {
      ev.preventDefault();
      hideHelp();
      return;
    }
    // '?' (Shift+/ on most layouts) toggles help — only when not in a field.
    if (ev.key === '?' && !inField && !ev.ctrlKey && !ev.metaKey) {
      ev.preventDefault();
      toggleHelp();
      return;
    }

    // Spacebar: replay the latest sound. Only suppressed when actually
    // typing in a text input — buttons/selects DO trigger play because
    // we auto-blur them after click, so focus shouldn't linger on them
    // anyway. Audio toggle does NOT gate spacebar — it's an explicit
    // user action, always honored.
    if ((ev.key === ' ' || ev.code === 'Space') && !inField) {
      ev.preventDefault();
      retriggerAudio({ force: true });
      return;
    }

    // Plain ArrowUp/ArrowDown steps the sidebar instrument selection
    // (auto-plays subject to the audio toggle, like the mouse wheel).
    // Must run BEFORE the `if (!mod) return;` modifier gate below —
    // otherwise no-modifier arrows never reach the rest of the chain.
    // Skip when:
    //   - the user is typing in a field (caret nav inside text inputs)
    //   - the REVERT AUTOSAVE panel is open (its own listener handles
    //     arrows for snapshot browsing — we'd otherwise fire twice)
    const revertOpen = !root.querySelector('#revert-panel')?.classList.contains('hidden');
    if (!inField && !revertOpen && (ev.key === 'ArrowUp' || ev.key === 'ArrowDown')) {
      ev.preventDefault();
      stepInstrument(ev.key === 'ArrowDown' ? 1 : -1, { play: true });
      return;
    }

    const mod = ev.ctrlKey || ev.metaKey;
    if (!mod) return;

    // Save shortcut wins over everything — intercept regardless of focus.
    if (ev.key === 's' || ev.key === 'S') {
      ev.preventDefault();
      if (ev.shiftKey) void savePatchAs();
      else void savePatch();
      return;
    }

    // For undo/redo and instrument nav, leave native behavior alone inside
    // text inputs (so the user can type in instrument-name fields, etc.).
    if (inField) return;
    if (ev.key === 'z' || ev.key === 'Z') {
      if (ev.shiftKey) {
        ev.preventDefault();
        history.redo();
      } else {
        ev.preventDefault();
        history.undo();
      }
    } else if (ev.key === 'y' || ev.key === 'Y') {
      ev.preventDefault();
      history.redo();
    }
  };
  w.__funklangKeydown = keydownHandler;
  document.addEventListener('keydown', keydownHandler);

  // Warn before refresh/close when there's a patch in play.
  const beforeUnloadHandler = (ev: BeforeUnloadEvent): void => {
    const hasWork = patchFileName !== '' || model.patch.instruments.some(
      (ins) => ins.slots.length > 0,
    );
    if (hasWork) {
      ev.preventDefault();
      ev.returnValue = '';
    }
  };
  w.__funklangBeforeUnload = beforeUnloadHandler;
  window.addEventListener('beforeunload', beforeUnloadHandler);

  undoBtn.addEventListener('click', () => history.undo());
  redoBtn.addEventListener('click', () => history.redo());

  // Shared "I've just got a new patch" wiring — used by both the FSA
  // open path (which gives us a write-back handle) and the hidden input
  // fallback (Playwright / Firefox; no handle).
  const adoptPatch = (
    name: string,
    bytes: Uint8Array,
    handle: FileSystemFileHandle | undefined,
  ): void => {
    model.patch = parseAkp(bytes);
    // Klang's GUI never enforced the even-sampleLength rule, so .akp files
    // in the wild can hold odd lengths or out-of-range loop offsets. Fix
    // them up once at adoption time — the editor's downstream code (the
    // wave-viewer "len" meta, the loop_gen knob, …) assumes the rules
    // hold.
    normalizePatch(model.patch);
    patchFileName = name;
    patchFileHandle = handle;
    nameEl.textContent = patchFileName;
    activeIdx = model.patch.instruments.findIndex(
      (ins) => ins.slots.some((s) => s.fn !== 0),
    );
    if (activeIdx < 0) activeIdx = 0;
    selection = { instrIdx: activeIdx, slotIdx: null };
    outputTarget = { instrIdx: activeIdx, slotIdx: null };
    rebuildCloneGraph();
    model.events.emit({ instrIdx: -1, kind: 'reset' });
    warnPatchOver16Slots(model);
    renderMain();
    repaint();
  };

  hidden.addEventListener('change', async () => {
    const f = hidden.files?.[0];
    if (!f) return;
    adoptPatch(f.name, new Uint8Array(await f.arrayBuffer()), undefined);
  });

  // Re-entrancy guard for OPEN PATCH. A double-click inside the OS file
  // dialog can buffer a second click that's delivered to the OPEN button
  // after the dialog closes — without this guard, a second picker opens
  // and the user has to pick the file again. Same pattern as savePatch.
  let opening = false;
  (root.querySelector('#btn-open') as HTMLButtonElement).addEventListener('click', async () => {
    if (opening) return;
    opening = true;
    try {
      const opened = await openFileWithHandle('.akp', 'Klang patch');
      if (!opened) return;
      adoptPatch(opened.name, opened.bytes, opened.handle);
    } finally {
      // Brief tail-window blocks any straggling double-click event that
      // the OS dialog may have queued just as it closed.
      setTimeout(() => { opening = false; }, 300);
    }
  });
  // CLOSE (was NEW): closing a project leaves you with a fresh, blank
  // editor — semantically identical to "new". Disabled when the patch
  // is already in its just-loaded blank state (nothing to close).
  const closeBtn = root.querySelector('#btn-close') as HTMLButtonElement;
  closeBtn.addEventListener('click', () => {
    if (closeBtn.disabled) return;
    // CLOSE wipes the in-memory patch — autosaves are preserved so the
    // user can still REVERT, but the live edit state is gone. Confirm
    // first so a stray click can't nuke unsaved work.
    const label = patchFileName || 'this patch';
    if (!confirm(`Close ${label}? Unsaved changes will be lost. (Autosaves stay available under REVERT AUTOSAVE.)`)) return;
    model.patch = emptyPatch();
    patchFileName = '';
    patchFileHandle = undefined;
    nameEl.textContent = '(no patch)';
    activeIdx = 0;
    selection = { instrIdx: 0, slotIdx: null };
    outputTarget = { instrIdx: 0, slotIdx: null };
    rebuildCloneGraph();
    model.events.emit({ instrIdx: -1, kind: 'reset' });
    renderMain();
    repaint();
  });
  // Single audio toggle replaces PLAY/STOP/RETRIG. Green = on (changes
  // auto-replay, spacebar replays). Red = muted (re-renders still happen so
  // waveforms stay live, but nothing is sent to the speakers).
  const audioToggle = root.querySelector('#btn-audio-toggle') as HTMLButtonElement;
  const updateAudioToggle = (): void => {
    audioToggle.classList.toggle('on',  audioEnabled);
    audioToggle.classList.toggle('off', !audioEnabled);
    audioToggle.title = audioEnabled
      ? 'Audio on — click to mute (changes still re-render). Spacebar replays.'
      : 'Audio muted — click to unmute.';
    reflectAudioOnDot();
  };
  audioToggle.addEventListener('click', (ev) => {
    // Shift-click = diagnostic test tone: routes a 0.8s 440 Hz sine wave
    // through the same Player path that real audition uses. If you can
    // SEE the tab speaker icon active while playing but HEAR nothing,
    // this confirms whether the Player / Web Audio chain itself is
    // producing output (vs the silence being caused by sample data,
    // tab-mute, sink routing, etc.). Logs Player state to the console.
    if (ev.shiftKey) {
      const RATE = 22050;
      const LEN_S = 0.8;
      const N = (RATE * LEN_S) | 0;
      const sample = new Int16Array(N);
      const freq = 440;
      for (let i = 0; i < N; i++) {
        sample[i] = Math.round(Math.sin((i / RATE) * 2 * Math.PI * freq) * 16000);
      }
      // eslint-disable-next-line no-console
      console.log('[funklang] test tone: 440 Hz sine, 0.8s, peak ±16000');
      player.play(sample, RATE);
      return;
    }
    audioEnabled = !audioEnabled;
    if (!audioEnabled) player.stop();
    updateAudioToggle();
  });
  updateAudioToggle();

  // Auto-blur BUTTON / SELECT after click so focus doesn't linger on UI
  // controls. Text inputs (knob inline editor, instr-header fields) and
  // knob bars (which the user explicitly focused for keyboard nav) keep
  // their focus. Without this, clicking the SAVE button would leave it
  // focused → spacebar would re-activate it instead of replaying audio.
  root.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement | null;
    if (!t) return;
    // Walk up to the nearest button (event might be on a child icon span).
    const btn = t.closest('button');
    if (btn && btn instanceof HTMLElement) {
      // Defer to next tick so the click handler can react first.
      queueMicrotask(() => btn.blur());
      return;
    }
    if (t.tagName === 'SELECT') {
      queueMicrotask(() => t.blur());
    }
  });

  // Re-entrancy guard so a quick Ctrl+S double-tap (or a Ctrl+S that
  // races with a SAVE button click) doesn't open the picker twice.
  let saving = false;

  // Save current patch. If we have a write-back handle (FSA-opened or
  // captured from a previous SAVE AS), write silently — no dialog. Only
  // when no handle is available (Firefox / Safari, or fresh patch never
  // saved) do we fall back to a picker / download.
  const savePatch = async (): Promise<void> => {
    if (saving) return;
    saving = true;
    try {
      const bytes = serializeAkp(model.patch);
      if (patchFileHandle) {
        try {
          await saveToHandle(patchFileHandle, bytes);
          return;
        } catch { /* fall through to picker fallback */ }
      }
      const name = patchFileName || 'patch.akp';
      const newHandle = await saveFileBytes(bytes, name, '.akp');
      if (newHandle) {
        patchFileHandle = newHandle;
        try {
          const f = await newHandle.getFile();
          patchFileName = f.name;
          nameEl.textContent = patchFileName;
        } catch { /* ignore */ }
      }
    } finally {
      // Brief tail-window blocks any straggling double-click event the OS
      // save dialog may have queued just as it closed.
      setTimeout(() => { saving = false; }, 300);
    }
  };

  const savePatchAs = async (): Promise<void> => {
    if (saving) return;
    saving = true;
    try {
      const bytes = serializeAkp(model.patch);
      const name = patchFileName || 'patch.akp';
      const newHandle = await saveFileBytes(bytes, name, '.akp');
      if (newHandle) {
        patchFileHandle = newHandle;
        try {
          const f = await newHandle.getFile();
          patchFileName = f.name;
          nameEl.textContent = patchFileName;
        } catch { /* ignore */ }
      }
    } finally {
      // Brief tail-window blocks any straggling double-click event the OS
      // save dialog may have queued just as it closed.
      setTimeout(() => { saving = false; }, 300);
    }
  };

  (root.querySelector('#btn-save-as') as HTMLButtonElement).addEventListener('click', () => { void savePatchAs(); });
  (root.querySelector('#btn-save') as HTMLButtonElement).addEventListener('click', () => { void savePatch(); });

  const noteSelect = root.querySelector('#note-select') as HTMLSelectElement;
  noteSelect.addEventListener('change', () => {
    previewNote = noteSelect.value;
    saveStoredNote(previewNote);
    // No re-render needed — the sample data is unchanged, only the
    // playback rate moves. Replay so the user hears the new note.
    playAudition();
  });
  attachWheelStep(noteSelect);

  // ── Autosave ────────────────────────────────────────────────────
  // Snapshot the current patch to localStorage every minute so a tab
  // crash / refresh doesn't lose work. On mount, if there's an existing
  // autosave AND the in-memory patch is still empty (i.e. this is a
  // genuine boot, not an HMR rebuild that already has state), restore
  // the most recent autosave silently — saves the user a click after a
  // page reload.
  const bootAutosave = latestAutosave();
  if (bootAutosave) {
    const patchIsBlank = !model.patch.instruments.some(
      (ins) => ins.slots.some((s) => s.fn !== 0),
    );
    if (patchIsBlank) {
      try {
        model.patch = restoreAutosave(bootAutosave);
        normalizePatch(model.patch);
        activeIdx = model.patch.instruments.findIndex(
          (ins) => ins.slots.some((s) => s.fn !== 0),
        );
        if (activeIdx < 0) activeIdx = 0;
        selection = { instrIdx: activeIdx, slotIdx: null };
        outputTarget = { instrIdx: activeIdx, slotIdx: null };
        rebuildCloneGraph();
        model.events.emit({ instrIdx: -1, kind: 'reset' });
      } catch { /* corrupt entry — ignore, user can browse REVERT panel */ }
    }
  }
  // Kick off the recurring loop. (Stop function discarded — the app's
  // lifetime is the page lifetime; no clean shutdown needed.)
  startAutosaveLoop(() => model.patch);

  // ── REVERT AUTOSAVE side panel ──────────────────────────────────
  const revertPanel = root.querySelector('#revert-panel') as HTMLElement;
  const revertList  = root.querySelector('#revert-list')  as HTMLElement;
  const revertClose = root.querySelector('#revert-close') as HTMLButtonElement;
  const revertBtn   = root.querySelector('#btn-revert')   as HTMLButtonElement;

  let revertEntries: ReturnType<typeof listAutosaves> = [];

  const restoreEntry = (i: number): void => {
    const entry = revertEntries[i];
    if (!entry) return;
    try {
      model.patch = restoreAutosave(entry);
      normalizePatch(model.patch);
      if (activeIdx >= model.patch.instruments.length) activeIdx = 0;
      const ins = model.patch.instruments[activeIdx];
      if (!ins || ins.slots.every((s) => s.fn === 0)) {
        // Active instrument is empty in the restored patch — fall back
        // to the first populated one so the user actually sees something.
        const firstFilled = model.patch.instruments.findIndex(
          (i2) => i2.slots.some((s) => s.fn !== 0),
        );
        if (firstFilled >= 0) activeIdx = firstFilled;
      }
      selection = { instrIdx: activeIdx, slotIdx: null };
      outputTarget = { instrIdx: activeIdx, slotIdx: null };
      rebuildCloneGraph();
      model.events.emit({ instrIdx: -1, kind: 'reset' });
      renderMain();
      repaint();
      playAudition();   // user wants to HEAR the loaded state
    } catch (err) {
      console.error('Failed to restore autosave', err);
    }
  };

  const selectRevertRow = (i: number): void => {
    const rows = Array.from(revertList.querySelectorAll('.revert-row')) as HTMLElement[];
    if (i < 0 || i >= rows.length) return;
    for (const r of rows) r.classList.remove('active');
    rows[i]!.classList.add('active');
    rows[i]!.scrollIntoView({ block: 'nearest' });
    restoreEntry(i);
  };

  const openRevertPanel = (): void => {
    // Snapshot CURRENT state to the top of the list before browsing —
    // user-requested escape hatch so they can roll back any preview.
    saveAutosave(model.patch);
    revertEntries = listAutosaves();
    revertList.innerHTML = '';
    revertEntries.forEach((entry, i) => {
      const li = document.createElement('li');
      li.className = 'revert-row';
      // Highlight the CURRENT row by default so the user has a visible
      // "I'm here" anchor before any scrolling starts.
      if (i === 0) li.classList.add('active');
      const ts = new Date(entry.timestamp);
      const labelLeft = i === 0 ? 'CURRENT' : `${i} ${i === 1 ? 'save' : 'saves'} ago`;
      li.innerHTML = `<span class="revert-label">${labelLeft}</span><span class="revert-time">${ts.toLocaleString()}</span>`;
      li.addEventListener('click', () => selectRevertRow(i));
      revertList.appendChild(li);
    });
    revertPanel.classList.remove('hidden');
    revertPanel.setAttribute('aria-hidden', 'false');
  };
  const closeRevertPanel = (): void => {
    revertPanel.classList.add('hidden');
    revertPanel.setAttribute('aria-hidden', 'true');
  };
  revertBtn.addEventListener('click', openRevertPanel);
  revertClose.addEventListener('click', closeRevertPanel);

  // Keyboard browse when the panel is open: Up/Down move highlight +
  // load that snapshot (so the user actually HEARS each entry as they
  // scroll). Escape closes.
  document.addEventListener('keydown', (e) => {
    if (revertPanel.classList.contains('hidden')) return;
    if (e.key === 'Escape') { e.preventDefault(); closeRevertPanel(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const rows = Array.from(revertList.querySelectorAll('.revert-row')) as HTMLElement[];
    if (rows.length === 0) return;
    const curIdx = Math.max(0, rows.findIndex((r) => r.classList.contains('active')));
    const nextIdx = Math.max(0, Math.min(rows.length - 1, curIdx + (e.key === 'ArrowDown' ? 1 : -1)));
    if (nextIdx === curIdx) return;
    e.preventDefault();
    selectRevertRow(nextIdx);
  });

  // Wheel inside the panel scrolls the SELECTION (not the DOM scroll
  // position) — each notch moves to the next/previous autosave and
  // loads it so the user can spin through history with one finger.
  revertPanel.addEventListener('wheel', (e) => {
    if (revertPanel.classList.contains('hidden')) return;
    const rows = Array.from(revertList.querySelectorAll('.revert-row')) as HTMLElement[];
    if (rows.length === 0) return;
    e.preventDefault();
    const curIdx = Math.max(0, rows.findIndex((r) => r.classList.contains('active')));
    const nextIdx = Math.max(0, Math.min(rows.length - 1, curIdx + (e.deltaY > 0 ? 1 : -1)));
    if (nextIdx === curIdx) return;
    selectRevertRow(nextIdx);
  }, { passive: false });

  // Click outside the panel (and not on the REVERT button that opened
  // it) closes the panel. mousedown rather than click so the panel
  // disappears the moment a stray editor click lands.
  document.addEventListener('mousedown', (e) => {
    if (revertPanel.classList.contains('hidden')) return;
    const t = e.target as Node;
    if (revertPanel.contains(t)) return;
    if (revertBtn.contains(t)) return;   // opening click would immediately close
    closeRevertPanel();
  });

  // Global hex/dec display toggle. Flipping it just re-renders the
  // active instrument (slot-grid knobs read the current base in their
  // own paint path) and refreshes the instrument header.
  const baseSel = root.querySelector('#display-base') as HTMLSelectElement;
  baseSel.value = getDisplayBase();
  baseSel.addEventListener('change', () => {
    setDisplayBase(baseSel.value === 'hex' ? 'hex' : 'dec');
  });
  attachWheelStep(baseSel);
  onDisplayBaseChange(() => {
    // Every knob / number field reads its display string from
    // `formatInt` — re-render the whole editor so they update.
    renderMain();
    repaint();
  });

  renderMain();
  repaint();
  updateUndoRedoButtons();
}
