// src/sizecalc/breakdown.ts
//
// Full attribution for the size readout. With the additive per-op model these
// figures are real bytes that SUM to the headline (code-size.ts): each slot's
// MARGINAL cost = its op routine (only on the op's first patch-wide use) +
// per-slot + per-variable-operand. So reused ops read cheap, and slots with
// variable operands read costlier — the mode sensitivity the user asked for.
import type { Patch } from '../patch/types';
import type { CalibrationData } from './calibration-data';
import { chipUsage, type ChipUsage } from './chip-ram';
import { estimateCodeSize, slotVarOperands, type CodeSizeEstimate } from './code-size';
import { opByCode } from '../schema/op-metadata';

export interface SlotCost {
  slotIdx: number;
  fn: number;
  opName: string;
  /** True iff this is the first patch-wide slot using `fn`. */
  firstUse: boolean;
  /** Variable (non-const) operands on this slot. */
  varOperands: number;
  /** Op-routine bytes (only on firstUse, else 0). */
  routineBytes: number;
  /** This slot's marginal .bin contribution (routine + perSlot + var operands). */
  marginalBytes: number;
}

export interface InstrumentBreakdown {
  instrIdx: number;
  /** Generated-sample chip bytes for this instrument (sampleLength). */
  sampleBytes: number;
  /** Σ marginalBytes of its op slots — this instrument's .bin code contribution. */
  codeBytes: number;
  slots: SlotCost[];
}

export interface PatchBreakdown {
  code: CodeSizeEstimate;
  chip: ChipUsage;
  perInstrument: InstrumentBreakdown[];
  /** Distinct ops present, with their routine cost (heaviest first). */
  opTypesUsed: Array<{ fn: number; name: string; routineBytes: number }>;
}

export function computeBreakdown(patch: Patch, cal: CalibrationData): PatchBreakdown {
  const seen = new Set<number>();
  const perInstrument: InstrumentBreakdown[] = [];

  for (let instrIdx = 0; instrIdx < patch.instruments.length; instrIdx++) {
    const ins = patch.instruments[instrIdx]!;
    const slots: SlotCost[] = [];
    let codeBytes = 0;
    for (let slotIdx = 0; slotIdx < ins.slots.length; slotIdx++) {
      const s = ins.slots[slotIdx]!;
      if (s.fn === 0) continue;
      const firstUse = !seen.has(s.fn);
      if (firstUse) seen.add(s.fn);
      const varOperands = slotVarOperands(s);
      const routineBytes = firstUse ? (cal.opRoutine[s.fn] ?? 0) : 0;
      const marginalBytes = routineBytes + cal.perSlot + cal.perVarOperand * varOperands;
      codeBytes += marginalBytes;
      slots.push({
        slotIdx,
        fn: s.fn,
        opName: opByCode(s.fn)?.name ?? `op${s.fn}`,
        firstUse,
        varOperands,
        routineBytes,
        marginalBytes,
      });
    }
    perInstrument.push({
      instrIdx,
      sampleBytes: Math.max(0, ins.sampleLength | 0),
      codeBytes,
      slots,
    });
  }

  const code = estimateCodeSize(patch, cal);
  const opTypesUsed = code.distinctOps
    .map((fn) => ({ fn, name: opByCode(fn)?.name ?? `op${fn}`, routineBytes: cal.opRoutine[fn] ?? 0 }))
    .sort((a, b) => b.routineBytes - a.routineBytes);

  return { code, chip: chipUsage(patch, cal.modLengthEmpty), perInstrument, opTypesUsed };
}
