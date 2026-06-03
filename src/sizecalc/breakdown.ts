// src/sizecalc/breakdown.ts
//
// Full attribution for the size readout: patch totals, per-instrument
// figures, per-slot MARGINAL cost (op code counted once at its first
// patch-wide use), and the op-types-used list.
import type { Patch } from '../patch/types';
import type { CalibrationData } from './calibration-data';
import { chipUsage, type ChipUsage } from './chip-ram';
import { estimateExeSize, type ExeSizeEstimate } from './exe-size';
import { opByCode } from '../schema/op-metadata';

export interface SlotCost {
  slotIdx: number;
  fn: number;
  opName: string;
  /** True iff this is the first patch-wide slot using `fn`. */
  firstUse: boolean;
  /** Op-routine code bytes (only on firstUse, else 0). */
  codeBytes: number;
  /** Op-stream bytes for this slot. */
  streamBytes: number;
  /** codeBytes + streamBytes. */
  marginalUncompressed: number;
}

export interface InstrumentBreakdown {
  instrIdx: number;
  /** Generated-sample chip bytes for this instrument (sampleLength). */
  sampleBytes: number;
  /** Σ marginalUncompressed of its op slots. */
  uncompressed: number;
  /** uncompressed * codeRatio. */
  shrinkled: number;
  slots: SlotCost[];
}

export interface PatchBreakdown {
  exe: ExeSizeEstimate;
  chip: ChipUsage;
  perInstrument: InstrumentBreakdown[];
  opTypesUsed: Array<{ fn: number; name: string; codeBytes: number }>;
}

export function computeBreakdown(patch: Patch, cal: CalibrationData): PatchBreakdown {
  const seen = new Set<number>();
  const perInstrument: InstrumentBreakdown[] = [];

  for (let instrIdx = 0; instrIdx < patch.instruments.length; instrIdx++) {
    const ins = patch.instruments[instrIdx]!;
    const slots: SlotCost[] = [];
    let uncompressed = 0;
    for (let slotIdx = 0; slotIdx < ins.slots.length; slotIdx++) {
      const s = ins.slots[slotIdx]!;
      if (s.fn === 0) continue;
      const firstUse = !seen.has(s.fn);
      if (firstUse) seen.add(s.fn);
      const codeBytes = firstUse ? (cal.opCost[s.fn] ?? 0) : 0;
      const streamBytes = cal.slotStreamCost;
      const marginalUncompressed = codeBytes + streamBytes;
      uncompressed += marginalUncompressed;
      slots.push({
        slotIdx,
        fn: s.fn,
        opName: opByCode(s.fn)?.name ?? `op${s.fn}`,
        firstUse,
        codeBytes,
        streamBytes,
        marginalUncompressed,
      });
    }
    perInstrument.push({
      instrIdx,
      sampleBytes: Math.max(0, ins.sampleLength | 0),
      uncompressed,
      shrinkled: uncompressed * cal.shrink.codeRatio,
      slots,
    });
  }

  const exe = estimateExeSize(patch, cal);
  const opTypesUsed = exe.distinctOps.map((fn) => ({
    fn,
    name: opByCode(fn)?.name ?? `op${fn}`,
    codeBytes: cal.opCost[fn] ?? 0,
  }));

  return { exe, chip: chipUsage(patch, cal.modLengthEmpty), perInstrument, opTypesUsed };
}
