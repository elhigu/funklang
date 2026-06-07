# Calibration corpus

Generated patches compiled through the real toolchain (`compilePatch`) to
measure per-op / per-mode exe-size contributions. Regenerate with
`npm run corpus:run` (needs wineWow; writes `measurements.csv`).

- `producer.ts`, `modes.ts`, `op-instruments.ts`, `corpus-spec.ts` — pure patch generators.
- `measurements-csv.ts` — CSV (de)serialization.
- `run-corpus.ts` — compiles every corpus item, writes `measurements.csv`.
- `measurements.csv` — committed dataset (deterministic; lets the fitter run without wine).

## Dataset notes (run 2026-06-07)

**65 / 70 items compiled.** Confirmed signals:
- **Sample length is exe-neutral** (`samplelen_*`: 13196/13176/13176) — generated samples are computed at runtime, not stored. Validates the chip-vs-exe split.
- **Imported bytes add ~1:1 to the uncompressed exe** (`imports_*`: +3840 for +3840, +28672 for +28672).
- Base (player + ptplayer + framework) ≈ 13 kB; per-op routine and per-phase costs are the hundreds-/tens-of-bytes deltas on top.

**5 items failed to link** — `op7_Vc`, `op7_VV` (enva), `op8_Vcc`, `op8_VVV` (envd),
`op16_V` (distortion), all *variable-mode*. Cause: with a runtime (non-constant)
attack/decay/gain, these ops emit a 32-bit integer multiply, which on 68000
calls libgcc's `__mulsi3`. The stock `exe_creator/Makefile-executable` links
`-nostdlib` and has the `gcc8_a_support.o` (asm support routines incl. `__mulsi3`)
line **commented out**, so the link fails. With a constant param gcc folds the
multiply away, so the const modes compile. This is a property of the stock
toolchain config, not the exporter — our generated C matches what the GUI emits.

Consequence for the fitter (sub-project 4): no measured per-mode delta exists for
those three ops' variable rate/gain; fall back to their constant-mode cost (the
modes are also unbuildable in the stock config, so estimating them as ≈const is
the honest choice). If those modes ever matter, link `gcc8_a_support.o` and
re-run the corpus.
