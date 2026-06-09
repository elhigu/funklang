import { describe, it, expect } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import type { CalibrationData } from '../../src/sizecalc/calibration-data';
import { computeBreakdown } from '../../src/sizecalc/breakdown';

const CAL: CalibrationData = {
  floor: 200, perDistinctOp: 100, perSlotPow: 50, slotPower: 0.8, perVarOperand: 50,
  opRoutine: { 2: 200, 4: 300 }, opConnection: { 2: 0, 4: 0 },
  modLengthEmpty: 1084,
  fitted: true,
  fit: { meanErr: 0, maxErr: 0, meanPct: 0 },
};

describe('computeBreakdown', () => {
  it('flags first patch-wide use; relative weight is per-op (not zeroed on reuse)', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1 }]; // saw (first use)
    p.instruments[1]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1 }]; // saw (reuse)
    const b = computeBreakdown(p, CAL);
    expect(b.perInstrument[0]!.slots[0]!.firstUse).toBe(true);
    expect(b.perInstrument[0]!.slots[0]!.weight).toBe(200);
    expect(b.perInstrument[1]!.slots[0]!.firstUse).toBe(false);
    expect(b.perInstrument[1]!.slots[0]!.weight).toBe(200); // op weight, both slots
  });

  it('records variable operands per slot', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1, freq: 3 }];
    const b = computeBreakdown(p, CAL);
    expect(b.perInstrument[0]!.slots[0]!.varOperands).toBe(1);
  });

  it('reports op-types-used (heaviest first) and per-instrument weight', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [
      { ...emptySlot(), fn: 2, outVar: 1 },
      { ...emptySlot(), fn: 4, outVar: 1 },
    ];
    const b = computeBreakdown(p, CAL);
    expect(b.opTypesUsed.map((o) => o.fn)).toEqual([4, 2]); // sorted by weight desc
    expect(b.opTypesUsed.find((o) => o.fn === 2)!.name).toBe('osc_saw');
    expect(b.perInstrument[0]!.weight).toBe(500); // 200 + 300
  });

  it('headline = aggregate code estimate; embeds chip total', () => {
    const p = emptyPatch();
    p.instruments[0]!.sampleLength = 2048;
    const b = computeBreakdown(p, CAL);
    expect(b.chip.residentTotal).toBe(1084 + 2048);
    expect(b.code.codeBytes).toBe(200); // empty → floor
  });
});
