# Calibration corpus

Generated patches compiled through the real toolchain (`compilePatch` /
`compilePatchBinary`) to calibrate the size estimator. **Target = the .bin code
blob** you embed in a demo (the exe columns are kept for reference only).
Regenerate with `npm run corpus:run` (needs wineWow; writes `measurements.csv`).

- `producer.ts`, `modes.ts`, `op-instruments.ts`, `corpus-spec.ts` — single-op / per-mode generators.
- `gen-combos.ts` — **designed combination** patches: varied op subsets + repetition counts, written
  as real `.akp` into `generated/`. These break the collinearity of real patches so per-op costs are identifiable.
- `gen-large.ts` — large designed patches (60–210 slots) for the big-patch regime.
- `rand-args.ts` — randomizes each slot's constant args. CRITICAL: identical args let LTO fold repeated
  calls into loops (a 190-slot patch → ~1.6 kB instead of ~16 kB); real patches never fold like that.
- `measure-real.ts` — compiles the real validation patches (`../../../patches/*.akp` curated fixtures +
  `real/*.akp` gathered set) → `real:*` rows.
- `measurements-csv.ts` — CSV (de)serialization (`binBytes` is the .bin size column).
- `measurements.csv` — committed dataset (lets the fitter run without wine).

## Model: base-anchored, concave in slots

`../fit/fit-calibration.ts` fits (relative-%-weighted) on designed combos + real patches:

```
codeBytes = floor + perDistinctOp·distinctOps + perSlotPow·nSlots^slotPower + perVarOperand·nVarOperands
```

**Leave-one-out ≈ 20% mean** over the 32 real patches; the empty `.bin` floor is exact and
real intro patches land within ~10% (e.g. `testing-patch` −7%, was +106% under the old additive sum).
For the exact size, export from the original AmigaKlang.

Why this shape (learned against the real patches):
- **floor** = measured empty `.bin`; anchoring it keeps small patches honest.
- `.bin` size is dominated by slot count (corr 0.94) but **sub-linear**: per-slot code drops from ~150 B
  (small patches) to ~65 B (large) as whole-program LTO folds shared code — hence `nSlots^slotPower` (≈0.8), not linear.
- variable operands add real code (a variable `enva` attack costs far more than a constant one); distinct op types add routines.
- Fit is **relative-weighted** (`w=1/binBytes`) so a 300-byte patch counts as much, by percent, as a 19 kB one.

A non-negative per-op SUM does NOT work: it over-predicts dense patches badly (the in-sample "10%" of an
earlier additive model was overfit — out-of-sample / on `testing-patch` it was +96%). Per-op `opWeight`
(isolated single-op cost) is kept only as a relative "which op is heavy" hint in the breakdown.

## Dataset notes (run 2026-06-07)

**70 / 70 items compiled** (re-run after linking `gcc8_a_support`, see
`../TOOLCHAIN.md`). Confirmed signals:
- **Sample length is exe-neutral** (`samplelen_*`: 13616/13596/13596) — generated samples are computed at runtime, not stored. Validates the chip-vs-exe split.
- **Imported bytes add ~1:1 to the uncompressed exe** (`imports_*`).
- Base (player + ptplayer + framework + libgcc support) ≈ 13.6 kB; per-op routine and per-phase costs are the hundreds-/tens-of-bytes deltas on top.

The earlier run had **5 link failures** — `op7_Vc/VV` (enva), `op8_Vcc/VVV` (envd),
`op16_V` (distortion), all *variable-mode*: with a runtime attack/decay/gain those
ops emit a 32-bit integer multiply that calls libgcc's `__mulsi3`, which the stock
`-nostdlib` Makefiles didn't link (the `gcc8_a_support` line was commented out).
Linking it (in both `exe_creator` Makefiles, per `../TOOLCHAIN.md`) fixed all five
and added a fixed ~420-byte base bump — hence this re-measured dataset. (`clone`/op
17 has the same 32-bit multiply and is also covered now; it's measured in the
deferred bespoke-op pass.) See `../TOOLCHAIN.md` for the why and the m68k codegen.
