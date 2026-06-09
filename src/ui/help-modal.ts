// The keyboard-shortcuts / behaviour reference modal. Pure presentation:
// a large static HTML blob plus its open/close wiring, extracted from
// app.ts so the controller isn't carrying ~110 lines of <tr> markup.
//
// Per the project rule, this is where help content lives now — UX-behaviour
// changes update the rows here (in the same commit as the behaviour change).

/** The overlay markup. Interpolated into app.ts's root template. */
export function helpOverlayHtml(): string {
  return `
      <div id="help-overlay" class="help-overlay hidden" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <div class="help-card">
          <div class="help-head">
            <span id="help-title">FUNKLANG.WEB</span>
            <button class="help-close" id="help-close" aria-label="Close">✕</button>
          </div>
          <div class="help-body">
            <p class="help-intro">New here? Grab example patches from
            <a href="https://github.com/kieranhj/archieklang/tree/main/patches" target="_blank" rel="noopener">the archieklang patches folder</a>
            (download a <code>.akp</code>, then <strong>OPEN&nbsp;PATCH</strong>). Build sound
            from synthetic operators — funklang has no sample import.</p>

            <h3>Playback</h3>
            <table class="help-kbd"><tbody>
              <tr><td><kbd>Space</kbd></td><td>Replay the selected output (even if muted)</td></tr>
              <tr><td>🔊 on a slot</td><td>Make that slot the playback output + audition it</td></tr>
              <tr><td>▶ next to OUTPUT</td><td>Toggle auto-play on every edit (green) / off (red)</td></tr>
              <tr><td>Phone</td><td>Auto-play is always on; the ▶ in the top bar replays the current output</td></tr>
            </tbody></table>

            <h3>Instruments (sidebar)</h3>
            <table class="help-kbd"><tbody>
              <tr><td>Click / <kbd>↑</kbd><kbd>↓</kbd> / wheel</td><td>Select an instrument (auditions if auto-play is on)</td></tr>
              <tr><td>Drag a row</td><td>Reorder; clone/chordgen sources auto-rewire (links that break Klang's lower-index rule reset to 01)</td></tr>
              <tr><td>Hover a row → ✕</td><td>Reset that instrument (confirms first)</td></tr>
            </tbody></table>

            <h3>Knobs / sliders</h3>
            <table class="help-kbd"><tbody>
              <tr><td>Click / drag</td><td>Set value (freq knobs use a soft taper so the low end is reachable)</td></tr>
              <tr><td>Wheel / <kbd>↑</kbd><kbd>↓</kbd><kbd>←</kbd><kbd>→</kbd></td><td>Step (hold <kbd>Shift</kbd> for ×16; even-only fields step by 2)</td></tr>
              <tr><td>Double-click</td><td>Type an exact value · <kbd>Right-click</kbd> resets to default</td></tr>
              <tr><td>Touch (phone/tablet)</td><td>Opens the value tuner: big slider + ±1/±10/±100 rollers, live waveform; swipe up/down to walk params</td></tr>
              <tr><td><kbd>Tab</kbd></td><td>Moves between value sliders + the source picker (other controls are mouse-only)</td></tr>
              <tr><td>BASE (header)</td><td>Switch all numbers dec/hex (inputs accept either, e.g. <code>0x10</code>)</td></tr>
            </tbody></table>

            <h3>Slots (phases)</h3>
            <table class="help-kbd"><tbody>
              <tr><td>Click row / op name</td><td>Select the phase / change its op (op picker)</td></tr>
              <tr><td>✕ · drag # · <kbd>+</kbd> corners</td><td>Delete · reorder · insert a slot before/after</td></tr>
              <tr><td>Empty instrument</td><td>Click the <kbd>+</kbd> placeholder — the first slot auto-names it and sets a 12 KB length</td></tr>
              <tr><td>▶ on a clone slot</td><td>Expand the source instrument inline</td></tr>
              <tr><td>loop_gen</td><td>Always pinned to the last slot; only one per instrument</td></tr>
              <tr><td>mul const</td><td>Integer knob and the float sidecar share one value (val / 32767 ≈ −1..1)</td></tr>
              <tr><td>⋯ menu (header)</td><td>IMPORT / EXPORT <code>.aki</code> + REMOVE for the active instrument</td></tr>
            </tbody></table>

            <h3>Validation (red = needs fixing)</h3>
            <table class="help-kbd"><tbody>
              <tr><td>Red instrument row</td><td>A slot has an unwired var-source (a v1–v4 no slot writes) / bad clone source — fix the red dropdown</td></tr>
              <tr><td>Red dropdown / (unset)</td><td>That v1–v4 is written by NO slot — it's silence. (clone source must be a lower-numbered instrument)</td></tr>
              <tr><td>Cyan dropdown / (feedback #N)</td><td>That v1–v4 is written only by a LATER slot (phase N). The variable bank persists across samples, so the read picks up phase N's value from the PREVIOUS sample — a deliberate one-sample feedback loop, not an error</td></tr>
              <tr><td>Loop edge (top wave-view)</td><td>Drag the pink left edge to retune the loop offset (snaps to the valid even position)</td></tr>
            </tbody></table>

            <h3>File &amp; history</h3>
            <table class="help-kbd"><tbody>
              <tr><td><kbd>Ctrl</kbd>+<kbd>S</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd></td><td>Save / Save as…</td></tr>
              <tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd></td><td>Undo / Redo (drags coalesce into one undo)</td></tr>
              <tr><td>Autosave / REVERT AUTOSAVE</td><td>Snapshot to localStorage every minute (30 min kept); restore from the panel</td></tr>
              <tr><td><kbd>?</kbd> or <kbd>Esc</kbd></td><td>Toggle / close this help</td></tr>
            </tbody></table>

            <h3>Size &amp; CODE export</h3>
            <p>The footer shows the patch's <strong>exact</strong> exported <code>.bin</code>
            size + resident chip-RAM — the real byte count, assembled in-browser (a
            byte-for-byte port of <code>Aklang2Asm</code> + vasm-WebAssembly). A
            <span class="size-spin">⟳</span> spins while a new patch assembles; results cache.
            Click the footer for a per-phase breakdown (bytes each phase frees if deleted);
            the op picker shows each op's exact add-cost on hover. <strong>CODE</strong> (top
            menu) downloads the <code>.asm</code>, the C generators, and the exact
            <code>.bin</code>. Patches the generator can't build (e.g. variable
            <code>enva</code>) read <em>size unavailable</em>.</p>

            <p class="help-foot">Mac: use <kbd>⌘</kbd> wherever <kbd>Ctrl</kbd> is listed.</p>
          </div>
        </div>
      </div>`;
}

export interface HelpModal {
  /** Open if closed, close if open. */
  toggle(): void;
  /** Close the overlay. */
  hide(): void;
  /** Is the overlay currently visible? */
  isOpen(): boolean;
}

/**
 * Wire the help modal's buttons + outside-click. Call once after the root
 * template (which must include `helpOverlayHtml()`) is in the DOM. Returns
 * control handles so the global keyboard handler can drive Esc / `?`.
 */
export function wireHelp(root: HTMLElement): HelpModal {
  const overlay = root.querySelector('#help-overlay') as HTMLElement;
  const closeBtn = root.querySelector('#help-close') as HTMLButtonElement;
  const isOpen = (): boolean => !overlay.classList.contains('hidden');
  const hide = (): void => overlay.classList.add('hidden');
  const show = (): void => overlay.classList.remove('hidden');
  const toggle = (): void => (isOpen() ? hide() : show());
  (root.querySelector('#btn-help') as HTMLButtonElement).addEventListener('click', toggle);
  closeBtn.addEventListener('click', hide);
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) hide();   // outside click closes
  });
  return { toggle, hide, isOpen };
}
