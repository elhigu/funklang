import { describe, it, expect } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import type { CalibrationData } from '../../src/sizecalc/calibration-data';
import { computeBreakdown } from '../../src/sizecalc/breakdown';

const CAL: CalibrationData = {
  base: 1000, perDistinctOp: 100, perSlot: 10, floor: 200,
  opCost: { 2: 200, 4: 300 },
  modLengthEmpty: 1084,
  fitted: true,
  fit: { meanErr: 0, maxErr: 0, meanPct: 0 },
};

describe('computeBreakdown', () => {
  it('flags first patch-wide use of an op; relative weight is per-op (not zeroed on reuse)', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1 }]; // saw (first use)
    p.instruments[1]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1 }]; // saw (reuse)
    const b = computeBreakdown(p, CAL);

    const i0 = b.perInstrument[0]!;
    const i1 = b.perInstrument[1]!;
    expect(i0.slots[0]!.firstUse).toBe(true);
    expect(i0.slots[0]!.weight).toBe(200);
    expect(i1.slots[0]!.firstUse).toBe(false);
    expect(i1.slots[0]!.weight).toBe(200); // weight is the op's relative cost, both slots
  });

  it('reports op-types-used (heaviest first) with names and per-instrument weight', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [
      { ...emptySlot(), fn: 2, outVar: 1 },
      { ...emptySlot(), fn: 4, outVar: 1 },
    ];
    const b = computeBreakdown(p, CAL);
    expect(b.opTypesUsed.map((o) => o.fn)).toEqual([4, 2]); // sorted by weight desc
    expect(b.opTypesUsed.find((o) => o.fn === 2)!.name).toBe('osc_saw');
    // instr0 relative weight = Σ op weights = 200 + 300 = 500
    expect(b.perInstrument[0]!.weight).toBe(500);
  });

  it('headline = aggregate; embeds chip total it was built from', () => {
    const p = emptyPatch();
    p.instruments[0]!.sampleLength = 2048;
    const b = computeBreakdown(p, CAL);
    expect(b.chip.residentTotal).toBe(1084 + 2048);
    // no op slots → base 1000 (> floor 200), no distinct/slot terms
    expect(b.code.codeBytes).toBe(1000);
  });

  it('headline scales with distinct op types and slot count', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [
      { ...emptySlot(), fn: 2, outVar: 1 },
      { ...emptySlot(), fn: 4, outVar: 1 },
    ];
    const b = computeBreakdown(p, CAL);
    // base 1000 + 2 distinct·100 + 2 slots·10 = 1220
    expect(b.code.codeBytes).toBe(1220);
  });
});
