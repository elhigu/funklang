import { describe, it, expect } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import type { CalibrationData } from '../../src/sizecalc/calibration-data';
import { estimateExeSize } from '../../src/sizecalc/exe-size';

const CAL: CalibrationData = {
  base: 1000,
  slotStreamCost: 10,
  opCost: { 2: 200, 4: 300 },           // osc_saw=200, osc_sine=300
  modLengthEmpty: 0,
  shrink: { base: 100, codeRatio: 0.5, impRatio: 0.8 },
  fitted: true,
  fit: { meanErrUncompressed: 0, maxErrUncompressed: 0, meanErrShrinkled: 0, maxErrShrinkled: 0 },
};

function withSlots(fns: number[]) {
  const p = emptyPatch();
  p.instruments[0]!.slots = fns.map((fn) => ({ ...emptySlot(), fn, outVar: 1 }));
  return p;
}

describe('estimateExeSize', () => {
  it('counts each distinct op code once for code cost, every slot for stream', () => {
    const p = withSlots([2, 2, 4]);            // saw,saw,sine → distinct {2,4}
    const e = estimateExeSize(p, CAL);
    expect(e.opCodeBytes).toBe(200 + 300);     // saw once, sine once
    expect(e.slotStreamBytes).toBe(3 * 10);    // three op slots
    expect(e.uncompressed).toBe(1000 + 500 + 30 + 0);
  });

  it('ignores fn===0 slots entirely', () => {
    const p = withSlots([2, 0, 0]);
    const e = estimateExeSize(p, CAL);
    expect(e.opCodeBytes).toBe(200);
    expect(e.slotStreamBytes).toBe(10);
  });

  it('treats unknown op codes as zero code cost', () => {
    const p = withSlots([99]);
    expect(estimateExeSize(p, CAL).opCodeBytes).toBe(0);
  });

  it('adds imported-sample bytes and applies the split compression model', () => {
    const p = withSlots([2]);
    p.importedSamples[0]!.data = new Int8Array(1000);
    const e = estimateExeSize(p, CAL);
    expect(e.importBytes).toBe(1000);
    expect(e.uncompressed).toBe(1000 + 200 + 10 + 1000);
    // shrinkled = 100 + (1000+200+10)*0.5 + 1000*0.8
    expect(e.shrinkled).toBe(100 + 1210 * 0.5 + 800);
  });
});
