import { PatchModel } from '../patch/model';
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

interface AuditionState {
  instrIdx: number;
  slotIdx: number | null; // null = play final output
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
  const player = new Player();
  let activeIdx = 0;
  let patchFileName = '';
  // File System Access handle if open via FSA; undefined otherwise.
  let patchFileHandle: FileSystemFileHandle | undefined = undefined;
  let audition: AuditionState = { instrIdx: 0, slotIdx: null };
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
          <button id="btn-play">▶&nbsp;PLAY</button>
          <button id="btn-stop">■&nbsp;STOP</button>
          <button id="btn-retrig">↻&nbsp;RETRIG</button>
          <label class="note-select-wrap" title="Audition note (playback rate)">
            <span class="note-select-label">NOTE</span>
            <select id="note-select">${noteOptions}</select>
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
          <span class="k">audition →</span>
          <span class="audition" id="audition-label">—</span>
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
  const auditionLabel = root.querySelector('#audition-label') as HTMLElement;

  // Per-render caches of the slot-grid container and wave viewer so we can
  // call updateSlotWaves / viewer.setSample without rebuilding the DOM.
  let gridHostEl: HTMLElement | null = null;
  let waveViewer: WaveViewer | null = null;
  let lastRender: { sample: Int16Array; slotTaps: Int16Array[] } | null = null;
  let cycleError: CyclicCloneError | null = null;

  const rebuildCloneGraph = (): void => {
    cloneGraph = buildCloneGraph(model.patch);
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
      auditionSlot: audition.instrIdx === activeIdx ? audition.slotIdx : null,
      onAudition: (slotIdx) => {
        audition = { instrIdx: activeIdx, slotIdx };
        // Re-paint audition class without rebuilding everything.
        renderMain();
        repaint();
        scheduleRender(true);
        updateAuditionLabel();
      },
    });
    runRender();
    updateAuditionLabel();
  };

  const repaint = (): void => {
    renderSidebar(listEl, model.patch, activeIdx, (i) => {
      activeIdx = i;
      audition = { instrIdx: i, slotIdx: null };
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
      const target = (audition.instrIdx === activeIdx && audition.slotIdx != null && lastRender)
        ? (lastRender.slotTaps[audition.slotIdx] ?? null)
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
    const sample = (audition.instrIdx === activeIdx && audition.slotIdx != null)
      ? (lastRender.slotTaps[audition.slotIdx] ?? lastRender.sample)
      : lastRender.sample;
    if (!sample || sample.length === 0) return;
    player.play(sample, noteRateHz(previewNote));
  };

  const updateAuditionLabel = (): void => {
    const num = String(audition.instrIdx + 1).padStart(2, '0');
    if (audition.slotIdx == null) {
      auditionLabel.textContent = `instr ${num} / final`;
    } else {
      const ins = model.patch.instruments[audition.instrIdx];
      const slot = ins?.slots[audition.slotIdx];
      const vlabel = slot && slot.outVar > 0 ? ` · v${slot.outVar}` : '';
      auditionLabel.textContent = `instr ${num} / slot ${String(audition.slotIdx + 1).padStart(2, '0')}${vlabel}`;
    }
  };

  model.events.on((e) => {
    // Structure changes can rewire the clone graph; rebuild before we decide
    // which instruments are affected.
    if (e.kind === 'structure') {
      rebuildCloneGraph();
    }
    // The active instrument re-renders whenever IT changes OR when any
    // instrument it (transitively) clones changes. Audition target also
    // matters because the user may be auditioning a different instrument
    // than activeIdx — although currently the UI keeps them aligned.
    const affectsActive =
      e.instrIdx === activeIdx ||
      audition.instrIdx === e.instrIdx ||
      allDependentsOf(cloneGraph, e.instrIdx).has(activeIdx);
    if (!affectsActive) return;
    if (e.kind === 'structure') {
      // Layout change → full DOM rebuild + sidebar refresh.
      renderMain();
      repaint();
    }
    scheduleRender(true);
  });

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
    audition = { instrIdx: activeIdx, slotIdx: null };
    rebuildCloneGraph();
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
    audition = { instrIdx: 0, slotIdx: null };
    rebuildCloneGraph();
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
}
