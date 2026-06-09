// Types for the size-estimator calibration table (TARGET: .bin code size).
// Kept separate from the data so the offline fitter (sizelab/fit) can regenerate
// calibration-data.ts without touching these definitions.
//
// MODEL (base-anchored, concave in slots):
//   codeBytes = floor + perDistinctOp·distinctOps
//                     + perSlotPow·nSlots^slotPower
//                     + perVarOperand·nVarOperands
//
// .bin size is dominated by slot count but SUB-LINEAR (per-slot code folds as the
// patch grows under whole-program LTO), hence the nSlots^slotPower term. Per-op
// `opWeight` is a RELATIVE "which op is heavy" weight for the breakdown only — it
// is NOT summed into the headline (summing per-op costs over-predicts badly).

export interface FitQuality {
  /** Mean absolute leave-one-out residual (bytes) over real patches. */
  meanErr: number;
  /** Max absolute LOO residual (bytes). */
  maxErr: number;
  /** Mean LOO residual as a percent of patch size. */
  meanPct: number;
}

export interface CalibrationData {
  /** Empty-patch .bin floor; every estimate starts here. */
  floor: number;
  /** Code per distinct op type present. */
  perDistinctOp: number;
  /** Coefficient on nSlots^slotPower (concave slot growth). */
  perSlotPow: number;
  /** Exponent applied to nSlots (≈0.8). */
  slotPower: number;
  /** Code per variable (non-const) operand. */
  perVarOperand: number;

  /**
   * Per-op SHARED routine cost (code added once, the first time the op appears).
   * Measured from probes; drives context-aware add/remove marginals, NOT the total.
   */
  opRoutine: Record<number, number>;
  /** Per-op CONNECTION cost (each additional use of an already-present op). */
  opConnection: Record<number, number>;

  /** Chip bytes of the resident mod template (chip-RAM term, not code). */
  modLengthEmpty: number;

  fitted: boolean;
  fit: FitQuality;
}
