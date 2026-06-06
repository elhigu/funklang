# Calibration Corpus — Design

**Date:** 2026-06-06
**Status:** Design for review (pre-implementation)
**Sub-project 3 of 4** (exporter → compile harness → **corpus** → fitter). Depends on sub-project 1 (exporter) for build inputs and sub-project 2 (wine64 harness) to measure sizes. Compilation is **fully automated** — zero manual GUI work.

## Goal

Resolve, per operation and per parameter configuration, how much each synthesis **phase** (one `vN = op(args);` slot) adds to the Amiga executable — using the **fewest** compiles. The method is **subtraction against calibrated building blocks**, not statistical repetition.

## Terminology

- **Phase / slot** — one op invocation: `vN = op(args);` in `inst.h`.
- **Op type** — the operation (~22 emittable; excludes loop_gen and the never-emitted vocoder).
- **Param mode** — per var-or-const parameter: **literal** (`#imm`) or **variable** (`v1..v4`). The main per-phase code-shape variable.

## Core method: subtractive calibration

Compilation (`-Ofast -flto -fwhole-program`) is **deterministic**, so each compiled size is an exact integer — one compile per data point, no averaging.

**The standard producer.** A canonical phase — `osc_sine` with fixed constant freq+gain — is the unit input source. Its per-phase cost `P_sin` is calibrated once. Whenever an op needs a *variable* input, that input is produced by a standard sine phase. The op's own cost in that mode is then recovered by subtracting the producers:

```
S[op, mode] = instrumentStream(op, mode) − k · P_sin      // k = number of variable inputs sourced
```

E.g. for `osc_saw` with both freq and gain as variables:
`S[saw, (V1,V2)] = instrumentStream − 2·P_sin`.

**Getting `instrumentStream` (an instrument's marginal code).** Build a **routine-complete scaffold** `K`: one patch with one instrument per op type (each op once, const params) so **every op routine is linked**. Then for any test instrument `T`, compile `K` and `K+T` and difference:

```
instrumentStream(T) = size(K+T) − size(K)
```

Because all routines already exist in `K`, the delta is purely `T`'s per-phase stream code (no `R[op]` routine cost re-added). This is what makes per-op measurement need only a few instruments instead of repetition series.

**Per-param effect (literal→variable).** Read directly as a difference of two modes of the same op, e.g. `ΔS_gain = S[saw,(c,V)] − S[saw,(c,c)]`. Routine, base, and producer costs cancel.

**Routine cost `R[op]` and base `B`.** Measured with one extra minimal diff per op: a patch using only that op once vs the scaffold logic, isolating `R[op]+S[op,cc]`; `B` is the consensus constant across these. (Routine cost is the big per-type chunk; per-phase `S` is the small marginal the modes vary.)

### Honesty note (kept from the rigorous version)
`-Ofast` + whole-program inlining can fold/CSE code, so stream costs aren't perfectly additive. Two cheap guards: (1) verify `P_sin` measured alone equals half of a two-sine instrument (additivity check); (2) the fitter re-predicts every corpus instrument and reports mean/max residual. Where subtraction yields inconsistent values, we report the spread rather than a false-precise number.

## Per-op instrument sets

All calibration instruments use `sampleLength = 4096` (>2 so they emit). Var inputs come from standard sine producers placed first in the instrument. Instrument count per op = enough to read each param's literal↔variable effect plus one all-variable interaction check:

| op kind | example | instruments |
|---|---|---|
| 0 var-or-const params (input is pure var-source only) — `ctrl` | ctrl(V1) | 1 (+producer) |
| 1 var-or-const param — `vol`, `distortion`, `osc_noise`, `onepole_flt`(gain raw) | `vol(V1, gain c\|V)` | 2: gain const; gain var |
| 2 params — `osc_saw/tri/sine`, `add`, `mul`, `reverb`, `sh`, `dly_cyc` | the saw example | 3–4: (c,c),(c,V),(V,c),(V,V) |
| 3 params — `osc_pulse`, `enva`, `cmb_flt_n`, `sv_flt_n` | freq/val/gain ± width | ~5: all-const, each-one-var, all-var |
| 4 params — `envd` | — | ~5: all-const, a few single-var, all-var |

≈ 22 ops × ~3.3 avg ≈ **~75 measurement instruments**.

### Bespoke ops (expression length depends on params) — small targeted sets
- **clone (17):** forward vs reverse (`gainVal` 0 vs ≠0) × transpose literal-vs-V1 × offset {0, large} ≈ **6 instruments** (each with a source at instrument 0).
- **adsr (23):** emitted operands are precomputed from sampleLength + rates, so size tracks operand magnitude — sweep attack/decay/sustain/release/gain/width across {small, large} ≈ **6 instruments**, plus 2 sampleLengths.
- **chordgen (18):** note selectors present/absent + shift literal/var ≈ **4 instruments** (with a source).
- **imported (20):** 2 instruments (different import index), folded with imports below.
- ≈ **~18 instruments**.

### Structural / split checks — a handful
- **Once-per-type:** scaffold already proves routines link once; one explicit two-same-op vs two-different-op pair confirms it. (~2)
- **Imports:** vary import count {0,1,8} and per-import bytes {256, 32768} → import-handling fixed cost + per-byte exe contribution (delta-packed `Isamp.raw`, ~1:1 uncompressed). (~5)
- **Sample length is exe-neutral:** same ops, `sampleLength ∈ {4, 4096, 131070}` → confirm uncompressed exe size constant (samples are runtime-generated, not stored). This *proves* the chip-vs-exe split the estimator relies on. (~3)
- ≈ **~10 instruments**.

### Total
≈ **~105 measurement instruments + scaffold + a couple of producer-calibration instruments**. Packed ~31 instruments/patch that's **~4 patches** for the bulk; with the `K`-vs-`K+T` diff method the compile count is ~1 + (instruments measured). Either way it is **~100 compiles, automated, minutes of wall-clock** — and far closer to your "3–4 instruments per op" than the earlier 520.

> Optimization (optional): instead of one `K+T` diff per instrument, pack many distinct test instruments into a few patches and solve a small linear system for all `S[op,mode]` at once — fewer compiles, slightly more fitter logic. Default to the simpler per-instrument diff; switch if compile time ever matters.

## Compression (Shrinkler)

Record **both** sizes per compile (`a.mingw.exe` uncompressed, `exemusic.exe` shrinkled). All the subtraction above is on **uncompressed** size (near-additive, clean). Shrinkler is modeled on top as a ratio with reported variance (optionally split code vs import/sample), since repetition/compression isn't additive. The live estimator = uncompressed model × compression model, with stated ±.

## Generation & constraints

A generator (`sizelab/corpus/`) emits patches as in-memory `Patch` objects (reusing `emptyPatch`/`emptySlot` builders), feeds each through the exporter + compile harness, and records one CSV row per measurement: `{ id, op, paramModes, producersUsed, sampleLength, importBytes, uncompressedBytes, shrinkledBytes, opTypesPresent }`. Constraints from the codegen:
- Instrument emits only if `sampleLength > 2`; var-input ops need their producer phase **earlier in the same instrument**; clone/chordgen need a **source instrument at a lower index** (placed at instrument 0); `outVar != 0` and `fn != 22` for every measured phase; ≤16 slots/instrument.

## How it feeds the fitter (sub-project 4)

1. `P_sin` from the producer instrument; additivity checked.
2. `S[op, mode]` for each op/mode by subtraction (`instrumentStream − k·P_sin`); per-param deltas from mode differences.
3. `R[op]` and `B` from the minimal routine-isolation diffs.
4. Bespoke ops → small parameterized size functions from their sets.
5. Import/sample terms from the split checks.
6. Compression model from the (uncompressed, shrinkled) pairs.
7. Residual report (re-predict every corpus instrument) → `calibration-data.ts` `fit{}` + UI ±.

`calibration-data.ts` gains a per-op `{ routine, stream: Record<modeKey, number> }` shape plus bespoke coefficients; the chip-ram/exe-size/breakdown consumers update to read it (sub-project 4).

## Relationship to P01–P07 and the estimator

- **P01–P07** stay as the exporter byte-exact verification gate (sub-project 1); untouched.
- The corpus is calibration-only, never shipped, never imported by `src/` (lives in `sizelab/corpus/`).
- The live estimator keeps its fast linear form; calibration swaps seeded constants for fitted ones and upgrades `opCost` to the per-mode table.

## Out of scope
- The wine64 harness (sub-project 2) and the fitter (sub-project 4) — only the CSV contract is fixed here.
- Atari `.prg` / raw `.bin`.
- Literal **value-bucket** effects (moveq vs move.w): dropped from the default corpus; add a tiny probe only if residuals later implicate value-dependence.

## Open questions for review
1. **Producer choice** — standard `osc_sine` (your suggestion) as the single producer, or also calibrate a second producer type to check the subtraction is producer-independent? (One extra ~4 instruments.)
2. **Interaction coverage** — per-param deltas + one all-variable instrument per op (current plan), or skip the all-variable check for 1–2 param ops to shave further?
3. **Scaffold vs pack-and-solve** — simple `K`-vs-`K+T` per-instrument diffs (more compiles, trivial fitter) or packed linear system (fewer compiles, more fitter logic)?
