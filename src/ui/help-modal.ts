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
                <tr><td>Drag an instrument row</td><td>Reorder instruments in the sidebar. Clone/chordgen sources auto-rewire to follow the moved instrument; links that would violate Klang's "source must be a lower-numbered instrument" rule reset to instrument 01</td></tr>
              </tbody>
            </table>

            <h3>Slider (when bar is focused — click it once)</h3>
            <table class="help-kbd">
              <tbody>
                <tr><td>Click anywhere on the bar</td><td>Set value to that position; bar gains focus</td></tr>
                <tr><td>Drag</td><td>Value follows the mouse X (release to commit)</td></tr>
                <tr><td>Wheel over the slider</td><td>Coarse step (range-aware: ~3 % of range or log on freq knobs)</td></tr>
                <tr><td><kbd>Shift</kbd>+wheel</td><td>16 × coarse step (big jumps)</td></tr>
                <tr><td><kbd>↑</kbd> / <kbd>↓</kbd></td><td>± step (1 normally; 2 for even-only knobs like loop offset / sample length)</td></tr>
                <tr><td><kbd>Shift</kbd>+<kbd>↑</kbd> / <kbd>↓</kbd></td><td>± 16 × step</td></tr>
                <tr><td><kbd>←</kbd> / <kbd>→</kbd></td><td>± coarse step (range-aware)</td></tr>
                <tr><td><kbd>Shift</kbd>+<kbd>←</kbd> / <kbd>→</kbd></td><td>± 16 × coarse step</td></tr>
                <tr><td><i>(small ranges)</i></td><td>Sliders with fewer than 64 values have no separate coarse mode — coarse collapses to ± step</td></tr>
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
                <tr><td>Slot reorder scroll</td><td>Moving a slot up/down preserves the slot-grid scroll position — you won't get yanked back to the top</td></tr>
                <tr><td>mul const value</td><td>Edit the integer knob OR type a float in the sidecar field — they share the same underlying value (val / 32767 ≈ float ∈ [-1.0, 1.0])</td></tr>
                <tr><td>Clone offset</td><td>Max = source instrument's sample length − 2. Changing source rescales the offset by the SL ratio so the same fractional sample position is preserved (even-snapped)</td></tr>
                <tr><td>New slot outVar default</td><td>Picks a variable that an earlier slot already reads (so the chain feeds something), falling back to the first unused variable</td></tr>
                <tr><td>Newly inserted slot defaults</td><td>Per-op factory values applied on insert — e.g. vol = gain 128, osc_saw/tri/sine = freq 50/gain 64, osc_pulse adds width 63, osc_noise = gain 64, enva = attack 16/gain 64, envd = decay 16/sustain 64/gain 64, add = val1 v1/val2 0, dly_cyc = gain 128, cmb_flt_n = gain 64 (delay 0, feedback 0), reverb = feedback 64/gain 64, sv_flt_n = cutoff 16/reso 16/LP, distortion = gain 64, sample_hold = step 8. See <code>src/dsp/op-metadata.ts::INSERT_DEFAULTS</code></td></tr>
                <tr><td>add op input</td><td>val1 is variable-only (no constant); first insert defaults to v1</td></tr>
                <tr><td>cmb_flt_n / reverb feedback label</td><td>Re-labelled from <code>fbk</code> to <code>feedback</code> (no behaviour change)</td></tr>
                <tr><td>imported_sample, vocoder</td><td>Marked unsupported in the op picker (no engine codegen)</td></tr>
                <tr><td>Sample length</td><td>The instrument header's length is the same horizontal knob the slot rows use — click/drag the bar to set, dblclick to type, wheel for coarse (Shift × 16). Step 2 (even only)</td></tr>
                <tr><td>Even-only fields</td><td>For knobs with step=2 (loop_gen offset, sample length) every mutation (drag / wheel / arrow / numeric editor) snaps to the nearest even value; ArrowUp = ±2, Shift+ArrowUp = ±32</td></tr>
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
