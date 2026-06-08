// Estimate of a patch's sample-generation CODE size — the relocatable Amiga .bin
// blob you embed in a demo (NOT the standalone exe).
//
// ADDITIVE per-op model (see calibration-types.ts), fit on synthetic + real
// patches, ~10% mean error and coherent (the breakdown's per-op / per-slot
// figures sum to this headline):
//
//   codeBytes = max(floor, base + Σ_distinct opRoutine[op]
//                              + perSlot·nSlots + perVarOperand·nVarOperands)
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
  /** Estimated uncompressed .bin generation-code bytes (~±10–15%). */
  codeBytes: number;
  /** Exact raw imported-sample bytes (stored on disk, supplied to host at ImpAdr). */
  importBytes: number;
  /** codeBytes + importBytes — the patch's full on-disk footprint (headline). */
  totalBytes: number;
  // Code components (sum to codeBytes, pre-floor):
  base: number;
  /** Σ opRoutine[op] over distinct op types. */
  routineBytes: number;
  /** perSlot · nSlots. */
  slotBytes: number;
  /** perVarOperand · nVarOperands. */
  varOperandBytes: number;
  floored: boolean;
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

  let routineBytes = 0;
  for (const fn of distinct) routineBytes += cal.opRoutine[fn] ?? 0;
  const slotBytes = cal.perSlot * nSlots;
  const varOperandBytes = cal.perVarOperand * nVarOperands;
  const raw = cal.base + routineBytes + slotBytes + varOperandBytes;
  const codeBytes = Math.max(cal.floor, raw);

  let importBytes = 0;
  for (const s of patch.importedSamples) importBytes += s.data.length;

  return {
    codeBytes,
    importBytes,
    totalBytes: codeBytes + importBytes,
    base: cal.base,
    routineBytes,
    slotBytes,
    varOperandBytes,
    floored: codeBytes > raw,
    distinctOps: [...distinct].sort((a, b) => a - b),
    nSlots,
    nVarOperands,
  };
}
