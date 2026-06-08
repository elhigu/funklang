// Types for the size-estimator calibration table (TARGET: .bin code size).
// Kept separate from the data so the offline fitter (sizelab/fit) can
// regenerate calibration-data.ts without touching these definitions.
//
// The .bin (relocatable sample-generation blob) is strongly SUB-ADDITIVE under
// whole-program LTO + --gc-sections, so a per-op additive sum over-predicts
// real patches badly. The HEADLINE therefore uses an aggregate model fit on
// real patches; per-op `opCost` is kept only as a RELATIVE "which op is heavy"
// weight and is NOT summed into the headline.

export interface FitQuality {
  /** Mean absolute residual (bytes) of the aggregate model over real patches. */
  meanErr: number;
  /** Max absolute residual (bytes) over real patches. */
  maxErr: number;
  /** Mean residual as a percent of average real-patch size. */
  meanPct: number;
}

export interface CalibrationData {
  // ── Aggregate headline model (approximate, ~±20%):
  //    codeBytes = max(floor, base + perDistinctOp·distinctOpTypes + perSlot·nSlots)
  base: number;
  perDistinctOp: number;
  perSlot: number;
  /** Lower bound (empty-patch .bin floor). */
  floor: number;

  /** RELATIVE per-op weight (which op pulls more code). NOT summed into codeBytes. */
  opCost: Record<number, number>;

  /** Chip bytes of the resident mod template (chip-RAM term, not code). */
  modLengthEmpty: number;

  /** False while seeded; the fitter sets it true and fills `fit`. */
  fitted: boolean;
  fit: FitQuality;
}
