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

// Flat seed: every op assumed to pull the same code until measured.
const SEED_OP_COST = 256;
const seedOpCost: Record<number, number> = {};
for (const def of OP_DEFS) seedOpCost[def.code] = SEED_OP_COST;

export const CALIBRATION: CalibrationData = {
  base: 3000,
  slotStreamCost: 64,
  opCost: seedOpCost,
  modLengthEmpty: 1084, // standard MOD header; remeasure during calibration
  shrink: { base: 1000, codeRatio: 0.45, impRatio: 0.55 },
  fitted: false,
  fit: { meanErrUncompressed: 0, maxErrUncompressed: 0, meanErrShrinkled: 0, maxErrShrinkled: 0 },
};
