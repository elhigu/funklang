import { PatchModel } from '../patch/model';
import { emptyPatch } from '../patch/types';
import { parseAkp } from '../fileio/akp';
import { renderInstrument } from '../dsp/engine';
import { Player } from '../audio/player';
import { renderSidebar } from './sidebar';

const SAMPLE_RATE = 22050;

export function bootApp(root: HTMLElement): void {
  const model = new PatchModel(emptyPatch());
  const player = new Player();
  let activeIdx = 0;
  let patchFileName = '';

  root.innerHTML = `
    <div class="app" style="display:grid;grid-template-rows:44px 1fr 30px;grid-template-columns:240px 1fr;grid-template-areas:'header header' 'sidebar main' 'footer footer';height:100vh">
      <header style="grid-area:header;display:flex;align-items:center;gap:8px;padding:0 14px;background:var(--bg-1);border-bottom:1px solid var(--grid)">
        <strong style="color:var(--amber);font-family:'Silkscreen',monospace">KLANG.WEB</strong>
        <button id="btn-open" class="menu">OPEN PATCH</button>
        <button id="btn-play" class="menu">▶ PLAY</button>
        <button id="btn-stop" class="menu">■ STOP</button>
        <span id="file-name" style="margin-left:auto;color:var(--fg-1);font-size:11px">(no patch)</span>
      </header>
      <aside class="sidebar" style="grid-area:sidebar"><ul class="instr-list" id="instr-list"></ul></aside>
      <main style="grid-area:main;padding:18px;color:var(--fg-1)" id="main-area">
        Open a .akp patch and pick an instrument from the left.
      </main>
      <footer style="grid-area:footer;display:flex;align-items:center;padding:0 14px;background:var(--bg-1);border-top:1px solid var(--grid);color:var(--fg-1);font-size:11px">
        funklang
      </footer>
      <input id="hidden-file-input" type="file" accept=".akp" style="display:none" />
    </div>
  `;

  const listEl = root.querySelector('#instr-list') as HTMLElement;
  const nameEl = root.querySelector('#file-name') as HTMLElement;
  const mainEl = root.querySelector('#main-area') as HTMLElement;
  const hidden = root.querySelector('#hidden-file-input') as HTMLInputElement;

  const repaint = (): void => {
    renderSidebar(listEl, model.patch, activeIdx, (i) => {
      activeIdx = i;
      const ins = model.patch.instruments[i]!;
      mainEl.innerHTML =
        `<h2 style="color:var(--amber);font-family:'Silkscreen',monospace">${ins.name || '(unnamed)'}</h2>` +
        `<div style="font-size:11px;color:var(--fg-1)">${ins.slots.length} slots · sampleLength ${ins.sampleLength}</div>`;
      repaint();
    });
  };

  hidden.addEventListener('change', async () => {
    const f = hidden.files?.[0];
    if (!f) return;
    model.patch = parseAkp(new Uint8Array(await f.arrayBuffer()));
    patchFileName = f.name;
    nameEl.textContent = patchFileName;
    activeIdx = model.patch.instruments.findIndex(ins => ins.slots.length > 0);
    if (activeIdx < 0) activeIdx = 0;
    repaint();
  });

  (root.querySelector('#btn-open') as HTMLButtonElement).addEventListener('click', () => hidden.click());
  (root.querySelector('#btn-play') as HTMLButtonElement).addEventListener('click', () => {
    const ins = model.patch.instruments[activeIdx];
    if (!ins?.slots.length) return;
    const { sample } = renderInstrument(model.patch, activeIdx);
    player.play(sample, SAMPLE_RATE);
  });
  (root.querySelector('#btn-stop') as HTMLButtonElement).addEventListener('click', () => player.stop());

  repaint();
}
