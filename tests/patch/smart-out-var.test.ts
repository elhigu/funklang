import { describe, it, expect } from 'vitest';
import { emptyInstrument, emptySlot } from '../../src/patch/types';
import type { Instrument } from '../../src/patch/types';
import { pickSmartOutVar } from '../../src/patch/smart-out-var';

function instr(): Instrument {
  return emptyInstrument();
}

describe('pickSmartOutVar', () => {
  it('returns v1 for the very first slot in an empty instrument', () => {
    expect(pickSmartOutVar(instr(), 0)).toBe(1);
  });

  it('returns the next unused var when no earlier var has been READ', () => {
    // osc_saw → v1, osc_saw → v2 ; insert at end with nothing reading v1/v2.
    const ins = instr();
    ins.slots.push({ ...emptySlot(), fn: 2, outVar: 1 });
    ins.slots.push({ ...emptySlot(), fn: 2, outVar: 2 });
    expect(pickSmartOutVar(ins, 2)).toBe(3);
  });

  it('prefers a var that an earlier slot has READ as input', () => {
    // osc_saw → v1, vol consumes v1 → v2.  Inserting at end SHOULD prefer
    // v1 (already-read) over v3 (unused) — the new slot can re-fill v1.
    const ins = instr();
    ins.slots.push({ ...emptySlot(), fn: 2, outVar: 1 });               // writes v1
    ins.slots.push({ ...emptySlot(), fn: 1, outVar: 2, val1: 1 });      // reads v1, writes v2
    expect(pickSmartOutVar(ins, 2)).toBe(1);
  });

  it('treats a var-or-const selector pointing at v# as a READ', () => {
    // osc_saw → v3, then osc_sine with gain SELECTOR = v3 (gain = 3,
    // gainVal ignored).  Insert at end → v3 has been read, so pick v3.
    const ins = instr();
    ins.slots.push({ ...emptySlot(), fn: 2, outVar: 3 });
    ins.slots.push({ ...emptySlot(), fn: 4, outVar: 1, gain: 3, gainVal: 0 });
    expect(pickSmartOutVar(ins, 2)).toBe(3);
  });

  it('falls back to v1 when every variable is both written AND none read', () => {
    const ins = instr();
    for (let v = 1; v <= 4; v++) ins.slots.push({ ...emptySlot(), fn: 2, outVar: v });
    expect(pickSmartOutVar(ins, 4)).toBe(1);
  });
});
