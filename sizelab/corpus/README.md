# Calibration corpus

Generated patches compiled through the real toolchain (`compilePatch` /
`compilePatchBinary`) to calibrate the size estimator. **Target = the .bin code
blob** you embed in a demo (the exe columns are kept for reference only).
Regenerate with `npm run corpus:run` (needs wineWow; writes `measurements.csv`).

- `producer.ts`, `modes.ts`, `op-instruments.ts`, `corpus-spec.ts` — pure patch generators.
- `measurements-csv.ts` — CSV (de)serialization (`binBytes` is the .bin size column).
- `run-corpus.ts` — compiles every synthetic corpus item (exe + .bin), writes `measurements.csv`.
- `measure-real.ts` — appends `real:*` rows: real `../../../patches/*.akp` compiled to .bin,
  so the fit is anchored on real multi-instrument structure, not just single-op synthetics.
- `measurements.csv` — committed dataset (deterministic; lets the fitter run without wine).

## Model: additive per-op (fit UNWEIGHTED)

`../fit/fit-calibration.ts` fits, on synthetic + real `.bin` sizes:

```
binBytes ≈ base + Σ_distinct opRoutine[op] + perSlot·nSlots + perVarOperand·nVarOperands
```

≈ **10% mean** on real patches (max ~4 kB), and *coherent* — the breakdown's
per-op / per-slot figures are real bytes that sum to the headline. For the exact
number, export the patch from the original AmigaKlang.

**Fit unweighted — this is the whole trick.** An earlier version weighted the
real patches ×8, which drove the base negative and inflated per-op costs, making
the additive model look hopeless (≈60% over) and forcing a fallback aggregate
model (`base + perDistinctOp·distinctOps + perSlot·slots`, ≈18%). Fit *unweighted*,
the per-op routine costs settle to "effective" values that absorb the `.bin`'s
mild sub-additivity (whole-program LTO + `--gc-sections` share helper code), and
the additive model both wins on accuracy and stays coherent.

Operand mode matters a lot per op (bin over each op's all-const baseline): a
variable `enva` attack adds ~676 B, a variable `osc_saw` freq ~164 B — captured
by `perVarOperand` and visible per-slot in the breakdown. Real-patch operand
modes are recomputed from the `.akp` files at fit time.

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
