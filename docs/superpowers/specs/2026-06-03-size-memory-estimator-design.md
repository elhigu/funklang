# Size & Memory Estimator — Design

**Date:** 2026-06-03
**Status:** Approved design, pre-implementation

## Goal

Give the funklang editor a live, always-visible estimate of what a patch will
cost when built into an Amiga intro by aklang's `exe_creator` pipeline. The
number that matters for an intro is the **shrinklered exe-size contribution of
the sample-generation code**, so that is the headline. Chip-RAM is a secondary,
informational figure (a "won't blow the A500 budget" sanity check).

Two figures are surfaced per scope (total / selected instrument / slot):

1. **Estimated uncompressed compiled exe size** — what the sample-generation
   code + baked-in imported samples add to the m68k binary before Shrinkler.
2. **Estimated shrinklered size** — (1) after Shrinkler compression.

Neither requires compiling. Both come from a model whose constants are fitted
once, offline, by a calibration tool that *does* compile a corpus through the
existing wine toolchain. The shipped app is pure JS/TS — no native code, no
compiler, no wine at runtime.

A WASM port of the aklang tools (to make true compilation possible in-browser)
is explicitly **out of scope** here; noted as a possible future side project.

## Why these numbers diverge (and why both matter)

- **Generated samples cost zero exe bytes.** They are computed at runtime on the
  Amiga during precalc. Only the *program that generates them* (the op-stream +
  the op routines it calls) lands in the binary.
- **Imported samples cost exe bytes.** They are baked into the binary
  (`Isamp.raw`, delta-packed) and decompressed at runtime.
- **Op routine code is paid once per distinct op type used, not per use.** Every
  op routine is defined unconditionally in `exe_creator/synthnodes.h`; the
  Makefile compiles with `-flto -fwhole-program`
  (`exe_creator/Makefile-executable:17`), so link-time dead-code elimination
  strips any op routine the generated op-stream never calls. The first use of an
  op type drags its routine (and any not-yet-pulled-in shared helpers like
  `vol`/`clamp`/`mulsw`/`abs`) into the binary; every later use of the same type
  is nearly free (a few stream bytes only).

The last point is the central decision signal for an intro coder: *does this
edit introduce a new op type (expensive — pulls in code) or reuse one already
present (cheap)?* The per-slot annotation must reflect this **marginal** cost.

## The model

### Estimated uncompressed compiled exe size

```
estUncompressed =
    BASE                                   // player code, mod template, fixed overhead
  + Σ_{op types used} opCodeCost[op]       // one routine per distinct op type, via LTO DCE
  + N_used_slots * SLOT_STREAM_COST        // per-slot op-stream data (small, ~constant)
  + impBytes                               // imported samples, baked in 1:1 (pre-pack)
```

- `opCodeCost[op]` — fitted m68k code bytes pulled in by each distinct op type.
  The dominant variable cost. Because ops share helpers, these are not perfectly
  independent; the fit averages the overlap and calibration reports the residual.
- `SLOT_STREAM_COST` — fitted bytes the generated op-stream (`Inst.h`-equivalent)
  adds per used slot.
- `BASE` — fitted intercept: everything present even for a trivial patch.
- `impBytes` — exact, from the patch model (sum of imported-sample byte lengths).

### Estimated shrinklered size

Code and sample data compress differently, so the compression model keeps them
separate rather than applying one blanket ratio:

```
estShrinkled =
    SHRINK_BASE
  + (BASE + Σ opCodeCost + N_used_slots*SLOT_STREAM_COST) * codeRatio
  + impBytes * impRatio
```

`codeRatio`, `impRatio`, and `SHRINK_BASE` are fitted from the corpus.

### Known approximation (recorded on purpose)

Shrinkler compresses the whole stream as one context, so true compressed size is
not additive. The linear model is a **budgeting** estimate: monotonic and
directionally correct ("did my edit grow or shrink it, and roughly by how
much"), but it over-estimates when content repeats. The UI labels every figure
as an estimate. Calibration reports mean and max residual error in bytes across
the corpus so the estimate's trustworthiness is visible and tracked.

## Chip-RAM (exact, no calibration)

The headline chip figure is the **resident (play-time)** allocation
(`exe_creator/main-executable.c:479-481`):

```
residentChip = mod_length_empty + Σ_i SmpLength[i] + imp_length
```

All MEMF_CHIP. `SmpLength[i]` is the per-instrument generated-sample length our
renderer already computes — `RenderResult.bytes.length`, i.e. `sampleLength + 1`
bytes per instrument (`src/dsp/engine.ts:84,182-185`; `sampleLength` is a field
on `Instrument`, `src/patch/types.ts:46`). `imp_length` is the sum of
`importedSamples[i].data.length` (`Int8Array`, `N_IMPORTS = 8`,
`src/patch/types.ts`). `mod_length_empty` exists only in the build-generated
`Iset.h` (consumed by `main-executable.c:479,484`), so it is **not** available in
the funklang codebase; it is measured once offline and committed as a constant in
`calibration-data.ts` (the empty ProTracker module template is fixed-size, so a
single measurement suffices). The transient
24*2048*2 = 98304-byte precalc work buffer is **not** surfaced as a headline (the
user confirmed enough free chip is available during precalc); it may appear as a
tooltip footnote only.

## Module layout

```
funklang/src/sizecalc/
  chip-ram.ts          # exact resident chip-RAM from Patch (no calibration)
  exe-size.ts          # calibrated linear-model exe-size estimate (uncompressed + shrinkled)
  breakdown.ts         # totals + per-instrument + per-slot marginal detail
  calibration-data.ts  # committed fitted constants (output of the calibration tool)

funklang/tools/
  calibrate-exe-size.ts  # node script: drives wine, fits constants, rewrites calibration-data.ts

funklang/src/ui/
  size-statusbar.ts        # populates the size cells of the EXISTING footer
  size-breakdown-modal.ts  # click-to-expand full breakdown
```

`sizecalc/` is pure functions over `Patch` — no DOM, no audio — unit-testable in
isolation. UI components subscribe to the existing `PatchModel` event bus:
`model.events.on((e: PatchChange) => ...)` (`src/patch/events.ts`,
`src/patch/model.ts:28`), the same channel `app.ts` already uses to refresh.

**Extend the existing footer, do not add a second bar.** A `<footer>` status bar
already exists (`src/ui/app.ts:126-135`, updated by `updateLabels()`), with a
3-column grid (`auto 1fr auto`) whose left and right cells are largely free.
`size-statusbar.ts` populates size cells within that footer rather than
introducing a competing bottom bar, and hooks the same refresh path.

Op identity comes from `slot.fn` (numeric op code) resolved via
`opByCode(slot.fn)` in `src/schema/op-metadata.ts` (24 op codes; note this module
moved from `src/dsp/` to `src/schema/`). "Distinct op types used" = the set of
`slot.fn` values across all populated slots.

## UI

- **Bottom bar (always visible):**
  - Total estimated shrinklered size (headline) + total uncompressed, for the
    whole patch.
  - Estimated shrinklered size + uncompressed for the **currently selected
    instrument**.
  - Resident chip-RAM total.
  - All marked as estimates.
- **Click the totals → breakdown modal:** full attribution — per-instrument
  bytes, op-types-present with their code cost, imported-sample share, BASE, and
  the calibration's reported ± error.
- **Per-slot annotation on the selected instrument:** each used slot shows its
  **marginal** estimated byte cost — i.e. the op-code cost is counted only for
  the *first* occurrence of each op type within the patch; later slots using an
  already-present op type show just their stream cost. This makes the
  "new op type vs reuse" distinction visible at the point of editing.

## Calibration tool

`funklang/tools/calibrate-exe-size.ts`, run on the user's machine via a new
`npm run calibrate-exe-size` script. It is a Node/`tsx` script (the repo already
depends on the vite/vitest TS toolchain; `tsx` is the invocation pattern for
`.ts` tools — `funklang/tools/` currently holds only `refrender/`, so this is the
first tool of its kind). Re-run whenever engine code or compiler flags change.

Strategy:

1. **Isolate per-op-type code cost** with synthetic minimal patches: a baseline
   patch, then one patch per op type that adds a single use of that op. Compile
   each through the existing wine pipeline; the binary-size delta from baseline
   approximates that op's `opCodeCost` (shared-helper overlap noted as known
   error).
2. **Fit `BASE`, `SLOT_STREAM_COST`, `impBytes` handling, and the compression
   constants** by least-squares over the real `patches/*.akp` corpus, using the
   measured `(op-bag, slot-count, imp-bytes) → uncompressed size` and
   `→ shrinklered size` pairs.
3. **Report fit quality**: mean and max residual error in bytes for both the
   uncompressed and shrinklered estimates, written into `calibration-data.ts` as
   a comment and exported as a constant the UI can show.
4. Emit `calibration-data.ts` with the fitted constants; commit it.

Scope for now: the Amiga `.exe` target only (not `.bin` / Atari `.prg`).

Prerequisite: the calibration tool needs to feed patches into the pipeline.
Either generate aklang's textual `script.txt` for `aklang2asm.exe`, or emit the
`Iset.h`/`Ilen.h`/`Inst.h`/`Isamp.raw` headers directly from the patch model.
This dependency is shared with the broader "export amiga exe" effort and will be
resolved as part of implementing the calibration tool.

**Not a blocker for the estimator/UI.** `calibration-data.ts` ships with
hand-seeded starter constants (rough per-op costs + ratios), so the
`sizecalc/` core, the bottom bar, the breakdown modal, and the per-slot
annotations can all be built and tested against those. Running
`calibrate-exe-size` later replaces the seeds with fitted values; nothing in the
app's structure changes when it does.

## Out of scope

- WASM port of the aklang toolchain (possible future side project).
- `.bin` and Atari `.prg` size estimation.
- Compile-on-edit / "pin to real size" button.
- Surfacing the transient precalc work buffer as a headline figure.
