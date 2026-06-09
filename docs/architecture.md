# funklang architecture

How the codebase is organised. The interesting/reusable subsystems are the
**bit-exact DSP engine**, the **byte-exact Aklang2Asm port**, and the **vasm
WebAssembly** assembler — each usable largely on its own.

```
patch (.akp) ──► src/dsp ───────────────► audio preview (bit-exact)
            └──► src/codegen ──► C / dan-script
            └──► src/asm/akgen ──► m68k .asm ──► src/asm/vasm (WASM) ──► .bin
                                                       └──► src/asm/size-* ──► exact size
```

## `src/` — the shipped app

### `src/dsp/` — bit-exact audio engine
A from-scratch reimplementation of the AmigaKlang rendering core, verified
sample-for-sample against reference renders (`tests/dsp/bit-exact.test.ts`, 400+
cases). `engine.ts` renders an instrument; `ops/` holds one module per operator (26
ops: oscillators, envelopes, filters, FX, clone/chordgen…). `types.ts` defines the
render result. This is the "play it now" path and the ground truth the asm path is
checked against.

### `src/asm/` — Amiga code generation & sizing
- **`akgen/`** — `emitAkGenerate(patch)`: a **byte-exact** TypeScript port of
  *Aklang2Asm V1.1 by Dan/Lemon*. `state.ts` (instance counters, tables),
  `helpers.ts` (register/immediate mapping, decay/chord tables), `framework.ts`
  (the `Main` scaffolding — prologue, per-instrument loop, epilogue, vars),
  `ops.ts` (one ported emitter per op + the dispatch table), `index.ts` (drives it
  from the dan-script). Guarded by `tests/asm/akgen/` frozen-byte fixtures.
- **`vasm/`** — vasm 2.0e (`vasmm68k_mot`) compiled to WebAssembly
  (`vasm-m68k.{mjs,wasm}`) plus `vasm.ts`’s `assembleM68k(src, {format})` wrapper.
  An in-browser m68k assembler. Rebuild steps in `vasm/README.md`.
- **`assemble-bin.ts`** — `assembleBin(patch)` / `exactBinSize(patch)`: glues
  akgen → vasm into a `.bin` + size.
- **`size-service.ts`** — `exactSize(patch)`: assembles off the UI thread in a Web
  Worker (`size-worker.ts`), memoised + de-duplicated by generated asm, with a
  main-thread fallback for tests/node. `peekSize()` for instant cached repaints.
- **`size-ablation.ts`** — exact per-phase / per-op deltas by ablation
  (`size(full) − size(variant)`), used by the breakdown modal and op picker.

### `src/codegen/` — C & dan-script generation
The pure patch→text generators: `emit-inst.ts` (`emitInst` = C, `emitDanScript` =
the script format `Aklang2Asm` consumes), `arg-emit.ts`, `op-args.ts`,
`emit-ilen.ts`, etc. The C output is what the original tool's gcc build compiles;
also offered in the CODE panel for reuse in a demo engine.

### `src/patch/` — the patch model & rules
`types.ts` (Patch / Instrument / Slot + factories), `model.ts` (`PatchModel` +
event bus), `history.ts` (undo/redo), `clone-graph.ts` (cross-instrument clone
dependency index + cycle detection), `loop-rules.ts`, `normalize.ts`, `queries.ts`,
`smart-out-var.ts`, `chip-ram.ts` (exact resident chip-RAM).

### `src/fileio/` — `akp.ts` / `aki.ts` patch & instrument (de)serialisation.

### `src/schema/` — `op-metadata.ts`: the single source of truth for operators
(codes, names, categories, param widgets). The picker and per-row param controls
are generated from it.

### `src/ui/` — the editor (DOM, no framework)
`app.ts` (boot + wiring), `slot-grid.ts` (the instrument/phase grid), `op-picker.ts`,
`size-statusbar.ts` + `size-breakdown-modal.ts` (exact size readout),
`code-export-modal.ts` (CODE panel), `help-modal.ts`, `sidebar.ts`, knobs, waveform
rendering, touch tuner, autosave, file dialogs, `format.ts`, etc.

### `src/audio/` — `player.ts`: Web Audio playback of rendered samples.

## `groundtruth/` — dev-only build harness & oracle (never imported by `src/`)
`isolation.test.ts` enforces that boundary.
- **`harness/`** — `asm-bin.ts` (the live oracle: patch → asm via the *real*
  `Aklang2Asm` under `mono` → vasm; used to freeze byte-exact fixtures),
  `export-bin.ts` + `compile.ts` (the gcc-C `.bin` build under wine — the original
  "Export Amiga Binary"), `build-sandbox.ts`, `wine-env.ts`.
- **`exporter/`** — the C exporter pieces (`emit-isamp`, `emit-iset`, `emit-mod`,
  `minimal-mod`, `export-patch`, `write-artifacts`) feeding the gcc build.
- **`tools/`** — verification-patch generator.
- **`corpus/real/`** — real `.akp` fixtures used by the byte-exact tests.

## `tests/`
`tests/dsp/` (bit-exact audio), `tests/asm/` (vasm + akgen byte-exact + size
service), `tests/codegen/`, `tests/ui/`, `tests/patch/`, `tests/fileio/`. Plus
`tests-e2e/` (Playwright).

## Build & deploy
Vite bundles the app; the vasm-WASM + size worker are split into their own chunks
and reference the hashed `.wasm` asset. `deploy.sh` publishes `dist/` to the
`funklang.mkael.net` GitHub Pages repo (and enforces the version/CHANGELOG rule —
see [AGENTS.md](../AGENTS.md)).
