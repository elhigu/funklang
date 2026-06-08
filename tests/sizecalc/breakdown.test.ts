import { describe, it, expect } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import type { CalibrationData } from '../../src/sizecalc/calibration-data';
import { computeBreakdown } from '../../src/sizecalc/breakdown';

const CAL: CalibrationData = {
  base: 1000, perSlot: 10, perVarOperand: 50, floor: 200,
  opRoutine: { 2: 200, 4: 300 },
  modLengthEmpty: 1084,
  fitted: true,
  fit: { meanErr: 0, maxErr: 0, meanPct: 0 },
};

describe('computeBreakdown', () => {
  it('charges the op routine only on its first patch-wide use; marginals are coherent', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1 }]; // saw (first use)
    p.instruments[1]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1 }]; // saw (reuse)
    const b = computeBreakdown(p, CAL);

    const i0 = b.perInstrument[0]!;
    const i1 = b.perInstrument[1]!;
    expect(i0.slots[0]!.firstUse).toBe(true);
    expect(i0.slots[0]!.routineBytes).toBe(200);
    expect(i0.slots[0]!.marginalBytes).toBe(200 + 10); // routine + perSlot
    expect(i1.slots[0]!.firstUse).toBe(false);
    expect(i1.slots[0]!.routineBytes).toBe(0);
    expect(i1.slots[0]!.marginalBytes).toBe(10); // perSlot only
  });

  it('charges perVarOperand for variable operands on a slot', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1, freq: 3 }]; // variable freq
    const b = computeBreakdown(p, CAL);
    const s = b.perInstrument[0]!.slots[0]!;
    expect(s.varOperands).toBe(1);
    expect(s.marginalBytes).toBe(200 + 10 + 50); // routine + perSlot + 1 var operand
  });

  it('reports op routines (heaviest first) and per-instrument code that sums', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [
      { ...emptySlot(), fn: 2, outVar: 1 },
      { ...emptySlot(), fn: 4, outVar: 1 },
    ];
    const b = computeBreakdown(p, CAL);
    expect(b.opTypesUsed.map((o) => o.fn)).toEqual([4, 2]); // routine desc: sine 300, saw 200
    expect(b.opTypesUsed.find((o) => o.fn === 2)!.name).toBe('osc_saw');
    // instr0 code = Σ marginal = (200+10) + (300+10) = 520
    expect(b.perInstrument[0]!.codeBytes).toBe(520);
  });

  it('per-instrument code + base sums to the headline codeBytes', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1 }];
    p.instruments[1]!.slots = [{ ...emptySlot(), fn: 4, outVar: 1, gain: 2 }]; // 1 var operand
    const b = computeBreakdown(p, CAL);
    const instrSum = b.perInstrument.reduce((n, i) => n + i.codeBytes, 0);
    expect(b.code.codeBytes).toBe(CAL.base + instrSum);
    expect(b.chip.residentTotal).toBe(1084); // no samples
  });
});
