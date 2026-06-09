import { PatchModel, adjustIndexForMove } from '../patch/model';
import { HistoryManager } from '../patch/history';
import { emptyPatch, emptyInstrument, N_SLOTS_EDITABLE } from '../patch/types';
import { parseAkp, serializeAkp } from '../fileio/akp';
import { parseAki, serializeAki } from '../fileio/aki';
import { renderInstrument, CyclicCloneError } from '../dsp/engine';
import { isPostRenderOp } from '../schema/op-metadata';
import type { RenderResult } from '../dsp/types';
import { Player } from '../audio/player';
import { buildCloneGraph, allDependentsOf } from '../patch/clone-graph';
import { clampLoopOffset, loopLengthFor } from '../patch/loop-rules';
import { normalizePatch } from '../patch/normalize';
import type { CloneGraph } from '../patch/clone-graph';
import { renderSidebar } from './sidebar';
import { helpOverlayHtml, wireHelp } from './help-modal';
import { renderInstrHeader } from './instr-header';
import { renderSlotGrid, updateSlotWaves, findExpandedCloneGrids } from './slot-grid';
import { wireSizeStatusbar, type SizeStatusbar } from './size-statusbar';
import { annotateSlotSizes } from './annotate-slot-sizes';
import { computeBreakdown } from '../sizecalc/breakdown';
import { CALIBRATION } from '../sizecalc/calibration-data';
import { bytesToInt16 } from './waveform';
import { makeWaveViewer } from './wave-viewer';
import type { WaveViewer } from './wave-viewer';
import { openFileBytes, openFileWithHandle, saveFileBytes, saveToHandle } from './file-dialog';
import { attachWheelStep } from './wheel';
import { getDisplayBase, setDisplayBase, onDisplayBaseChange } from './number-format';
import { startAutosaveLoop, latestAutosave, restoreAutosave } from './autosave';
import { wireRevertPanel } from './revert-panel';
import { slotDisplayTap, audibleForTarget, instrumentHasPostRender } from './audio-tap';
import { firstPopulatedInstrument, isPatchBlank, instrumentIsEmpty } from '../patch/queries';
import { createEditorState } from './editor-state';
import { NOTE_LIST, noteRateHz, DEFAULT_NOTE } from './note-table';

const DEBOUNCE_MS = 80;
const NOTE_LS_KEY = 'funklang.previewNote';

/**
 * Two separate concepts:
 *  - `state.selection`:    which slot the user is "looking at" (edit focus).
 *                    Set by clicking a slot row. Mutating knob values does
 *                    NOT change this.
 *  - `state.outputTarget`: which signal feeds the audio player. `slotIdx === null`
 *                    means "play the instrument's final v1 output". Only the
 *                    user explicitly retargets this (header dropdown or the
 *                    per-row 🔊 button).
 */
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
  // All editor view-state (focus / selection / output tap / file / audio)
  // lives in one cohesive object so it can be passed to controllers.
  const state = createEditorState(loadStoredNote());
  // Reverse clone-dependency index. Rebuilt on structure changes.
  let cloneGraph: CloneGraph = buildCloneGraph(model.patch);

  const noteOptions = NOTE_LIST
    .map((n) => `<option value="${n}"${n === state.previewNote ? ' selected' : ''}>${n}</option>`)
    .join('');

  root.innerHTML = `
    <div class="app">
      <header>
        <div class="brand"><div class="dot"></div><span>FUNKLANG.WEB</span></div>
        <div class="menu">
          <button id="menu-toggle" class="menu-toggle" aria-label="Menu" aria-expanded="false" title="Menu">☰</button>
          <div class="menu-items">
          <button id="btn-close" title="Close the current patch — gives you a blank project ready to edit. Disabled when nothing has been done.">CLOSE</button>
          <button id="btn-open">OPEN&nbsp;PATCH</button>
          <button id="btn-save">SAVE</button>
          <button id="btn-save-as">SAVE&nbsp;AS</button>
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
        </div>
        <div class="file-info">
          <span class="file-name" id="file-name">(no patch)</span>
        </div>
      </header>
      ${helpOverlayHtml()}
      <aside class="sidebar" id="sidebar">
        <button class="sidebar-title" id="sidebar-toggle" aria-expanded="false" title="Instrument list. On narrow screens it collapses to the active number — click to float the full list over the editor.">
          <span class="sb-title-full">PATCH · INSTRUMENTS</span>
          <span class="sb-title-num" id="sb-active-num">01</span>
        </button>
        <ul class="instr-list" id="instr-list"></ul>
      </aside>
      <main id="main-area"></main>
      <footer>
        <button id="size-status" class="size-status" title="Click for size breakdown">—</button>
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
  const sidebarEl = root.querySelector('#sidebar') as HTMLElement;
  const sidebarToggleEl = root.querySelector('#sidebar-toggle') as HTMLButtonElement;
  const sbActiveNumEl = root.querySelector('#sb-active-num') as HTMLElement;
  const nameEl = root.querySelector('#file-name') as HTMLElement;
  const mainEl = root.querySelector('#main-area') as HTMLElement;
  const hidden = root.querySelector('#hidden-file-input') as HTMLInputElement;
  const selectionLabel = root.querySelector('#selection-label') as HTMLElement;
  const outputLabel = root.querySelector('#output-label') as HTMLElement;
  const outputMasterBtn = root.querySelector('#btn-output-master') as HTMLButtonElement;

  // Narrow-screen sidebar: CSS (a width media query) collapses the
  // instrument list to a rail showing just the active instrument number;
  // clicking the header floats the full list over the editor. JS only
  // toggles the open/closed class — the layout is entirely CSS.
  const setSidebarOpen = (open: boolean): void => {
    sidebarEl.classList.toggle('sb-open', open);
    sidebarToggleEl.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  sidebarToggleEl.addEventListener('click', (e) => {
    e.stopPropagation();
    setSidebarOpen(!sidebarEl.classList.contains('sb-open'));
  });
  // A click anywhere outside the floating panel closes it.
  document.addEventListener('click', (e) => {
    if (sidebarEl.classList.contains('sb-open') && !sidebarEl.contains(e.target as Node)) {
      setSidebarOpen(false);
    }
  });

  // Per-render caches of the slot-grid container and wave viewer so we can
  // call updateSlotWaves / viewer.setSample without rebuilding the DOM.
  let gridHostEl: HTMLElement | null = null;
  let sizeBar: SizeStatusbar | null = null;
  let waveViewer: WaveViewer | null = null;
  // Which instrument the slot-grid host was last rendered for. Used to
  // decide whether a captured scrollTop should be restored: only when the
  // rebuild is for the SAME instrument (a structural edit), never when the
  // user switched to a different instrument (which should start at top).
  let gridHostInstrIdx: number | null = null;
  let lastRender: RenderResult | null = null;
  let cycleError: CyclicCloneError | null = null;

  const rebuildCloneGraph = (): void => {
    cloneGraph = buildCloneGraph(model.patch);
  };


  /**
   * If `state.outputTarget.slotIdx` no longer references a valid slot (e.g. the
   * row was deleted by undo / removeSlot), fall back to the instrument's
   * final output.
   */
  const validateOutputTarget = (): void => {
    const ins = model.patch.instruments[state.outputTarget.instrIdx];
    if (!ins) {
      state.outputTarget = { instrIdx: state.activeIdx, slotIdx: null };
      return;
    }
    if (state.outputTarget.slotIdx != null) {
      const slot = ins.slots[state.outputTarget.slotIdx];
      if (!slot || slot.fn === 0) {
        state.outputTarget = { instrIdx: state.outputTarget.instrIdx, slotIdx: null };
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

    // Capture slot-grid scrollTop so structural rebuilds (move slot,
    // insert/delete slot, etc.) don't snap the user back to the top
    // when they're working at the bottom of a long instrument. Only
    // honoured when the rebuild targets the SAME instrument — switching
    // instruments should start at the top, not inherit the old scroll.
    const sameInstrument = gridHostInstrIdx === state.activeIdx;
    const prevScrollTop = sameInstrument ? (gridHostEl?.scrollTop ?? 0) : 0;

    mainEl.innerHTML = '';
    const ins = model.patch.instruments[state.activeIdx];
    if (!ins) {
      gridHostEl = null;
      gridHostInstrIdx = null;
      waveViewer = null;
      return;
    }
    const headerHost = document.createElement('div');
    mainEl.appendChild(headerHost);
    renderInstrHeader(headerHost, model, state.activeIdx, {
      onImportAki: () => { void importAkiForActive(); },
      onExportAki: () => { void exportAkiForActive(); },
      onRemove:    () => removeInstrumentWithConfirm(state.activeIdx),
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
        const ins = model.patch.instruments[state.activeIdx];
        if (!ins) return;
        const snapped = clampLoopOffset(ins.sampleLength, rawOffset);
        const newLen = loopLengthFor(ins.sampleLength, snapped);
        if (snapped !== ins.loopOffset) {
          model.setInstrumentField(state.activeIdx, 'loopOffset', snapped);
        }
        if (newLen !== ins.loopLength) {
          model.setInstrumentField(state.activeIdx, 'loopLength', newLen);
        }
      },
      onLoopCommit: () => {
        // Drag finished — NOW it's safe to do the structural refresh
        // that rebuilds the slot-grid so the loop_gen slot's `offset`
        // knob picks up the new value. (The slot grid is the only
        // listener that has a stale view of `ins.loopOffset` after
        // the meta events above.)
        applyEdit({ kind: 'structure', instrIdx: state.activeIdx });
      },
    });

    const gridHost = document.createElement('div');
    gridHost.className = 'slot-grid-host';
    mainEl.appendChild(gridHost);
    gridHostEl = gridHost;
    gridHostInstrIdx = state.activeIdx;
    renderSlotGrid(gridHost, model, state.activeIdx, {
      selectedSlot: state.selection.instrIdx === state.activeIdx ? state.selection.slotIdx : null,
      outputSlot: state.outputTarget.slotIdx,
      outputInstr: state.outputTarget.instrIdx,
      onSelect: (slotIdx) => {
        state.selection = { instrIdx: state.activeIdx, slotIdx };
        // Refresh only the row highlights + footer label — don't replay audio
        // and don't change the output target.
        refreshSelectionHighlight();
        updateLabels();
      },
      onSetOutput: (srcInstrIdx, slotIdx) => {
        // srcInstrIdx may not be state.activeIdx if 🔊 was clicked inside an
        // expanded clone block — the inner grid belongs to the source
        // instrument. Honour the actual instr the slot belongs to so the
        // user hears that slot's tap, not the active instrument's.
        state.outputTarget = { instrIdx: srcInstrIdx, slotIdx };
        refreshOutputHighlight();
        refreshOutputMasterBtn();
        updateLabels();
        runRender();
        // Force-play so clicking the 🔊 always auditions the new target,
        // even when autoplayback-on-change is muted.
        playAuditionInternal({ force: true });
      },
    });
    runRender();   // also paints slot byte-cost labels via annotateActiveSizes
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

    // Restore the captured scroll position. `gridHostEl` has been
    // reassigned to the freshly-built host earlier in this rebuild,
    // so it points at the new node — no need to re-querySelector.
    if (prevScrollTop > 0 && gridHostEl) gridHostEl.scrollTop = prevScrollTop;
  };

  // Paint per-slot byte-cost labels onto the active instrument's grid. Uses
  // the module-scoped gridHostEl (whose direct child is `.slots`). Safe to
  // call repeatedly — annotateSlotSizes upserts its spans.
  const annotateActiveSizes = (): void => {
    if (!gridHostEl) return;
    annotateSlotSizes(gridHostEl, model.patch, state.activeIdx, CALIBRATION);
  };

  /** Re-tag .selected / .active on slot rows without rebuilding the grid. */
  const refreshSelectionHighlight = (): void => {
    if (!gridHostEl) return;
    const rows = gridHostEl.querySelectorAll('.slots > .slot-wrap > .slot');
    for (const r of Array.from(rows)) {
      const el = r as HTMLElement;
      const idx = parseInt(el.dataset['slot'] ?? '-1', 10);
      const isSel = state.selection.instrIdx === state.activeIdx && idx === state.selection.slotIdx;
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
      const isOut = state.outputTarget.instrIdx === state.activeIdx && idx === state.outputTarget.slotIdx;
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
    const isMaster = state.outputTarget.instrIdx === state.activeIdx && state.outputTarget.slotIdx == null;
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
    if (want === state.activeIdx) return;
    state.activeIdx = want;
    state.selection = { instrIdx: want, slotIdx: null };
    state.outputTarget = { instrIdx: want, slotIdx: null };
    applyEdit({ kind: 'select' }, { audition: opts.play });   // audition gated by state.audioEnabled
  };

  /**
   * Step the sidebar state.selection by `delta`, skipping over empty instruments
   * so wheel/arrow nav lands only on something audible. Wraps around past
   * the ends so you can scroll continuously.
   */
  const stepInstrument = (delta: number, opts: { play?: boolean } = {}): void => {
    const list = model.patch.instruments;
    const n = list.length;
    if (n === 0) return;
    const dir = delta > 0 ? 1 : -1;
    let next = state.activeIdx;
    for (let tries = 0; tries < n; tries++) {
      next = (next + dir + n) % n;
      const ins = list[next];
      if (ins && ins.slots.some((s) => s.fn !== 0)) {
        selectInstrument(next, opts);
        return;
      }
    }
    // No non-empty instrument anywhere — leave state.activeIdx alone.
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
      model.patch.instruments[state.activeIdx] = ins;
      applyEdit({ kind: 'structure', instrIdx: state.activeIdx });
    } finally {
      setTimeout(() => { importing = false; }, 300);
    }
  };
  let exporting = false;
  const exportAkiForActive = async (): Promise<void> => {
    if (exporting) return;
    exporting = true;
    try {
      const ins = model.patch.instruments[state.activeIdx];
      if (!ins) return;
      const bytes = serializeAki(ins);
      const stem = (ins.name || `instr_${state.activeIdx + 1}`).replace(/[^\w.-]+/g, '_');
      await saveFileBytes(bytes, `${stem}.aki`, '.aki');
    } finally {
      setTimeout(() => { exporting = false; }, 300);
    }
  };

  // "Nothing to close" = no instrument has any filled slot AND no patch
  // file is associated. CLOSE button greys out in that state because
  // clicking it would be a no-op.
  const patchHasContent = (): boolean => {
    if (state.patchFileName) return true;
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
    applyEdit({ kind: 'structure', instrIdx: i });
  };

  // Reorder an instrument AND remap the three host-side indices
  // (state.activeIdx / state.selection / state.outputTarget) that currently point at
  // OLD positions in the array. Mirrors the splice the model does:
  //   - from itself maps to to
  //   - indices the splice walks over shift by ±1
  // Used by both the sidebar drag handler and __funklangModel so the
  // E2E shim and real drag UX behave identically.
  const moveInstrumentWithRemap = (from: number, to: number): void => {
    const adjust = (idx: number): number => adjustIndexForMove(idx, from, to);
    state.activeIdx = adjust(state.activeIdx);
    state.selection = { instrIdx: adjust(state.selection.instrIdx), slotIdx: state.selection.slotIdx };
    state.outputTarget = { instrIdx: adjust(state.outputTarget.instrIdx), slotIdx: state.outputTarget.slotIdx };
    model.moveInstrument(from, to);
  };

  const repaint = (): void => {
    renderSidebar(listEl, model.patch, state.activeIdx, {
      // Sidebar click also auto-plays (subject to the audio toggle), same
      // as wheel/arrow nav. Empty rows are clickable now too — the slot
      // grid renders an empty-state placeholder with a [+] button there.
      // On a narrow screen, picking also dismisses the floating panel.
      onPick: (i) => { selectInstrument(i, { play: true }); setSidebarOpen(false); },
      onDelete: removeInstrumentWithConfirm,
      onMove: moveInstrumentWithRemap,
    });
    // Keep the collapsed-rail number in sync with the active instrument.
    sbActiveNumEl.textContent = String(state.activeIdx + 1).padStart(2, '0');
    updateCloseButton();
  };

  // Sidebar wheel + arrow nav. Wheel anywhere over the list scrolls the
  // SELECTION (not the DOM scroll); arrows do the same when the keydown
  // target isn't inside a text field. Both auto-play if audio is on.
  listEl.addEventListener('wheel', (e) => {
    e.preventDefault();
    stepInstrument(e.deltaY > 0 ? 1 : -1, { play: true });
  }, { passive: false });

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
    const ins = model.patch.instruments[state.activeIdx];
    if (!ins) return;
    try {
      lastRender = renderInstrument(model.patch, state.activeIdx);
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
    // Slot byte-cost labels are derived from the patch model, not the render
    // output, so paint them even when lastRender is null (e.g. a cyclic-clone
    // render leaves the canvases blank). annotateActiveSizes guards gridHostEl.
    annotateActiveSizes();
    if (waveViewer) {
      const finalAudible = lastRender ? bytesToInt16(lastRender.bytes) : null;
      const target = (state.outputTarget.instrIdx === state.activeIdx && state.outputTarget.slotIdx != null && lastRender)
        ? (slotDisplayTap(ins, lastRender, state.outputTarget.slotIdx))
        : finalAudible;
      // Loop overlay only when the active instrument has a loop_gen op.
      // The user wants the band hidden otherwise.
      const showLoop = instrumentHasPostRender(ins);
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

  // Cache the brand-dot element so we can drive its "autoplayback active"
  // pulse animation off state.audioEnabled. The CSS pulse runs only while the
  // `.audio-on` class is present on the brand container.
  const brandEl = root.querySelector('.brand') as HTMLElement | null;
  const reflectAudioOnDot = (): void => {
    if (brandEl) brandEl.classList.toggle('audio-on', state.audioEnabled);
  };

  /** Internal core; callers can bypass the state.audioEnabled gate via `force`. */
  const playAuditionInternal = (opts: { force?: boolean } = {}): void => {
    if (!state.audioEnabled && !opts.force) return;

    // When state.outputTarget.instrIdx differs from state.activeIdx (e.g. user clicked
    // 🔊 inside an expanded clone block), render THAT instrument so we
    // can pull its sample / slotTap rather than the active one's.
    let render: typeof lastRender = lastRender;
    let renderIns = model.patch.instruments[state.activeIdx];
    if (state.outputTarget.instrIdx !== state.activeIdx) {
      try {
        render = renderInstrument(model.patch, state.outputTarget.instrIdx);
        renderIns = model.patch.instruments[state.outputTarget.instrIdx];
      } catch {
        // Cyclic clone, etc. — just bail; nothing to play.
        return;
      }
    }
    if (!render || !renderIns) return;

    // audibleForTarget picks the right buffer: final output for slotIdx
    // null or a loop_gen slot, the slot's one-shot tap otherwise.
    const sample = audibleForTarget(renderIns, render, state.outputTarget.slotIdx);
    if (!sample || sample.length === 0) return;
    player.play(sample, noteRateHz(state.previewNote));
  };

  /** Auto-replay-on-change path — gated by the audio toggle. */
  const playAudition = (): void => playAuditionInternal();

  /**
   * The single "I changed something — refresh accordingly" verb. Handlers
   * describe WHAT changed; this owns HOW the refresh cascade runs, so the
   * clone-graph / DOM / sidebar / audio steps live in one place instead of
   * being hand-copied (and easy to get subtly wrong, or double-run) at every
   * call site.
   *
   * For 'reset' and 'structure' the work is delegated to the model-event
   * subscriber below: emitting the event IS the refresh — it rebuilds the
   * clone graph, revalidates the output target, re-renders grid + sidebar,
   * and (for a structure change touching the active instrument) re-auditions
   * via the debounced path. 'select' is a pure view change (no model
   * mutation, no event), so it re-renders directly.
   */
  type EditScope =
    | { kind: 'reset' }                        // whole patch replaced (open / close / revert / restore)
    | { kind: 'structure'; instrIdx: number }  // slot layout or clone wiring changed
    | { kind: 'select' };                      // active instrument switched; no data change
  const applyEdit = (scope: EditScope, opts: { audition?: boolean | undefined } = {}): void => {
    switch (scope.kind) {
      case 'reset':
        model.events.emit({ instrIdx: -1, kind: 'reset' });
        break;
      case 'structure':
        model.events.emit({ instrIdx: scope.instrIdx, kind: 'structure' });
        break;
      case 'select':
        renderMain();
        repaint();
        break;
    }
    if (opts.audition) playAudition();
  };

  /**
   * Replay whatever's already rendered (does not re-run DSP). Used by spacebar.
   * `force` bypasses the state.audioEnabled gate — spacebar is an explicit user
   * action, so it always plays even when "autoplayback on changes" is muted.
   */
  const retriggerAudio = (opts: { force?: boolean } = {}): void => {
    if (!state.audioEnabled && !opts.force) return;
    if (!lastRender) {
      runRender();
    }
    playAuditionInternal({ force: !!opts.force });
  };

  const updateLabels = (): void => {
    const sNum = String(state.selection.instrIdx + 1).padStart(2, '0');
    if (state.selection.slotIdx == null) {
      selectionLabel.textContent = `instr ${sNum} / —`;
    } else {
      const ins = model.patch.instruments[state.selection.instrIdx];
      const slot = ins?.slots[state.selection.slotIdx];
      const vlabel = slot && slot.outVar > 0 ? ` · v${slot.outVar}` : '';
      selectionLabel.textContent =
        `instr ${sNum} / slot ${String(state.selection.slotIdx + 1).padStart(2, '0')}${vlabel}`;
    }
    const oNum = String(state.outputTarget.instrIdx + 1).padStart(2, '0');
    if (state.outputTarget.slotIdx == null) {
      outputLabel.textContent = `instr ${oNum} / final`;
    } else {
      const ins = model.patch.instruments[state.outputTarget.instrIdx];
      const slot = ins?.slots[state.outputTarget.slotIdx];
      const vlabel = slot && slot.outVar > 0 ? ` · v${slot.outVar}` : '';
      outputLabel.textContent =
        `instr ${oNum} / slot ${String(state.outputTarget.slotIdx + 1).padStart(2, '0')}${vlabel}`;
    }
    sizeBar?.refresh();
  };

  // MASTER V1 button → route playback to the active instrument's final v1.
  // Always force-plays so the user hears the change immediately, even when
  // the audio toggle is muted (consistent with clicking a slot's 🔊).
  outputMasterBtn.addEventListener('click', () => {
    state.outputTarget = { instrIdx: state.activeIdx, slotIdx: null };
    refreshOutputHighlight();
    refreshOutputMasterBtn();
    updateLabels();
    runRender();
    playAuditionInternal({ force: true });
  });

  sizeBar = wireSizeStatusbar(root, model, () => state.selection.instrIdx);

  model.events.on((e) => {
    // Undo/redo synthesises a 'reset' event — rebuild everything from scratch.
    if (e.kind === 'reset') {
      rebuildCloneGraph();
      validateOutputTarget();
      renderMain();
      repaint();
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
    // than state.activeIdx — although currently the UI keeps them aligned.
    const affectsActive =
      e.instrIdx === state.activeIdx ||
      state.outputTarget.instrIdx === e.instrIdx ||
      allDependentsOf(cloneGraph, e.instrIdx).has(state.activeIdx);
    if (!affectsActive) return;
    if (e.kind === 'structure') {
      // Layout change → full DOM rebuild (sidebar already repainted above).
      renderMain();
    }
    scheduleRender(true);
  });

  history.on(() => {
  });

  // Help modal: open via ? button or unmodified '?' key; close via X / Esc.
  const help = wireHelp(root);

  // ── Responsive top menu: collapse to a hamburger when the toolbar would
  //    overflow. Measured against the expanded layout so it adapts to the
  //    actual content width, not a guessed breakpoint.
  const headerEl = root.querySelector('header') as HTMLElement;
  const menuEl = root.querySelector('.menu') as HTMLElement;
  const menuToggleEl = root.querySelector('#menu-toggle') as HTMLButtonElement;
  const menuItemsEl = root.querySelector('.menu-items') as HTMLElement;
  const setMenuOpen = (open: boolean): void => {
    menuEl.classList.toggle('open', open);
    menuToggleEl.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  const checkMenuOverflow = (): void => {
    menuEl.classList.remove('collapsed');          // expand to measure true content width
    const overflow = menuItemsEl.scrollWidth > menuItemsEl.clientWidth + 1;
    menuEl.classList.toggle('collapsed', overflow);
    if (!overflow) setMenuOpen(false);             // never leave a dropdown stuck open when expanded
  };
  menuToggleEl.addEventListener('click', (e) => {
    e.stopPropagation();
    setMenuOpen(!menuEl.classList.contains('open'));
  });
  // A button inside the dropdown closes it (selects stay — they open natively).
  menuItemsEl.addEventListener('click', (e) => {
    if (menuEl.classList.contains('collapsed') && (e.target as HTMLElement).closest('button')) setMenuOpen(false);
  });
  document.addEventListener('click', (e) => {
    if (menuEl.classList.contains('open') && !menuEl.contains(e.target as Node)) setMenuOpen(false);
  });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => checkMenuOverflow()).observe(headerEl);
  checkMenuOverflow();

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
    if (ev.key === 'Escape' && help.isOpen()) {
      ev.preventDefault();
      help.hide();
      return;
    }
    // '?' (Shift+/ on most layouts) toggles help — only when not in a field.
    if (ev.key === '?' && !inField && !ev.ctrlKey && !ev.metaKey) {
      ev.preventDefault();
      help.toggle();
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

    // Plain ArrowUp/ArrowDown steps the sidebar instrument state.selection
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
    const hasWork = state.patchFileName !== '' || model.patch.instruments.some(
      (ins) => ins.slots.length > 0,
    );
    if (hasWork) {
      ev.preventDefault();
      ev.returnValue = '';
    }
  };
  w.__funklangBeforeUnload = beforeUnloadHandler;
  window.addEventListener('beforeunload', beforeUnloadHandler);


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
    state.patchFileName = name;
    state.patchFileHandle = handle;
    nameEl.textContent = state.patchFileName;
    state.activeIdx = firstPopulatedInstrument(model.patch);
    state.selection = { instrIdx: state.activeIdx, slotIdx: null };
    state.outputTarget = { instrIdx: state.activeIdx, slotIdx: null };
    warnPatchOver16Slots(model);
    applyEdit({ kind: 'reset' });
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
    const label = state.patchFileName || 'this patch';
    if (!confirm(`Close ${label}? Unsaved changes will be lost. (Autosaves stay available under REVERT AUTOSAVE.)`)) return;
    model.patch = emptyPatch();
    state.patchFileName = '';
    state.patchFileHandle = undefined;
    nameEl.textContent = '(no patch)';
    state.activeIdx = 0;
    state.selection = { instrIdx: 0, slotIdx: null };
    state.outputTarget = { instrIdx: 0, slotIdx: null };
    applyEdit({ kind: 'reset' });
  });
  // Single audio toggle replaces PLAY/STOP/RETRIG. Green = on (changes
  // auto-replay, spacebar replays). Red = muted (re-renders still happen so
  // waveforms stay live, but nothing is sent to the speakers).
  const audioToggle = root.querySelector('#btn-audio-toggle') as HTMLButtonElement;
  const updateAudioToggle = (): void => {
    audioToggle.classList.toggle('on',  state.audioEnabled);
    audioToggle.classList.toggle('off', !state.audioEnabled);
    audioToggle.title = state.audioEnabled
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
    state.audioEnabled = !state.audioEnabled;
    if (!state.audioEnabled) player.stop();
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
      if (state.patchFileHandle) {
        try {
          await saveToHandle(state.patchFileHandle, bytes);
          return;
        } catch { /* fall through to picker fallback */ }
      }
      const name = state.patchFileName || 'patch.akp';
      const newHandle = await saveFileBytes(bytes, name, '.akp');
      if (newHandle) {
        state.patchFileHandle = newHandle;
        try {
          const f = await newHandle.getFile();
          state.patchFileName = f.name;
          nameEl.textContent = state.patchFileName;
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
      const name = state.patchFileName || 'patch.akp';
      const newHandle = await saveFileBytes(bytes, name, '.akp');
      if (newHandle) {
        state.patchFileHandle = newHandle;
        try {
          const f = await newHandle.getFile();
          state.patchFileName = f.name;
          nameEl.textContent = state.patchFileName;
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
    state.previewNote = noteSelect.value;
    saveStoredNote(state.previewNote);
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
  if (bootAutosave && isPatchBlank(model.patch)) {
    try {
      model.patch = restoreAutosave(bootAutosave);
      normalizePatch(model.patch);
      state.activeIdx = firstPopulatedInstrument(model.patch);
      state.selection = { instrIdx: state.activeIdx, slotIdx: null };
      state.outputTarget = { instrIdx: state.activeIdx, slotIdx: null };
      applyEdit({ kind: 'reset' });
    } catch { /* corrupt entry — ignore, user can browse REVERT panel */ }
  }
  // Kick off the recurring loop. (Stop function discarded — the app's
  // lifetime is the page lifetime; no clean shutdown needed.)
  startAutosaveLoop(() => model.patch);

  // ── REVERT AUTOSAVE side panel ──────────────────────────────────
  // The panel owns its own browsing UI; we hand it the "apply a restored
  // patch" action since that mutates editor state (state.activeIdx / state.selection /
  // output / render), which the panel must not know about.
  wireRevertPanel(root, {
    getPatch: () => model.patch,
    onRestore: (patch) => {
      model.patch = patch;
      normalizePatch(model.patch);
      // Keep the user on the same instrument while browsing snapshots —
      // unless it's empty in the restored patch, in which case fall back
      // to the first populated one so they actually see something.
      if (instrumentIsEmpty(model.patch, state.activeIdx)) {
        state.activeIdx = firstPopulatedInstrument(model.patch);
      }
      state.selection = { instrIdx: state.activeIdx, slotIdx: null };
      state.outputTarget = { instrIdx: state.activeIdx, slotIdx: null };
      applyEdit({ kind: 'reset' }, { audition: true });   // user wants to HEAR the loaded state
    },
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
    applyEdit({ kind: 'select' });
  });

  applyEdit({ kind: 'select' });   // initial paint of the blank editor

  // Expose the model on window so E2E tests can drive moves and edits
  // without simulating DOM drag-and-drop (brittle in headless browsers).
  // moveInstrument is wrapped so the host-side state.activeIdx / state.selection /
  // state.outputTarget follow the reorder — same path the real drag uses.
  const shim = Object.create(model) as PatchModel & { moveInstrument: (from: number, to: number) => void };
  shim.moveInstrument = moveInstrumentWithRemap;
  (window as unknown as { __funklangModel?: PatchModel }).__funklangModel = shim;
}
