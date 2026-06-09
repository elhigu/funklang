// src/sizecalc/breakdown.ts
//
// Attribution for the size readout. The HEADLINE (code-size.ts) is an aggregate
// model whose components (floor / distinct-ops / slots / variable-operands) sum
// to the estimate. Per-op / per-instrument / per-slot figures here are RELATIVE
// WEIGHTS (isolated single-op cost, cal.opWeight) used to rank "which op pulls
// more code" — they do NOT sum to the headline (the .bin is sub-additive).
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
  /** Relative code weight of this op (cal.opWeight) — NOT a byte contribution. */
  weight: number;
}

export interface InstrumentBreakdown {
  instrIdx: number;
  /** Generated-sample chip bytes for this instrument (sampleLength). */
  sampleBytes: number;
  /** Σ of its slots' relative op weights — ranks instruments, not a byte total. */
  weight: number;
  slots: SlotCost[];
}

export interface PatchBreakdown {
  code: CodeSizeEstimate;
  chip: ChipUsage;
  perInstrument: InstrumentBreakdown[];
  /** Distinct ops present, with their relative weight (heaviest first). */
  opTypesUsed: Array<{ fn: number; name: string; weight: number }>;
}

export function computeBreakdown(patch: Patch, cal: CalibrationData): PatchBreakdown {
  const seen = new Set<number>();
  const perInstrument: InstrumentBreakdown[] = [];

  for (let instrIdx = 0; instrIdx < patch.instruments.length; instrIdx++) {
    const ins = patch.instruments[instrIdx]!;
    const slots: SlotCost[] = [];
    let weight = 0;
    for (let slotIdx = 0; slotIdx < ins.slots.length; slotIdx++) {
      const s = ins.slots[slotIdx]!;
      if (s.fn === 0) continue;
      const firstUse = !seen.has(s.fn);
      if (firstUse) seen.add(s.fn);
      const w = (cal.opRoutine[s.fn] ?? 0) + (cal.opConnection[s.fn] ?? 0);
      weight += w;
      slots.push({
        slotIdx,
        fn: s.fn,
        opName: opByCode(s.fn)?.name ?? `op${s.fn}`,
        firstUse,
        varOperands: slotVarOperands(s),
        weight: w,
      });
    }
    perInstrument.push({
      instrIdx,
      sampleBytes: Math.max(0, ins.sampleLength | 0),
      weight,
      slots,
    });
  }

  const code = estimateCodeSize(patch, cal);
  const opTypesUsed = code.distinctOps
    .map((fn) => ({ fn, name: opByCode(fn)?.name ?? `op${fn}`, weight: (cal.opRoutine[fn] ?? 0) + (cal.opConnection[fn] ?? 0) }))
    .sort((a, b) => b.weight - a.weight);

  return { code, chip: chipUsage(patch, cal.modLengthEmpty), perInstrument, opTypesUsed };
}
