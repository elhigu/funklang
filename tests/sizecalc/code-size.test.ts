import { describe, it, expect } from 'vitest';
import { emptyPatch, emptySlot, type Slot } from '../../src/patch/types';
import type { CalibrationData } from '../../src/sizecalc/calibration-data';
import { estimateCodeSize } from '../../src/sizecalc/code-size';

const CAL: CalibrationData = {
  floor: 200,
  perDistinctOp: 100,
  perSlotPow: 50,
  slotPower: 0.8,
  perVarOperand: 30,
  opWeight: { 2: 200, 4: 300 },
  modLengthEmpty: 0,
  fitted: true,
  fit: { meanErr: 0, maxErr: 0, meanPct: 0 },
};

function patchWith(slots: Slot[]) {
  const p = emptyPatch();
  p.instruments[0]!.slots = slots;
  return p;
}
const opSlot = (fn: number, extra: Partial<Slot> = {}): Slot => ({ ...emptySlot(), fn, outVar: 1, ...extra });
const pow = (n: number) => Math.round(50 * Math.pow(n, 0.8));

describe('estimateCodeSize (anchored power-law .bin model)', () => {
  it('headline = floor + perDistinctOp·distinct + perSlotPow·nSlots^0.8 + perVarOperand·var', () => {
    const e = estimateCodeSize(patchWith([opSlot(2), opSlot(2), opSlot(4)]), CAL); // distinct {2,4}, 3 slots, 0 var
    expect(e.distinctOps).toEqual([2, 4]);
    expect(e.nSlots).toBe(3);
    expect(e.nVarOperands).toBe(0);
    expect(e.distinctOpBytes).toBe(200);
    expect(e.slotBytes).toBe(pow(3));
    expect(e.varOperandBytes).toBe(0);
    expect(e.codeBytes).toBe(200 + 200 + pow(3));
  });

  it('a variable (non-const) operand costs perVarOperand', () => {
    const e = estimateCodeSize(patchWith([opSlot(2, { freq: 3 })]), CAL); // 1 var operand
    expect(e.nVarOperands).toBe(1);
    expect(e.varOperandBytes).toBe(30);
    expect(e.codeBytes).toBe(200 + 100 + pow(1) + 30);
  });

  it('empty patch estimates exactly the floor (no slots)', () => {
    const e = estimateCodeSize(emptyPatch(), CAL);
    expect(e.nSlots).toBe(0);
    expect(e.slotBytes).toBe(0);
    expect(e.codeBytes).toBe(200);
  });

  it('slot growth is concave (sub-linear): 4 slots cost < 4× one slot', () => {
    const one = estimateCodeSize(patchWith([opSlot(2)]), CAL).slotBytes;
    const four = estimateCodeSize(patchWith([opSlot(2), opSlot(2), opSlot(2), opSlot(2)]), CAL).slotBytes;
    expect(four).toBeLessThan(4 * one);
  });

  it('ignores fn===0 slots', () => {
    const e = estimateCodeSize(patchWith([opSlot(2), emptySlot(), emptySlot()]), CAL);
    expect(e.distinctOps).toEqual([2]);
    expect(e.nSlots).toBe(1);
  });

  it('excludes imports from codeBytes but adds them exactly to totalBytes', () => {
    const p = patchWith([opSlot(2), opSlot(4)]);
    const code = estimateCodeSize(p, CAL).codeBytes;
    p.importedSamples[0]!.data = new Int8Array(5000);
    const e = estimateCodeSize(p, CAL);
    expect(e.codeBytes).toBe(code); // imports don't change code
    expect(e.importBytes).toBe(5000);
    expect(e.totalBytes).toBe(code + 5000);
  });
});
