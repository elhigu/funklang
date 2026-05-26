import { PatchModel } from '../patch/model';
import { HistoryManager } from '../patch/history';
import { emptyPatch, N_SLOTS_EDITABLE } from '../patch/types';
import { parseAkp, serializeAkp } from '../fileio/akp';
import { parseAki, serializeAki } from '../fileio/aki';
import { renderInstrument, CyclicCloneError } from '../dsp/engine';
import type { RenderResult } from '../dsp/types';
import { Player } from '../audio/player';
import { buildCloneGraph, allDependentsOf } from '../patch/clone-graph';
import { clampLoopOffset, loopLengthFor } from '../patch/loop-rules';
import type { CloneGraph } from '../patch/clone-graph';
import { renderSidebar } from './sidebar';
import { renderInstrHeader } from './instr-header';
import { renderSlotGrid, updateSlotWaves, findExpandedCloneGrids } from './slot-grid';
import { bytesToInt16, bytesToInt16WithLoop } from './waveform';
import { makeWaveViewer } from './wave-viewer';
import type { WaveViewer } from './wave-viewer';
import { openFileBytes, openFileWithHandle, saveFileBytes, saveToHandle } from './file-dialog';
import { attachWheelStep } from './wheel';
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
          <button id="btn-new">NEW</button>
          <button id="btn-open">OPEN&nbsp;PATCH</button>
          <button id="btn-save">SAVE</button>
          <button id="btn-save-as">SAVE&nbsp;AS</button>
          <button id="btn-import">IMPORT&nbsp;.AKI</button>
          <button id="btn-export">EXPORT&nbsp;.AKI</button>
          <button id="btn-undo" title="Undo (Ctrl+Z)" disabled>↶&nbsp;UNDO</button>
          <button id="btn-redo" title="Redo (Ctrl+Shift+Z)" disabled>↷&nbsp;REDO</button>
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
                <tr><td>Click <kbd>+</kbd> at a slot's bottom-left corner</td><td>Insert a new slot right after this one</td></tr>
                <tr><td>Click <kbd>+</kbd> at the FIRST row's top-left corner</td><td>Insert a new slot at the very beginning</td></tr>
                <tr><td>Empty instrument</td><td>Shows a single placeholder row with a <kbd>+</kbd> button — click it to add the first slot</td></tr>
                <tr><td>Grey-out <kbd>+</kbd> buttons</td><td>Instrument is at the editor cap (16 slots) — delete one to insert another</td></tr>
                <tr><td>Click ▶ on a clone slot</td><td>Expand the source instrument inline (collapsed by default)</td></tr>
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
                <tr><td>Sample length</td><td>Always even (odd values round down on every keystroke)</td></tr>
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
      onLoopChange: (rawOffset, _rawLength) => {
        // loopLength is no longer user-modifiable — it's always derived
        // as `sampleLength − loopOffset`. The wave-viewer's drag emits
        // a raw offset; we snap it to the nearest valid even value per
        // loop-rules, then update BOTH instrument fields so the
        // serialized .akp stays consistent.
        const ins = model.patch.instruments[activeIdx];
        if (!ins) return;
        const snapped = clampLoopOffset(ins.sampleLength, rawOffset);
        const newLen = loopLengthFor(ins.sampleLength, snapped);
        const changed = snapped !== ins.loopOffset || newLen !== ins.loopLength;
        if (snapped !== ins.loopOffset) {
          model.setInstrumentField(activeIdx, 'loopOffset', snapped);
        }
        if (newLen !== ins.loopLength) {
          model.setInstrumentField(activeIdx, 'loopLength', newLen);
        }
        // Force a slot-grid rebuild so the loop_gen slot's `offset` knob
        // also picks up the new value (otherwise it sticks at whatever
        // ins.loopOffset was when its row was last rendered).
        if (changed) model.events.emit({ instrIdx: activeIdx, kind: 'structure' });
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

  const repaint = (): void => {
    renderSidebar(listEl, model.patch, activeIdx, (i) => {
      // Sidebar click also auto-plays (subject to the audio toggle), same
      // as wheel/arrow nav.
      selectInstrument(i, { play: true });
    });
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
  const FINAL_LOOP_REPEATS = 2;
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
    } else if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
      // ArrowUp/Down at the global level steps the instrument selection.
      // (Knob bars have their own keydown handler that stops propagation
      // via target check above when focused.)
      ev.preventDefault();
      stepInstrument(ev.key === 'ArrowDown' ? 1 : -1, { play: true });
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
  // Same re-entrancy guard as OPEN PATCH — protects against double-clicks
  // in the OS file dialog spilling a second click onto the IMPORT button.
  let importing = false;
  (root.querySelector('#btn-import') as HTMLButtonElement).addEventListener('click', async () => {
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
  });
  let exporting = false;
  (root.querySelector('#btn-export') as HTMLButtonElement).addEventListener('click', async () => {
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
  });

  const noteSelect = root.querySelector('#note-select') as HTMLSelectElement;
  noteSelect.addEventListener('change', () => {
    previewNote = noteSelect.value;
    saveStoredNote(previewNote);
    // No re-render needed — the sample data is unchanged, only the
    // playback rate moves. Replay so the user hears the new note.
    playAudition();
  });
  attachWheelStep(noteSelect);

  repaint();
  updateUndoRedoButtons();
}
