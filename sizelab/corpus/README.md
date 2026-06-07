# Calibration corpus

Generated patches compiled through the real toolchain (`compilePatch`) to
measure per-op / per-mode exe-size contributions. Regenerate with
`npm run corpus:run` (needs wineWow; writes `measurements.csv`).

- `producer.ts`, `modes.ts`, `op-instruments.ts`, `corpus-spec.ts` — pure patch generators.
- `measurements-csv.ts` — CSV (de)serialization.
- `run-corpus.ts` — compiles every corpus item, writes `measurements.csv`.
- `measurements.csv` — committed dataset (deterministic; lets the fitter run without wine).

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
