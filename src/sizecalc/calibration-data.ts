//
// Fitted-constant table for the size estimator. SEED VALUES ONLY until
// `npm run calibrate-exe-size` measures the real corpus and rewrites this
// file. While `fitted === false` the UI marks figures as rough.
//
// Units: bytes. `*Ratio` are compressed/uncompressed fractions for Shrinkler.
import { OP_DEFS } from '../schema/op-metadata';

export interface ShrinkModel {
  /** Fixed shrinklered overhead present in every build. */
  base: number;
  /** Compressed-bytes-per-uncompressed-byte for code+stream. */
  codeRatio: number;
  /** Compressed-bytes-per-uncompressed-byte for baked-in imported samples. */
  impRatio: number;
}

export interface FitQuality {
  meanErrUncompressed: number;
  maxErrUncompressed: number;
  meanErrShrinkled: number;
  maxErrShrinkled: number;
}

export interface CalibrationData {
  /** Uncompressed intercept: player code, framework, always-linked routines. */
  base: number;
  /** Uncompressed op-stream bytes added per slot that has an op. */
  slotStreamCost: number;
  /** Uncompressed code bytes pulled in by the FIRST use of each op code. */
  opCost: Record<number, number>;
  /** Chip bytes of the empty ProTracker module template (memcpy'd at runtime). */
  modLengthEmpty: number;
  shrink: ShrinkModel;
  /** False while seeded; the calibration tool sets it true and fills `fit`. */
  fitted: boolean;
  /** Residual error of the model vs the corpus (zeros while unfitted). */
  fit: FitQuality;
}

// Rough per-op uncompressed m68k code-size seeds (bytes), ordered by the
// complexity of each routine in exe_creator/synthnodes.h. STILL GUESSES — only
// `npm run calibrate-exe-size` measures the truth — but the RELATIVE ordering is
// grounded in the C source, so the per-slot "which op is expensive" signal is
// meaningful even while unfitted. Two known biases the fit will remove:
//   - Shared helpers (vol/clamp/mulsw/abs) are folded into every op that uses
//     them, so multi-op totals over-count (LTO emits each helper once).
//   - loop_gen is linked unconditionally from GenerateSamples, so its MARGINAL
//     op cost is ~0 — its code lives in `base`, not here.
const OP_CODE_SEED: Record<number, number> = {
  1: 48,    // vol         — one mulsw + shift
  2: 64,    // osc_saw     — counter += freq, vol
  3: 80,    // osc_tri     — counter, wrap branch, vol
  4: 128,   // osc_sine    — mulsw + abs + shifts + vol
  5: 80,    // osc_pulse   — counter, duty compare, vol
  6: 80,    // osc_noise   — 3-word LFSR + vol
  7: 112,   // enva        — decay table, mul, clamp, vol
  8: 120,   // envd        — decay table, sub, clamp, vol
  9: 32,    // add         — clamp(a + b)
  10: 32,   // mul         — mulsw + shift
  11: 112,  // dly_cyc     — ring-buffer index + vol
  12: 160,  // cmb_flt_n   — ring buffer + feedback add + vol
  13: 320,  // reverb      — 8× cmb_flt_n combs + sum
  14: 32,   // ctrl        — shift + bias
  15: 320,  // sv_flt_n    — 3-state filter + 4-mode switch
  16: 128,  // distortion  — clamp, mulsw, abs, shifts
  17: 48,   // clone       — copy from source sample (mostly driver code)
  18: 560,  // chordgen    — 12 conditional pitch taps, the biggest op
  19: 96,   // sample_hold — counter + hold + mulsw
  20: 64,   // imported    — read imported sample byte
  21: 140,  // onepole_flt — pole filter + 2-mode switch
  22: 0,    // loop_gen    — always linked from GenerateSamples → part of base
  23: 200,  // adsr        — 4-state envelope machine
  24: 128,  // vocoder     — no C reference in synthnodes.h; neutral seed
};

// Guarantee every known op code has a seed; fall back to a mid estimate for any
// code not enumerated above (keeps the table valid if op-metadata gains codes).
const seedOpCost: Record<number, number> = {};
for (const def of OP_DEFS) seedOpCost[def.code] = OP_CODE_SEED[def.code] ?? 128;

export const CALIBRATION: CalibrationData = {
  base: 3000,
  slotStreamCost: 64,
  opCost: seedOpCost,
  modLengthEmpty: 1084, // standard MOD header; remeasure during calibration
  shrink: { base: 1000, codeRatio: 0.45, impRatio: 0.55 },
  fitted: false,
  fit: { meanErrUncompressed: 0, maxErrUncompressed: 0, meanErrShrinkled: 0, maxErrShrinkled: 0 },
};
