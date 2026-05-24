import { PatchModel } from '../patch/model';
import { emptyPatch } from '../patch/types';
import { parseAkp, serializeAkp } from '../fileio/akp';
import { parseAki, serializeAki } from '../fileio/aki';
import { renderInstrument, CyclicCloneError } from '../dsp/engine';
import { Player } from '../audio/player';
import { renderSidebar } from './sidebar';
import { renderInstrHeader } from './instr-header';
import { renderSlotGrid, updateSlotWaves } from './slot-grid';
import { makeWaveViewer } from './wave-viewer';
import type { WaveViewer } from './wave-viewer';
import { openFileBytes, saveFileBytes } from './file-dialog';

const SAMPLE_RATE = 22050;
const DEBOUNCE_MS = 80;

interface AuditionState {
  instrIdx: number;
  slotIdx: number | null; // null = play final output
}

export function bootApp(root: HTMLElement): void {
  const model = new PatchModel(emptyPatch());
  const player = new Player();
  let activeIdx = 0;
  let patchFileName = '';
  // File System Access handle if open via FSA; undefined otherwise.
  let patchFileHandle: FileSystemFileHandle | undefined = undefined;
  let audition: AuditionState = { instrIdx: 0, slotIdx: null };

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
    }
    if (waveViewer) {
      const target = (audition.instrIdx === activeIdx && audition.slotIdx != null && lastRender)
        ? (lastRender.slotTaps[audition.slotIdx] ?? null)
        : (lastRender ? lastRender.sample : null);
      waveViewer.setSample(target, {
        loopOffset: ins.loopOffset,
        loopLength: ins.loopLength,
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
    player.play(sample, SAMPLE_RATE);
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
    if (e.instrIdx !== activeIdx && audition.instrIdx !== e.instrIdx) {
      // Still re-render if a dependency might affect a clone-chain in active.
      // For simplicity, schedule a re-render whenever the audition target's
      // instrument is touched.
      return;
    }
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
    activeIdx = model.patch.instruments.findIndex(ins => ins.slots.length > 0);
    if (activeIdx < 0) activeIdx = 0;
    audition = { instrIdx: activeIdx, slotIdx: null };
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

  repaint();
}
