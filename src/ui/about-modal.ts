// src/ui/about-modal.ts
//
// The ABOUT / CREDITS modal (opened from the top menu). Presentation only;
// follows the size-breakdown / code-export modal pattern (overlay appended to
// root, `.hidden` toggle, ✕ / click-outside / Esc to close).
//
// The curated About + credits block below is hand-maintained, end-user-facing
// content — keep it current when credits/attribution/scope change (see AGENTS.md).
// The version comes from package.json at build time and the changelog is rendered
// live from CHANGELOG.md, so those two stay correct on their own.
import changelogRaw from '../../CHANGELOG.md?raw';
import { renderChangelog } from './changelog-md';

// Build-time injected (vite `define`); "dev" when running outside a Vite build.
const VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';

export interface AboutModal {
  open(): void;
  close(): void;
  isOpen(): boolean;
}

function bodyHtml(): string {
  return `
    <div class="about-inner" role="document">
      <header>
        <h2>ABOUT</h2>
        <button id="about-close" aria-label="Close">✕</button>
      </header>

      <div class="about-head">
        <span class="about-title">FUNKLANG.WEB</span>
        <span class="about-version">v${VERSION}</span>
      </div>

      <section class="about-prose">
        <p>A browser reimplementation of <strong>AmigaKlang</strong> — design Commodore
        Amiga synth instruments and export the real, byte-identical Amiga code. The
        audio engine matches the original <em>sample-for-sample</em> and the exported
        <code>.bin</code> matches the original generator <em>byte-for-byte</em>;
        everything (preview, m68k assembly, the final <code>.bin</code>) runs entirely
        client-side — no server, no toolchain.</p>

        <h3>Exports</h3>
        <p><strong>CODE</strong> generates the m68k <code>.asm</code>, the C generators, and
        the exact <code>.bin</code> — the <code>.bin</code> is here mainly so you can read the
        true ship size. For the original tool's other output routes (the Shrinkler-packed
        Amiga <code>.exe</code>, the Atari <code>.prg</code>, …), load your <code>.akp</code>
        in the original <strong>AmigaKlang</strong> and export from there.</p>

        <h3>Credits</h3>
        <p>funklang stands entirely on the AmigaKlang ecosystem and its authors — all
        synthesis design, the <code>.bin</code> format, and the code-generation approach
        are theirs. Full third-party terms are in <code>THIRD-PARTY-NOTICES.md</code>.</p>
        <ul class="about-credits">
          <li><strong>AmigaKlang &amp; its GUI</strong> — Jochen <strong>“Virgill” Feldkötter</strong> (Alcatraz / Haujobb / Maniacs of Noise): the synth, the editor, the rendering core.</li>
          <li><strong>4Klang</strong> — <strong>Gopher</strong> / Alcatraz: the modular-synth lineage AmigaKlang follows.</li>
          <li><strong>Aklang2Asm</strong> — <strong>Dan / Lemon</strong>: the patch→m68k-asm generator reproduced byte-for-byte.</li>
          <li><strong>Shrinkler</strong> — <strong>Blueberry</strong>: the executable cruncher (the “shrinkled” size).</li>
          <li><strong>vasm</strong> — <strong>Volker Barthelmann &amp; Frank Wille</strong>: the m68k assembler, compiled here to WebAssembly unmodified.</li>
        </ul>

        <h3>Links</h3>
        <ul class="about-links">
          <li><a href="https://funklang.mkael.net" target="_blank" rel="noopener">Live app — funklang.mkael.net</a></li>
          <li><a href="https://www.pouet.net/prod.php?which=85351" target="_blank" rel="noopener">Pouët</a></li>
          <li><a href="https://github.com/kieranhj/archieklang" target="_blank" rel="noopener">AmigaKlang on GitHub</a></li>
          <li><a href="https://github.com/elhigu/funklang.mkael.net" target="_blank" rel="noopener">Published site repo</a></li>
        </ul>
        <p class="about-by">Reimplementation by <strong>Mikael Lepistö</strong> (elhigu / funktion).
        AmigaKlang © Jochen “Virgill” Feldkötter.</p>
      </section>

      <section>
        <h3>Changelog</h3>
        <div class="about-changelog">${renderChangelog(changelogRaw)}</div>
      </section>
    </div>`;
}

export function mountAboutModal(root: HTMLElement): AboutModal {
  const overlay = document.createElement('div');
  overlay.id = 'about-overlay';
  overlay.className = 'about-overlay hidden';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = bodyHtml();
  root.appendChild(overlay);

  const isOpen = (): boolean => !overlay.classList.contains('hidden');
  const close = (): void => overlay.classList.add('hidden');
  const open = (): void => { overlay.classList.remove('hidden'); overlay.scrollTop = 0; };

  (overlay.querySelector('#about-close') as HTMLButtonElement).addEventListener('click', close);
  overlay.addEventListener('click', (ev) => { if (ev.target === overlay) close(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && isOpen()) close(); });

  return { open, close, isOpen };
}
