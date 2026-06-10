# Changelog

All notable changes to **funklang** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Release process:** bump `version` in `package.json` and add a dated entry here
> *before* publishing (`./deploy.sh`). `deploy.sh` refuses to publish if the current
> `package.json` version has no matching `## [x.y.z]` heading in this file.

## [Unreleased]

### Changed
- The **OUTPUT / MASTER V1** routing control moved from the top menu to the
  footer (it's a per-instrument routing toggle, not a global menu action, and
  is now always visible — including on mobile).
- The help menu item now reads **HELP** (was a `?` icon), matching the other
  text items.
- About modal links: label the Pouët link **AmigaKlang Pouët**, and replace the
  published-site repo link with the **funklang source + issue tracker** repo.

## [1.2.0] — 2026-06-10

### Added
- **ABOUT / credits modal.** A new `ABOUT` item in the top menu opens a modal
  with the build version, a curated credits/links block, and the changelog
  rendered live from `CHANGELOG.md`. It also notes that other output routes
  (Amiga `.exe`, Atari `.prg`) are done by loading the `.akp` in the original
  AmigaKlang.
- **Touch waveform zoom/pan.** Two-finger drag on the top waveform now zooms
  (up/down, around the gesture centroid) and pans (side-to-side) — previously
  the waveform had no touch zoom/pan at all.

### Changed
- The **PLAY button is now always visible**, right-aligned in the header with a
  `▶ PLAY` label (it was a phone-only ▶ in the menu).

### Removed
- The footer's **selected-instrument / output readout** — it overflowed and
  broke the footer layout in narrow windows, and duplicated what the sidebar and
  OUTPUT chip already show.

### Fixed
- **Mobile audio (iOS).** Declared a `'playback'` audio session so sound plays
  through the phone speaker even with the hardware mute switch on — previously
  audio was audible only with headphones plugged in.
- The instrument length **knob bar no longer collapses to nothing** — it had
  shrunk to ~0px (only the label + number showed); it's a proper draggable bar
  again.

## [1.1.0] — 2026-06-10

### Added
- **Packed size.** Shrinkler (Blueberry's Amiga cruncher) is now compiled to
  WebAssembly and run in the size worker, so the footer shows the
  Shrinkler-packed `.bin` size (after `→`) next to the raw size — the rough
  shipped cost. Size-identical to native Shrinkler. (`src/asm/shrinkler/`)
  The **size breakdown** and the **op picker** now show the shrinkled delta too
  (raw → shrinkled) per phase / per op, not just the raw `.bin` delta.
- The op picker explains, in its description strip, **why** an op is disabled
  (e.g. loop_gen must be last / only one allowed).
- **More phone tuning.** Selected instrument stays centered in the collapsed
  rail (all 31 reachable); top waveform is shorter to free room for phases;
  `dvh` + safe-area inset so the last phase's `[+]` clears Safari's bottom bar;
  an always-visible ▶ play button in the top bar; auto-play forced on (the mute
  toggle is hidden on phones).
- **`LICENSE`** — MIT for funklang's own code (bundled vasm + the AmigaKlang/
  Aklang2Asm-derived parts stay under their own terms; see THIRD-PARTY-NOTICES).
  `package.json` license/author/description/keywords filled in.
- **Mobile / portrait support.** Added the `viewport` meta tag (which lets the
  existing editor container-queries and sidebar-collapse actually fire on a
  phone) and phone-tuned the surrounding chrome (footer, modals, touch targets).
- **LOAD EXAMPLE.** The help modal's intro box now has a `LOAD EXAMPLE` button
  that fetches the archieklang patches folder live from GitHub, lists the
  patches, and loads the chosen one straight into the editor — no
  download-then-OPEN PATCH round-trip. Lazy + session-cached; loading a remote
  patch shows on the footer activity light.
- **Footer activity light.** The bottom-right badge is now a real status light:
  it blinks `ASSEMBLING` / `SHRINKLING` while the `.bin` is built or packed,
  `PLAYING` while audio sounds, and rests at a steady `READY` when idle (it used
  to just blink `READY` meaninglessly).
- `THIRD-PARTY-NOTICES.md` — attribution + terms for vasm, the Emscripten runtime,
  and the reimplemented AmigaKlang/Aklang2Asm work.

### Changed
- **Footer size readout.** The exact and packed `.bin` figures now show plain
  byte counts (no redundant kB rounding), the packed figure is labelled
  **shrinkled**, and the two are colour-coded (amber = exact, green = shrinkled).
- New-instrument default sample length is now **8 KB** (was 12 KB).
- The op picker now **prefills every op's exact size delta** when it opens (was
  computed lazily on hover). When **changing** an existing slot's op it shows the
  signed delta of *replacing* it — so e.g. reverb → add reads as a **negative**
  value (the patch shrinks); inserting a new op is still add-only (≥0).
- Trimmed the help modal (it had grown very verbose).
- Renamed `sizelab/` → `groundtruth/` (it's the oracle/fixtures/verification layer
  now, not the deleted size estimator).
- Corrected the vasm license wording (source-available freeware, not "free for use").

### Removed
- The audio mute / autoplay toggle. **Audio now always plays on every edit**, on
  desktop and mobile alike (Space or the top-bar ▶ replay on demand).

### Fixed
- The collapsed top-menu (hamburger) dropdown now opens anchored to the ☰
  button instead of floating off in the top-right corner.
- A REQUIRED input left unwired (e.g. reverb/add/filters with no var-source) now
  flags the instrument red and the dropdown red — that patch can't assemble at
  all, so the size correctly reads "unavailable" rather than silently failing.
- Removed the misleading "· shared" tag from op costs. This build inlines each op
  at every use (no shared subroutines), so an op is *not* cheaper when already in
  the patch — e.g. each reverb costs ~485 B every time. The cost shown is simply
  that op's own size in context.
- Op-picker add-costs showed `+0 B` for every op (the trial slot lacked an output
  variable, so codegen skipped it). Now they reflect real byte deltas.
- Instruments using a feedback variable (read of a var written by a later slot) are
  no longer flagged red — only a variable no slot writes is invalid.
- loop_gen is enforced as the single, last op across insert / op-change / drag.

## [1.0.0] — 2026-06-09

First public release. A browser reimplementation of Jochen "Virgill"
Feldkötter's **AmigaKlang** synthesizer/editor.

### Added
- **Patch editor** — instruments × phases (ops) with live knobs, drag-reorder,
  clone expansion, per-note audition, autosave, undo/redo, `.akp`/`.aki`
  load & save. Hamburger menu collapse on narrow screens.
- **Bit-exact audio engine** (`src/dsp/`) — a from-scratch reimplementation of the
  AmigaKlang rendering core, verified sample-for-sample against reference renders.
- **In-browser Amiga code generation:**
  - `emitAkGenerate` (`src/asm/akgen/`) — a **byte-exact** TypeScript port of
    *Aklang2Asm V1.1 by Dan/Lemon*; produces the `AK_Generate` m68k routine.
  - **vasm-WebAssembly** (`src/asm/vasm/`) — vasm 2.0e compiled to WASM, assembles
    the m68k source to a raw `.bin` entirely client-side.
  - **CODE** export panel — downloads the `.asm`, the C generators, and the exact
    Amiga `.bin` for the current patch.
- **Exact size readout** — the footer shows the patch's real assembled `.bin`
  byte count (assembled off-thread in a Web Worker), not an estimate. Click for a
  per-phase breakdown ("bytes freed by deleting this phase"); the op picker shows
  each op's exact add-cost on hover. Unassemblable patches read "size unavailable".
- **Docs** — `docs/bin-format.md` (the `.bin` format + calling convention),
  `docs/architecture.md` (module map), `docs/klang-behavior.md`,
  `docs/dsp-reference.md`.

### Known limitations
- **No sample import.** funklang targets fully synthetic instruments; imported
  raw samples (`.raw` in the original tool) are not supported. The C/asm
  generators reference an external-samples pointer but the editor never populates
  it.
