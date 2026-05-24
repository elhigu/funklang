import { PatchModel } from '../patch/model';
import { HistoryManager } from '../patch/history';
import { emptyPatch, N_SLOTS_EDITABLE } from '../patch/types';
import { parseAkp, serializeAkp } from '../fileio/akp';
import { parseAki, serializeAki } from '../fileio/aki';
import { renderInstrument, CyclicCloneError } from '../dsp/engine';
import { Player } from '../audio/player';
import { buildCloneGraph, allDependentsOf } from '../patch/clone-graph';
import type { CloneGraph } from '../patch/clone-graph';
import { renderSidebar } from './sidebar';
import { renderInstrHeader } from './instr-header';
import { renderSlotGrid, updateSlotWaves, findExpandedCloneGrids } from './slot-grid';
import { makeWaveViewer } from './wave-viewer';
import type { WaveViewer } from './wave-viewer';
import { openFileBytes, saveFileBytes } from './file-dialog';
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
        <div class="brand"><div class="dot"></div><span>KLANG.WEB</span></div>
        <div class="menu">
          <button id="btn-new">NEW</button>
          <button id="btn-open">OPEN&nbsp;PATCH</button>
          <button id="btn-save">SAVE</button>
          <button id="btn-save-as">SAVE&nbsp;AS</button>
          <button id="btn-import">IMPORT&nbsp;.AKI</button>
          <button id="btn-export">EXPORT&nbsp;.AKI</button>
          <button id="btn-undo" title="Undo (Ctrl+Z)" disabled>↶&nbsp;UNDO</button>
          <button id="btn-redo" title="Redo (Ctrl+Shift+Z)" disabled>↷&nbsp;REDO</button>
          <button id="btn-play">▶&nbsp;PLAY</button>
          <button id="btn-stop">■&nbsp;STOP</button>
          <button id="btn-retrig">↻&nbsp;RETRIG</button>
          <label class="note-select-wrap" title="Audition note (playback rate)">
            <span class="note-select-label">NOTE</span>
            <select id="note-select">${noteOptions}</select>
          </label>
          <label class="output-select-wrap" title="Which signal is sent to the audio output">
            <span class="output-select-label">OUTPUT</span>
            <select id="output-select"></select>
          </label>
        </div>
        <div class="file-info">
          <span class="file-name" id="file-name">(no patch)</span>
        </div>
      </header>
      <aside class="sidebar">
        <div class="sidebar-title">PATCH · INSTRUMENTS</div>
        <ul class="instr-list" id="instr-list"></ul>
      </aside>
      <main id="main-area">
        <div style="padding:18px;color:var(--fg-1)">Open a .akp patch and pick an instrument from the left.</div>
      </main>
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
      <input id="hidden-file-input" type="file" accept=".akp" style="display:none" />
    </div>
  `;

  const listEl = root.querySelector('#instr-list') as HTMLElement;
  const nameEl = root.querySelector('#file-name') as HTMLElement;
  const mainEl = root.querySelector('#main-area') as HTMLElement;
  const hidden = root.querySelector('#hidden-file-input') as HTMLInputElement;
  const selectionLabel = root.querySelector('#selection-label') as HTMLElement;
  const outputLabel = root.querySelector('#output-label') as HTMLElement;
  const outputSelect = root.querySelector('#output-select') as HTMLSelectElement;
  const undoBtn = root.querySelector('#btn-undo') as HTMLButtonElement;
  const redoBtn = root.querySelector('#btn-redo') as HTMLButtonElement;

  // Per-render caches of the slot-grid container and wave viewer so we can
  // call updateSlotWaves / viewer.setSample without rebuilding the DOM.
  let gridHostEl: HTMLElement | null = null;
  let waveViewer: WaveViewer | null = null;
  let lastRender: { sample: Int16Array; slotTaps: Int16Array[] } | null = null;
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

  const renderMain = (): void => {
    mainEl.innerHTML = '';
    const ins = model.patch.instruments[activeIdx];
    if (!ins) {
      gridHostEl = null;
      waveViewer = null;
      return;
    }
    const headerHost = document.createElement('div');
    mainEl.appendChild(headerHost);
    renderInstrHeader(headerHost, model, activeIdx);

    const viewerHost = document.createElement('div');
    viewerHost.className = 'wave-viewer';
    mainEl.appendChild(viewerHost);
    waveViewer = makeWaveViewer(viewerHost, {
      onLoopChange: (loopOffset, loopLength) => {
        model.setInstrumentField(activeIdx, 'loopOffset', loopOffset);
        model.setInstrumentField(activeIdx, 'loopLength', loopLength);
      },
    });

    const gridHost = document.createElement('div');
    gridHost.className = 'slot-grid-host';
    mainEl.appendChild(gridHost);
    gridHostEl = gridHost;
    renderSlotGrid(gridHost, model, activeIdx, {
      selectedSlot: selection.instrIdx === activeIdx ? selection.slotIdx : null,
      outputSlot: outputTarget.instrIdx === activeIdx ? outputTarget.slotIdx : null,
      onSelect: (slotIdx) => {
        selection = { instrIdx: activeIdx, slotIdx };
        // Refresh only the row highlights + footer label — don't replay audio
        // and don't change the output target.
        refreshSelectionHighlight();
        updateLabels();
      },
      onSetOutput: (slotIdx) => {
        outputTarget = { instrIdx: activeIdx, slotIdx };
        refreshOutputHighlight();
        rebuildOutputSelect();
        updateLabels();
        runRender();
        playAudition();
      },
    });
    runRender();
    rebuildOutputSelect();
    updateLabels();
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
  const rebuildOutputSelect = (): void => {
    const ins = model.patch.instruments[activeIdx];
    if (!ins) {
      outputSelect.innerHTML = '<option value="">—</option>';
      return;
    }
    const isFinal = outputTarget.instrIdx === activeIdx && outputTarget.slotIdx == null;
    let html = `<option value="final"${isFinal ? ' selected' : ''}>final (v1)</option>`;
    // Build option entries for each filled slot at its model index.
    let visibleRow = 0;
    for (let i = 0; i < ins.slots.length; i++) {
      const s = ins.slots[i]!;
      if (s.fn === 0) continue;
      visibleRow++;
      const num = String(visibleRow).padStart(2, '0');
      const vlabel = s.outVar > 0 ? ` · v${s.outVar}` : '';
      const sel = outputTarget.instrIdx === activeIdx && outputTarget.slotIdx === i ? ' selected' : '';
      html += `<option value="${i}"${sel}>slot ${num}${vlabel}</option>`;
    }
    outputSelect.innerHTML = html;
  };

  const repaint = (): void => {
    renderSidebar(listEl, model.patch, activeIdx, (i) => {
      activeIdx = i;
      selection = { instrIdx: i, slotIdx: null };
      outputTarget = { instrIdx: i, slotIdx: null };
      renderMain();
      repaint();
    });
  };

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
      updateSlotWaves(gridHostEl, lastRender.slotTaps);
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
            taps = renderInstrument(model.patch, srcIdx).slotTaps;
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
      const target = (outputTarget.instrIdx === activeIdx && outputTarget.slotIdx != null && lastRender)
        ? (lastRender.slotTaps[outputTarget.slotIdx] ?? null)
        : (lastRender ? lastRender.sample : null);
      // Loop overlay only when the patch uses op22 (Loop Generator) somewhere
      // in the active instrument. The user wants the band hidden otherwise.
      const showLoop = instrHasOp(model, activeIdx, 22);
      waveViewer.setSample(target, {
        loopOffset: ins.loopOffset,
        loopLength: ins.loopLength,
        showLoop,
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

  const playAudition = (): void => {
    if (!lastRender) return;
    // Playback ALWAYS uses outputTarget (never selection).
    const sample = (outputTarget.instrIdx === activeIdx && outputTarget.slotIdx != null)
      ? (lastRender.slotTaps[outputTarget.slotIdx] ?? lastRender.sample)
      : lastRender.sample;
    if (!sample || sample.length === 0) return;
    player.play(sample, noteRateHz(previewNote));
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

  outputSelect.addEventListener('change', () => {
    const v = outputSelect.value;
    if (v === 'final' || v === '') {
      outputTarget = { instrIdx: activeIdx, slotIdx: null };
    } else {
      const idx = parseInt(v, 10);
      if (Number.isFinite(idx)) outputTarget = { instrIdx: activeIdx, slotIdx: idx };
    }
    refreshOutputHighlight();
    updateLabels();
    runRender();
    playAudition();
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
    // which instruments are affected.
    if (e.kind === 'structure') {
      rebuildCloneGraph();
      validateOutputTarget();
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
      // Layout change → full DOM rebuild + sidebar refresh.
      renderMain();
      repaint();
    }
    scheduleRender(true);
  });

  history.on(() => {
    updateUndoRedoButtons();
  });

  // Keyboard shortcuts: Ctrl+Z / Ctrl+Shift+Z (and Cmd on Mac).
  document.addEventListener('keydown', (ev) => {
    // Don't hijack typing in text inputs / textareas.
    const target = ev.target as HTMLElement | null;
    if (target) {
      const tag = target.tagName;
      const editable = (target as HTMLElement).isContentEditable;
      if (editable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        // Allow undo INSIDE text fields too — native browser undo works there
        // and we don't want to fight it.
        return;
      }
    }
    const mod = ev.ctrlKey || ev.metaKey;
    if (!mod) return;
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
  });

  undoBtn.addEventListener('click', () => history.undo());
  redoBtn.addEventListener('click', () => history.redo());

  hidden.addEventListener('change', async () => {
    const f = hidden.files?.[0];
    if (!f) return;
    model.patch = parseAkp(new Uint8Array(await f.arrayBuffer()));
    patchFileName = f.name;
    patchFileHandle = undefined;
    nameEl.textContent = patchFileName;
    activeIdx = model.patch.instruments.findIndex(
      (ins) => ins.slots.some((s) => s.fn !== 0),
    );
    if (activeIdx < 0) activeIdx = 0;
    selection = { instrIdx: activeIdx, slotIdx: null };
    outputTarget = { instrIdx: activeIdx, slotIdx: null };
    rebuildCloneGraph();
    // Re-emit reset so HistoryManager rebaselines on the new patch.
    model.events.emit({ instrIdx: -1, kind: 'reset' });
    warnPatchOver16Slots(model);
    renderMain();
    repaint();
  });

  (root.querySelector('#btn-open') as HTMLButtonElement).addEventListener('click', () => hidden.click());
  (root.querySelector('#btn-new') as HTMLButtonElement).addEventListener('click', () => {
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
  (root.querySelector('#btn-play') as HTMLButtonElement).addEventListener('click', () => {
    runRender();
    playAudition();
  });
  (root.querySelector('#btn-stop') as HTMLButtonElement).addEventListener('click', () => player.stop());
  (root.querySelector('#btn-retrig') as HTMLButtonElement).addEventListener('click', () => {
    runRender();
    playAudition();
  });

  (root.querySelector('#btn-save-as') as HTMLButtonElement).addEventListener('click', async () => {
    const bytes = serializeAkp(model.patch);
    const name = patchFileName || 'patch.akp';
    await saveFileBytes(bytes, name, '.akp');
  });
  (root.querySelector('#btn-save') as HTMLButtonElement).addEventListener('click', async () => {
    const bytes = serializeAkp(model.patch);
    if (patchFileHandle) {
      try {
        const buf = new ArrayBuffer(bytes.byteLength);
        new Uint8Array(buf).set(bytes);
        const w = await patchFileHandle.createWritable();
        await w.write(new Uint8Array(buf));
        await w.close();
        return;
      } catch { /* fall through */ }
    }
    const name = patchFileName || 'patch.akp';
    await saveFileBytes(bytes, name, '.akp');
  });
  (root.querySelector('#btn-import') as HTMLButtonElement).addEventListener('click', async () => {
    const f = await openFileBytes('.aki');
    if (!f) return;
    const ins = parseAki(f.bytes);
    // Use filename (no extension) as name, like the original GUI.
    const stem = f.name.replace(/\.aki$/i, '');
    if (!ins.name) ins.name = stem;
    model.patch.instruments[activeIdx] = ins;
    rebuildCloneGraph();
    model.events.emit({ instrIdx: activeIdx, kind: 'structure' });
    renderMain();
    repaint();
  });
  (root.querySelector('#btn-export') as HTMLButtonElement).addEventListener('click', async () => {
    const ins = model.patch.instruments[activeIdx];
    if (!ins) return;
    const bytes = serializeAki(ins);
    const stem = (ins.name || `instr_${activeIdx + 1}`).replace(/[^\w.-]+/g, '_');
    await saveFileBytes(bytes, `${stem}.aki`, '.aki');
  });

  const noteSelect = root.querySelector('#note-select') as HTMLSelectElement;
  noteSelect.addEventListener('change', () => {
    previewNote = noteSelect.value;
    saveStoredNote(previewNote);
    // No re-render needed — the sample data is unchanged, only the
    // playback rate moves. Replay so the user hears the new note.
    playAudition();
  });

  repaint();
  updateUndoRedoButtons();
}
