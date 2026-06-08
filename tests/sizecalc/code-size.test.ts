import { describe, it, expect } from 'vitest';
import { emptyPatch, emptySlot, type Slot } from '../../src/patch/types';
import type { CalibrationData } from '../../src/sizecalc/calibration-data';
import { estimateCodeSize } from '../../src/sizecalc/code-size';

const CAL: CalibrationData = {
  base: 100,
  perSlot: 10,
  perVarOperand: 50,
  floor: 200,
  opRoutine: { 2: 200, 4: 300 }, // osc_saw routine 200, osc_sine 300
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

describe('estimateCodeSize (additive per-op .bin model)', () => {
  it('headline = base + Σ routine[distinct] + perSlot·nSlots + perVarOperand·nVarOperands', () => {
    const e = estimateCodeSize(patchWith([opSlot(2), opSlot(2), opSlot(4)]), CAL); // distinct {2,4}, 3 slots, 0 var
    expect(e.distinctOps).toEqual([2, 4]);
    expect(e.nSlots).toBe(3);
    expect(e.nVarOperands).toBe(0);
    expect(e.routineBytes).toBe(200 + 300);
    expect(e.slotBytes).toBe(10 * 3);
    expect(e.varOperandBytes).toBe(0);
    expect(e.codeBytes).toBe(100 + 500 + 30); // 630 > floor
    expect(e.floored).toBe(false);
  });

  it('a variable (non-const) operand costs perVarOperand', () => {
    // osc_saw with a variable freq selector (freq != 0) → 1 variable operand.
    const e = estimateCodeSize(patchWith([opSlot(2, { freq: 3 })]), CAL);
    expect(e.nVarOperands).toBe(1);
    expect(e.varOperandBytes).toBe(50);
    expect(e.codeBytes).toBe(100 + 200 + 10 + 50);
  });

  it('ignores fn===0 slots', () => {
    const e = estimateCodeSize(patchWith([opSlot(2), emptySlot(), emptySlot()]), CAL);
    expect(e.distinctOps).toEqual([2]);
    expect(e.nSlots).toBe(1);
  });

  it('clamps tiny patches up to the .bin floor and flags floored', () => {
    const e = estimateCodeSize(patchWith([opSlot(2)]), CAL); // 100+200+10 = 310 ... > floor 200
    expect(e.floored).toBe(false);
    const cheap: CalibrationData = { ...CAL, base: 10, opRoutine: { 2: 5 }, floor: 200 };
    const f = estimateCodeSize(patchWith([opSlot(2)]), cheap); // 10+5+10 = 25 < 200
    expect(f.codeBytes).toBe(200);
    expect(f.floored).toBe(true);
  });

  it('unknown op codes count as a slot/distinct op but contribute no routine', () => {
    const e = estimateCodeSize(patchWith([opSlot(99)]), CAL);
    expect(e.distinctOps).toEqual([99]);
    expect(e.routineBytes).toBe(0);
    expect(e.nSlots).toBe(1);
  });

  it('excludes imports from codeBytes but adds them exactly to totalBytes', () => {
    const p = patchWith([opSlot(2), opSlot(4)]); // code 100+500+20 = 620
    p.importedSamples[0]!.data = new Int8Array(5000);
    const e = estimateCodeSize(p, CAL);
    expect(e.codeBytes).toBe(620);
    expect(e.importBytes).toBe(5000);
    expect(e.totalBytes).toBe(620 + 5000);
  });
});
