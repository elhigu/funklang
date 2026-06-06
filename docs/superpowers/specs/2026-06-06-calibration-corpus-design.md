# Calibration Corpus — Design

**Date:** 2026-06-06
**Status:** Design for review (pre-implementation)
**Sub-project 3 of 4** in the size-estimator effort (exporter → compile harness → **corpus** → fitter). Depends on sub-project 1 (exporter, in progress) to produce build inputs and sub-project 2 (wine64 compile harness) to measure sizes. Compilation is **fully automated** — this corpus adds **zero** manual GUI work.

## Goal

Produce a corpus of synthetic patches whose compiled sizes let us resolve, **per operation and per parameter configuration**, how much each synthesis **phase** (one `vN = op(args);` slot) contributes to the Amiga executable. The output is a fitted cost table that makes the live estimator track real compiled sizes.

The previous P01–P07 patches are insufficient for this — they cover *codegen variety* (for byte-exact exporter verification) but not the *controlled, repeated variation* needed to separate fixed from marginal costs. This corpus is built for measurement, not verification.

## Terminology

- **Phase / slot** — one op invocation in an instrument's synthesis graph: `vN = op(args);` in `inst.h`.
- **Op type** — the operation (osc_saw, sv_flt_n, …); there are ~22 emittable ones (excludes loop_gen, and vocoder which the GUI never emits).
- **Param mode** — for each var-or-const parameter, whether it is a **literal** (`#imm`) or a **variable** (`v1..v4`). This is the main per-phase code-shape variable.

## What we are resolving (the cost model)

Compilation with `-Ofast -flto -fwhole-program` is **deterministic**, so each measurement is an exact integer; no repeated runs needed. We resolve an **uncompressed**-size model first because pre-Shrinkler code is genuinely (near-)additive:

```
size_uncompressed(patch) ≈
    B                                            // fixed: player, ptplayer, framework, always-linked (loopgen, clr_buf…)
  + Σ_{o ∈ opTypesPresent}  R[o]                 // op routine code, linked ONCE per distinct type (LTO dead-code elim)
  + Σ_{phase p}             S[op(p), mode(p)]    // per-phase op-stream code, keyed by op + param-mode vector
  + Iuse·[anyImports]      + iByte·importBytes    // imported-sample handling + baked-in delta bytes
  + (generated sampleLength → ≈0 in exe; validated, not assumed)
```

`R[o]` includes the closure of helpers that op pulls in (`vol`/`clamp`/`mulsw`/`abs`); because helpers are shared, `R` values are not independent — the design handles this by **differencing against a baseline and measuring slopes**, and by reporting fit residuals rather than pretending perfect separability.

**Shrinkler is modeled separately.** Compression is non-additive (repetition compresses), so the shrinkled size is fit as `g(uncompressed, composition)` — at minimum a ratio with reported variance, optionally split code-ratio vs import/sample-ratio. The live estimator = uncompressed model × compression model, with stated ± error. We record **both** sizes (`a.mingw.exe` uncompressed, `exemusic.exe` shrinkled) for every patch.

### Key risk made explicit
`-Ofast` + whole-program inlining can **fold, hoist, or CSE** identical phases, so per-phase cost is not perfectly additive. The design **measures effective marginal cost** and **tests for nonlinearity** (vary repetition count and check the slope is constant). Where folding makes a slope non-constant, calibration reports it rather than forcing a line. This is the honest core of "figuring out how each phase behaves."

## Experimental design principle

We can't read `R[o]` and `S[o,mode]` off a single patch (base + routine + stream are entangled). We separate them with **repetition-slope** measurement:

> Build a series of patches that use op `o` (in a fixed config) **N times**, for `N ∈ {1,2,4,8,16,31}`, spread one-per-instrument. Fit `size = a + b·N`. Then **b = S[o, config]** (per-phase stream cost) and **a − B = R[o]** (routine + helper closure). `B` comes from the `N=0` baseline shared by all series.

"One op per instrument, many instruments" is exactly the "multiple instruments for each operation" the requirement calls for — and it's the cleanest repetition unit because each instrument is its own `if (instrument==k){…}` block in the generated function.

## Corpus families

All calibration instruments use a fixed `sampleLength = 4096` (>2 so they emit; constant so sample-length never confounds code size — Family I separately proves sample length is exe-neutral). Every measured phase has a real `outVar`. Ops that consume a variable input get a cheap **producer** phase (an `osc_saw` writing that var) placed first in the instrument; the producer's constant cost cancels in slopes and is itself calibrated (osc_saw is in Family R), so it's not a confound.

### Family O — baseline
- **O0**: one instrument, one `osc_saw` all-literal (the universal anchor). Also the degenerate point for every series. Gives the data to pin `B` once `R[osc_saw]` is known.
- A true empty build is not possible (an instrument must emit), so `B` is recovered algebraically from the O/R series intercepts, cross-checked across ops.

### Family R — routine + per-phase cost, per op type
For each emittable op `o` (the ~22): a **6-patch series** repeating `o` across `N ∈ {1,2,4,8,16,31}` instruments, one canonical phase per instrument:
- **Config:** all params **literal**, mid-range values (e.g. freq 1000, gain 64, width 64, val 8). Var-input ops get one producer phase per instrument writing `v1`; the measured op reads `v1`.
- **Yields:** `S[o, all-literal]` (slope) and `R[o]+B` (intercept). ≈22 × 6 = **132 patches**.
- Linearity check built in (6 points per op).

### Family P — parameter-mode sweep
For each op `o` and each var-or-const param `p` it exposes (freq/gain/width/val1/val2 as applicable): a **3-patch series** `N ∈ {2,8,16}` with `p` in **variable** mode (reading a produced var), all other params literal. Compared against Family R's all-literal slope for `o`, the slope delta = **ΔS for making `p` a variable**.
- Param counts per op vary (1–4 var-or-const params); ≈ aggregate **~45 (op,param) pairs × 3 = ~135 patches**.
- Also one "**all params variable**" series per op (N ∈ {2,8,16}) to catch interaction (non-separable param effects): ~22 × 3 = **66 patches**.

### Family V — value-bucket sweep
For a representative subset of ops (the oscillators, vol, add/mul, and adsr): repeat with literal values in buckets `{0, 1, 64, 127, 255, 1000, 32767, -1, -32768}` at `N ∈ {8}` to detect value-dependent codegen (e.g. `moveq` small-int vs `move.w`, immediate encoding). One series per (op, bucket).
- Mostly expected to confirm value-independence; where a bucket shifts size, the model gains a per-value-class term. ≈ **~60 patches**. (If Family V shows flat size across buckets for an op, that op's `S` is value-independent and we stop sweeping it.)

### Family B — bespoke ops (variable-length expressions)
These emit inline expressions whose **length depends on parameters**, so they need dedicated sweeps (their `S` is not a single number):
- **clone (17):** forward vs reverse (`gainVal` 0 vs ≠0) × transpose literal-vs-var × offset {0, small, large}; repeated `N ∈ {2,8,16}` with instrument 0 as the source and clones in later instruments. (~12 series.)
- **adsr (23):** the emitted operands are **precomputed integers** derived from sampleLength + attack/decay/sustain/release/gain/width — so size depends on those operands' magnitudes. Sweep each rate param across buckets at `N ∈ {2,8}`, plus two sampleLengths. (~16 series.)
- **chordgen (18):** vary the note selectors and shift; with a source instrument; `N ∈ {2,8}`. (~6 series.)
- **imported (20):** vary import index; `N ∈ {2,8,16}`; folds into Family I. (~3 series.)
- ≈ **~110 patches**.

### Family C — connection / topology
Validates the model's structural assumptions:
- **Once-per-type:** two instruments using the **same** op vs two using **different** ops — confirms `R` is charged once per type (slope vs step).
- **Dependency chains:** a single instrument with a chain `v1=osc; v2=f(v1); v3=f(v2); …` of depth `L ∈ {2,4,8,15}` — does chaining change per-phase cost vs independent phases?
- **Variable fan:** phases writing 1 vs 2 vs 3 vs 4 distinct output vars — does the var index/count matter?
- ≈ **~20 patches**.

### Family I — imports & sample length (exe-vs-chip split)
- **Imports:** vary count (0..8) and per-import byte size {0, 256, 4096, 32768}; measure `Isamp.raw` (delta-packed) contribution to the **uncompressed** exe (expected ~1:1) and to shrinkled (compresses). ~12 patches.
- **Sample length:** hold ops fixed, vary `sampleLength ∈ {4, 4096, 32768, 131070}` across instruments; **confirm uncompressed exe size is ~constant** (generated samples are computed at runtime, not stored), proving the chip-vs-exe divergence the estimator relies on. ~6 patches.
- ≈ **~18 patches**.

### Total
≈ **520 patches** (132+135+66+60+110+20+18, minus overlap). At a few seconds per compile under the wine64 harness, the full corpus measures in well under an hour, unattended. No manual GUI step.

## Generation & constraints

A generator (`sizelab/corpus/`) emits the patches as in-memory `Patch` objects (reusing `emptyPatch`/`emptySlot` and the same builder helpers as the verification generator) and feeds each to the exporter + compile harness, recording one CSV row per patch: `{ patchId, family, op, paramModes, N, valueBucket, sampleLength, importBytes, uncompressedBytes, shrinkledBytes, opTypesPresent }`.

Constraints the generator must honor (from the codegen):
- Instrument emits only if `sampleLength > 2`; calibration uses 4096 (Family I varies it deliberately).
- Phase emits only if `outVar != 0 && fn != 22`; every measured phase sets `outVar`.
- Var-input ops (vol/add/mul/ctrl/distortion/reverb and the `errIfVal1Zero` ops 11/13/15/19) require their `val1` (and friends) to reference a variable **already written earlier in the same instrument** — the generator inserts a producer phase first.
- clone/chordgen need a **source instrument at a lower index**; the generator places the source at instrument 0.
- ≤16 editable slots per instrument: within-instrument repetition caps at 16−producers; higher `N` uses more instruments (up to 31).
- `numinstruments`/`highestInstrument` is driven by the highest emitting instrument — series with `N` instruments occupy indices `0..N-1` (plus a source where needed).

## How it feeds the fitter (sub-project 4)

The fitter consumes the CSV:
1. **Per-op slopes/intercepts** from Families R/P/V via least-squares per series; assemble `S[op, mode]` (and value-class terms where Family V demanded them) and `R[op]`.
2. **`B`** from the consensus of `R`-series intercepts.
3. **Bespoke ops** get parameterized size functions (clone/adsr/chordgen) fit from Family B rather than a single `S`.
4. **Import/sample terms** from Family I.
5. **Compression model** from the (uncompressed, shrinkled) pairs across the whole corpus.
6. **Residual report:** mean/max error of the assembled model re-predicting every corpus patch's uncompressed and shrinkled size — written into `calibration-data.ts` (`fitted: true`, `fit{}` block) and surfaced in the UI as the estimate's ±.

The resulting `calibration-data.ts` schema extends the current one: `opCost` becomes per-op `{ routine, stream: Record<modeKey, number> }` plus bespoke size-fn coefficients; existing consumers (chip-ram, exe-size, breakdown) update to read the richer table. That schema change is part of sub-project 4, noted here so the corpus CSV carries every field the fitter needs.

## Relationship to P01–P07 and the live estimator

- **P01–P07** remain the exporter's byte-exact verification gate (sub-project 1). Untouched by this.
- The **corpus** is calibration input only; it is never shipped and never imported by `src/` (lives in `sizelab/corpus/`, same isolation rule).
- The **live estimator** keeps its current fast linear form; calibration just replaces seeded constants with fitted ones and upgrades `opCost` to the per-mode table.

## Out of scope

- The wine64 compile harness itself (sub-project 2) — this design assumes it exists and returns `(uncompressed, shrinkled)` for a patch.
- The fitter implementation (sub-project 4) — only its input contract (the CSV schema) is fixed here.
- Atari `.prg` / raw `.bin` targets.

## Open questions for review

1. **Corpus size** — ~520 patches as scoped, or trim (e.g. drop Family V if value-independence is confirmed on a small probe first) / expand (more repetition points per series for tighter slopes)?
2. **Repetition ceiling** — `N=31` uses every instrument; is that the right max, or cap lower to keep compiles fast?
3. **Per-mode granularity** — model each param independently (additive ΔS) plus one all-variable interaction series (current plan), or measure the full 2^k mode combinations for low-arity ops (more patches, captures all interactions)?
4. **Compression model depth** — single global ratio, or split code/import/sample ratios (needs Family I to anchor the import ratio)? The latter is more accurate for import-heavy patches.
