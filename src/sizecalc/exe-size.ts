//
// Estimated uncompressed compiled exe size + estimated shrinklered size of a
// patch's sample-generation code. Op-routine code cost is counted ONCE per
// distinct op type used (LTO -fwhole-program dead-code elimination strips
// unused routines). See spec §"Why these numbers diverge".
import type { Patch } from '../patch/types';
import type { CalibrationData } from './calibration-data';

export interface ExeSizeEstimate {
  uncompressed: number;
  shrinkled: number;
  // Components (for the breakdown view):
  base: number;
  opCodeBytes: number;
  slotStreamBytes: number;
  importBytes: number;
  /** Sorted distinct op codes that contributed code cost. */
  distinctOps: number[];
}

export function estimateExeSize(patch: Patch, cal: CalibrationData): ExeSizeEstimate {
  const distinct = new Set<number>();
  let nOpSlots = 0;
  for (const ins of patch.instruments) {
    for (const s of ins.slots) {
      if (s.fn === 0) continue;
      distinct.add(s.fn);
      nOpSlots++;
    }
  }
  let opCodeBytes = 0;
  for (const fn of distinct) opCodeBytes += cal.opCost[fn] ?? 0;

  const slotStreamBytes = nOpSlots * cal.slotStreamCost;

  let importBytes = 0;
  for (const s of patch.importedSamples) importBytes += s.data.length;

  const uncompressed = cal.base + opCodeBytes + slotStreamBytes + importBytes;
  const shrinkled =
    cal.shrink.base +
    (cal.base + opCodeBytes + slotStreamBytes) * cal.shrink.codeRatio +
    importBytes * cal.shrink.impRatio;

  return {
    uncompressed,
    shrinkled,
    base: cal.base,
    opCodeBytes,
    slotStreamBytes,
    importBytes,
    distinctOps: [...distinct].sort((a, b) => a - b),
  };
}
