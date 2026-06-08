import { describe, it, expect } from 'vitest';
import { emptyPatch, emptySlot } from '../patch/types';
import type { CalibrationData } from './calibration-data';
import { estimateCodeSize } from './code-size';

const CAL: CalibrationData = {
  base: 100,
  perDistinctOp: 50,
  perSlot: 10,
  floor: 200,
  opCost: { 2: 200, 4: 300 },
  modLengthEmpty: 0,
  fitted: true,
  fit: { meanErr: 0, maxErr: 0, meanPct: 0 },
};

function withSlots(fns: number[]) {
  const p = emptyPatch();
  p.instruments[0]!.slots = fns.map((fn) => ({ ...emptySlot(), fn, outVar: 1 }));
  return p;
}

describe('estimateCodeSize (aggregate .bin model)', () => {
  it('headline = base + perDistinctOp·distinctTypes + perSlot·nSlots', () => {
    const e = estimateCodeSize(withSlots([2, 2, 4]), CAL); // distinct {2,4}, 3 slots
    expect(e.distinctOps).toEqual([2, 4]);
    expect(e.nSlots).toBe(3);
    expect(e.distinctOpBytes).toBe(50 * 2);
    expect(e.slotBytes).toBe(10 * 3);
    expect(e.codeBytes).toBe(100 + 100 + 30); // 230 > floor 200
    expect(e.floored).toBe(false);
  });

  it('ignores fn===0 slots when counting distinct ops and slots', () => {
    const e = estimateCodeSize(withSlots([2, 0, 0]), CAL);
    expect(e.distinctOps).toEqual([2]);
    expect(e.nSlots).toBe(1);
  });

  it('clamps tiny patches up to the .bin floor and flags floored', () => {
    const e = estimateCodeSize(withSlots([2, 0, 0]), CAL); // raw 100+50+10=160 < 200
    expect(e.codeBytes).toBe(200);
    expect(e.floored).toBe(true);
  });

  it('counts unknown op codes as distinct ops (aggregate, not per-op)', () => {
    const e = estimateCodeSize(withSlots([99]), CAL);
    expect(e.distinctOps).toEqual([99]);
    expect(e.distinctOpBytes).toBe(50); // perDistinctOp applies regardless of opCost
  });

  it('excludes imports from codeBytes but adds them exactly to totalBytes', () => {
    const p = withSlots([2, 4]); // raw 100+100+20=220 > floor
    p.importedSamples[0]!.data = new Int8Array(5000);
    const e = estimateCodeSize(p, CAL);
    expect(e.codeBytes).toBe(220); // .bin code unaffected by imports
    expect(e.importBytes).toBe(5000); // exact raw sample bytes
    expect(e.totalBytes).toBe(220 + 5000); // full on-disk footprint
  });

  it('totalBytes == codeBytes when there are no imported samples', () => {
    const e = estimateCodeSize(withSlots([2, 4]), CAL);
    expect(e.importBytes).toBe(0);
    expect(e.totalBytes).toBe(e.codeBytes);
  });
});
