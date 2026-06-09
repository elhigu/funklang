// src/ui/code-export-modal.ts
//
// "EXPORT CODE" panel: shows the generated m68k assembly (byte-exact Aklang2Asm
// port) and the C generator code for the current patch, the EXACT assembled .bin
// size (vasm-WASM, computed live), and download buttons for .asm / .c / .bin —
// all client-side. Presentation only; pattern follows size-breakdown-modal.ts.
import type { Patch } from '../patch/types';
import { emitAkGenerate } from '../asm/akgen';
import { emitInst } from '../codegen/emit-inst';
import { assembleBin } from '../asm/assemble-bin';
import { fmtBytes } from './format';

export interface CodeExportModal {
  open(patch: Patch): void;
  close(): void;
  isOpen(): boolean;
}

function download(name: string, data: string | Uint8Array, mime: string): void {
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function mountCodeExportModal(root: HTMLElement): CodeExportModal {
  const overlay = document.createElement('div');
  overlay.id = 'code-export-overlay';
  overlay.className = 'size-breakdown-overlay hidden';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  root.appendChild(overlay);

  const close = (): void => overlay.classList.add('hidden');
  const isOpen = (): boolean => !overlay.classList.contains('hidden');
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });

  const open = (patch: Patch): void => {
    const asm = emitAkGenerate(patch);
    const c = emitInst(patch);
    overlay.innerHTML = `
      <div class="size-breakdown-inner code-export-inner" role="document">
        <header><h2>EXPORT CODE</h2><button id="code-export-close" aria-label="Close">✕</button></header>
        <p class="size-breakdown-note">Generated entirely in the browser. The <strong>.bin</strong> is the byte-exact Amiga generation code (assembled by vasm); its size is exact. The C is the same generators for reuse in your demo engine.</p>
        <section>
          <div class="code-export-row">
            <span>exact .bin size: <strong id="code-export-size">computing…</strong></span>
            <span class="code-export-actions">
              <button id="dl-asm">⬇ .asm</button>
              <button id="dl-c">⬇ .c</button>
              <button id="dl-bin" disabled>⬇ .bin</button>
            </span>
          </div>
        </section>
        <section>
          <h3>m68k assembly (AK_Generate)</h3>
          <pre class="code-export-pre" id="code-export-asm"></pre>
        </section>
      </div>`;
    (overlay.querySelector('#code-export-asm') as HTMLElement).textContent = asm;
    (overlay.querySelector('#code-export-close') as HTMLButtonElement).addEventListener('click', close);
    (overlay.querySelector('#dl-asm') as HTMLButtonElement).addEventListener('click', () => download('exemusic.asm', asm, 'text/plain'));
    (overlay.querySelector('#dl-c') as HTMLButtonElement).addEventListener('click', () => download('Inst.h', c, 'text/plain'));
    overlay.classList.remove('hidden');

    // Assemble async (loads vasm-WASM); fill in exact size + enable .bin download.
    const sizeEl = overlay.querySelector('#code-export-size') as HTMLElement;
    const binBtn = overlay.querySelector('#dl-bin') as HTMLButtonElement;
    void assembleBin(patch, { format: 'bin' }).then((r) => {
      if (!isOpen()) return;
      if (r.ok) {
        sizeEl.textContent = `${fmtBytes(r.size!)} (${r.size} bytes)`;
        binBtn.disabled = false;
        binBtn.addEventListener('click', () => download('exemusic.bin', r.bytes!, 'application/octet-stream'));
      } else {
        sizeEl.textContent = `assembly failed (${r.error ?? '?'})`;
      }
    });
  };

  return { open, close, isOpen };
}
