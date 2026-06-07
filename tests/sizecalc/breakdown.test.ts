import { describe, it, expect } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import type { CalibrationData } from '../../src/sizecalc/calibration-data';
import { computeBreakdown } from '../../src/sizecalc/breakdown';

const CAL: CalibrationData = {
  base: 1000, slotStreamCost: 10,
  opCost: { 2: 200, 4: 300 },
  modLengthEmpty: 1084,
  shrink: { base: 100, codeRatio: 0.5, impRatio: 0.8 },
  fitted: true,
  fit: { meanErrUncompressed: 0, maxErrUncompressed: 0, meanErrShrinkled: 0, maxErrShrinkled: 0 },
};

describe('computeBreakdown', () => {
  it('marks first patch-wide use of an op as the code-cost owner', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1 }]; // saw (first use)
    p.instruments[1]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1 }]; // saw (reuse)
    const b = computeBreakdown(p, CAL);

    const i0 = b.perInstrument[0]!;
    const i1 = b.perInstrument[1]!;
    expect(i0.slots[0]!.firstUse).toBe(true);
    expect(i0.slots[0]!.codeBytes).toBe(200);
    expect(i0.slots[0]!.marginalBytes).toBe(200 + 10);
    expect(i1.slots[0]!.firstUse).toBe(false);
    expect(i1.slots[0]!.codeBytes).toBe(0);
    expect(i1.slots[0]!.marginalBytes).toBe(10);
  });

  it('reports op-types-used with names and per-instrument code bytes', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [
      { ...emptySlot(), fn: 2, outVar: 1 },
      { ...emptySlot(), fn: 4, outVar: 1 },
    ];
    const b = computeBreakdown(p, CAL);
    expect(b.opTypesUsed.map((o) => o.fn)).toEqual([2, 4]);
    expect(b.opTypesUsed.find((o) => o.fn === 2)!.name).toBe('osc_saw');
    // instr0 code = Σ marginal = 200 + 300 + 2*10 = 520 (imports excluded)
    expect(b.perInstrument[0]!.codeBytes).toBe(520);
  });

  it('embeds the patch totals (code + chip) it was built from', () => {
    const p = emptyPatch();
    p.instruments[0]!.sampleLength = 2048;
    const b = computeBreakdown(p, CAL);
    expect(b.chip.residentTotal).toBe(1084 + 2048);
    expect(b.code.codeBytes).toBe(1000); // no op slots → just base
  });
});
