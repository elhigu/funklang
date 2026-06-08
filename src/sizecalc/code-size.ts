// Rough estimate of a patch's sample-generation CODE size — i.e. the relocatable
// Amiga .bin blob you embed in a demo (NOT the standalone exe).
//
// The .bin is strongly SUB-ADDITIVE: whole-program LTO + --gc-sections share
// helpers and collapse similar slots, so summing per-op costs over-predicts real
// patches by 60%+. The headline therefore uses an AGGREGATE model calibrated on
// real multi-instrument patches:
//
//   codeBytes = max(floor, base + perDistinctOp·distinctOpTypes + perSlot·nSlots)
//
// This is a ballpark (~±20%); per-op `opCost` is a separate RELATIVE weight used
// only to rank which op is heavy in the breakdown (see breakdown.ts), never
// summed here. Imported samples are NOT code (they live in chip-RAM at runtime).
import type { Patch } from '../patch/types';
import type { CalibrationData } from './calibration-data';

export interface CodeSizeEstimate {
  /** Rough estimated uncompressed .bin code bytes (aggregate model, ~±20%). */
  codeBytes: number;
  // Components (for the breakdown view) — these SUM to codeBytes (pre-floor):
  base: number;
  /** perDistinctOp · number of distinct op types. */
  distinctOpBytes: number;
  /** perSlot · number of op slots. */
  slotBytes: number;
  /** True if the floor clamp raised codeBytes above base+distinctOp+slot. */
  floored: boolean;
  /** Sorted distinct op codes present. */
  distinctOps: number[];
  /** Total op slots (fn !== 0) across the patch. */
  nSlots: number;
}

export function estimateCodeSize(patch: Patch, cal: CalibrationData): CodeSizeEstimate {
  const distinct = new Set<number>();
  let nSlots = 0;
  for (const ins of patch.instruments) {
    for (const s of ins.slots) {
      if (s.fn === 0) continue;
      distinct.add(s.fn);
      nSlots++;
    }
  }

  const distinctOpBytes = cal.perDistinctOp * distinct.size;
  const slotBytes = cal.perSlot * nSlots;
  const raw = cal.base + distinctOpBytes + slotBytes;
  const codeBytes = Math.max(cal.floor, raw);

  return {
    codeBytes,
    base: cal.base,
    distinctOpBytes,
    slotBytes,
    floored: codeBytes > raw,
    distinctOps: [...distinct].sort((a, b) => a - b),
    nSlots,
  };
}
