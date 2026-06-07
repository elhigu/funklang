// Types for the size-estimator calibration table. Kept separate from the data
// so the offline fitter (sizelab/fit) can regenerate calibration-data.ts
// without touching these definitions.

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
