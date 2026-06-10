# Changelog

All notable changes to **funklang** are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Release process:** bump `version` in `package.json` and add a dated entry here
> *before* publishing (`./deploy.sh`). `deploy.sh` refuses to publish if the current
> `package.json` version has no matching `## [x.y.z]` heading in this file.

## [Unreleased]

### Added
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
- Help modal links to example `.akp` patches (the archieklang patches folder).
- `THIRD-PARTY-NOTICES.md` — attribution + terms for vasm, the Emscripten runtime,
  and the reimplemented AmigaKlang/Aklang2Asm work.

### Changed
- The op picker now **prefills every op's exact add-cost** when it opens (was
  computed lazily on hover).
- Trimmed the help modal (it had grown very verbose).
- Renamed `sizelab/` → `groundtruth/` (it's the oracle/fixtures/verification layer
  now, not the deleted size estimator).
- Corrected the vasm license wording (source-available freeware, not "free for use").

### Removed
- The audio mute / autoplay toggle. **Audio now always plays on every edit**, on
  desktop and mobile alike (Space or the top-bar ▶ replay on demand).

### Fixed
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
