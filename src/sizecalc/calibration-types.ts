// Types for the size-estimator calibration table (TARGET: .bin code size).
// Kept separate from the data so the offline fitter (sizelab/fit) can
// regenerate calibration-data.ts without touching these definitions.
//
// Model: an ADDITIVE per-op estimate of the relocatable .bin generation code,
// fit (unweighted) against synthetic single-op patches AND real multi-instrument
// patches. The .bin is somewhat sub-additive (whole-program LTO shares code), so
// the fitted per-op routine costs are "effective" values that already absorb
// typical sharing — they are NOT isolated-in-a-vacuum costs. ~10% mean error on
// real patches.
//
//   codeBytes = max(floor,
//                   base
//                 + Σ_distinct opRoutine[op]        // routine, paid once per op type
//                 + perSlot · nSlots                 // every op slot
//                 + perVarOperand · nVarOperands)    // each variable (non-const) operand
//
// Per-op / per-slot figures in the breakdown are real bytes from this same model
// and SUM to the headline (coherent).

export interface FitQuality {
  /** Mean absolute residual (bytes) over real patches. */
  meanErr: number;
  /** Max absolute residual (bytes) over real patches. */
  maxErr: number;
  /** Mean residual as a percent of average real-patch size. */
  meanPct: number;
}

export interface CalibrationData {
  /** Framework floor present in every .bin. */
  base: number;
  /** Effective code per op slot (fn !== 0). */
  perSlot: number;
  /** Effective code per variable (non-const) operand — the mode sensitivity. */
  perVarOperand: number;
  /** Lower bound (empty/smallest .bin). */
  floor: number;
  /** Effective per-op-type routine cost (paid once per distinct op present). */
  opRoutine: Record<number, number>;

  /** Chip bytes of the resident mod template (chip-RAM term, not code). */
  modLengthEmpty: number;

  /** False while seeded; the fitter sets it true and fills `fit`. */
  fitted: boolean;
  fit: FitQuality;
}
