import { describe, it, expect } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import type { CalibrationData } from '../../src/sizecalc/calibration-data';
import { addCost, phaseMarginal } from '../../src/sizecalc/marginal';

const CAL: CalibrationData = {
  floor: 200, perDistinctOp: 100, perSlotPow: 50, slotPower: 0.8, perVarOperand: 50,
  opRoutine: { 2: 300, 4: 80 }, opConnection: { 2: 64, 4: 90 },
  modLengthEmpty: 0, fitted: true, fit: { meanErr: 0, maxErr: 0, meanPct: 0 },
};

describe('addCost (context-aware op-picker cost)', () => {
  it('adds routine + connection when the op is not yet present', () => {
    const c = addCost(emptyPatch(), 2, CAL);
    expect(c.alreadyPresent).toBe(false);
    expect(c.cost).toBe(300 + 64);
  });

  it('adds only connection when the op is already used (routine already paid)', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1 }];
    const c = addCost(p, 2, CAL);
    expect(c.alreadyPresent).toBe(true);
    expect(c.cost).toBe(64);
  });
});

describe('phaseMarginal (context-aware freed-on-delete)', () => {
  it('sole use frees routine + connection (last use)', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1 }];
    const m = phaseMarginal(p, 0, 0, CAL)!;
    expect(m.lastUse).toBe(true);
    expect(m.freed).toBe(300 + 64);
    expect(m.opUses).toBe(1);
  });

  it('reused op frees only connection; routine stays for the other phase', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1 }];
    p.instruments[1]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1 }];
    const m = phaseMarginal(p, 0, 0, CAL)!;
    expect(m.lastUse).toBe(false);
    expect(m.freed).toBe(64);
    expect(m.opUses).toBe(2);
    expect(m.sharedWith).toEqual([{ instrIdx: 1, slotIdx: 0 }]);
  });

  it('adds per-variable-operand bytes for variable operands', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1, freq: 3 }]; // 1 var operand
    const m = phaseMarginal(p, 0, 0, CAL)!;
    expect(m.varBytes).toBe(50);
    expect(m.freed).toBe(300 + 64 + 50);
  });

  it('returns null for an empty slot', () => {
    expect(phaseMarginal(emptyPatch(), 0, 0, CAL)).toBeNull();
  });
});
