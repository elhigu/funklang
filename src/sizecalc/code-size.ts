// Estimate of a patch's sample-generation CODE size — the relocatable Amiga .bin
// blob you embed in a demo (NOT the standalone exe).
//
// Base-anchored, concave-in-slots model (see calibration-types.ts), calibrated on
// designed combination patches + 32 real patches and validated leave-one-out:
//
//   codeBytes = floor + perDistinctOp·distinctOps
//                     + perSlotPow·nSlots^slotPower      (per-slot code folds as the patch grows)
//                     + perVarOperand·nVarOperands
//
// Imported-sample bytes are added on top exactly (totalBytes) — the .bin doesn't
// embed them, but they must still be stored on disk and supplied to the host.
import type { Patch, Slot } from '../patch/types';
import { opByCode } from '../schema/op-metadata';
import type { CalibrationData } from './calibration-data';

/** Number of variable (non-const) var-or-const operands set on an op slot. */
export function slotVarOperands(s: Slot): number {
  const def = opByCode(s.fn);
  if (!def) return 0;
  let n = 0;
  for (const p of def.params) {
    if (p.type.kind === 'var-or-const' && p.selector && (s[p.selector] as number) !== 0) n++;
  }
  return n;
}

export interface CodeSizeEstimate {
  /** Estimated uncompressed .bin generation-code bytes. */
  codeBytes: number;
  /** Exact raw imported-sample bytes (stored on disk, supplied to host at ImpAdr). */
  importBytes: number;
  /** codeBytes + importBytes — the patch's full on-disk footprint (headline). */
  totalBytes: number;
  // Components (sum to codeBytes):
  floor: number;
  /** perDistinctOp · number of distinct op types. */
  distinctOpBytes: number;
  /** perSlotPow · nSlots^slotPower. */
  slotBytes: number;
  /** perVarOperand · nVarOperands. */
  varOperandBytes: number;
  /** Sorted distinct op codes present. */
  distinctOps: number[];
  nSlots: number;
  nVarOperands: number;
}

export function estimateCodeSize(patch: Patch, cal: CalibrationData): CodeSizeEstimate {
  const distinct = new Set<number>();
  let nSlots = 0;
  let nVarOperands = 0;
  for (const ins of patch.instruments) {
    for (const s of ins.slots) {
      if (s.fn === 0) continue;
      distinct.add(s.fn);
      nSlots++;
      nVarOperands += slotVarOperands(s);
    }
  }

  const distinctOpBytes = cal.perDistinctOp * distinct.size;
  const slotBytes = nSlots > 0 ? Math.round(cal.perSlotPow * Math.pow(nSlots, cal.slotPower)) : 0;
  const varOperandBytes = cal.perVarOperand * nVarOperands;
  const codeBytes = Math.round(cal.floor + distinctOpBytes + slotBytes + varOperandBytes);

  let importBytes = 0;
  for (const s of patch.importedSamples) importBytes += s.data.length;

  return {
    codeBytes,
    importBytes,
    totalBytes: codeBytes + importBytes,
    floor: cal.floor,
    distinctOpBytes,
    slotBytes,
    varOperandBytes,
    distinctOps: [...distinct].sort((a, b) => a - b),
    nSlots,
    nVarOperands,
  };
}
