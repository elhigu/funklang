import { describe, it, expect } from 'vitest';
import { emptyInstrument, emptySlot } from '../../src/patch/types';
import type { Instrument } from '../../src/patch/types';
import { classifyVarRef, visibleRow, varRefLabel } from '../../src/patch/var-refs';

function instr(slots: Array<{ fn: number; outVar: number }>): Instrument {
  const ins = emptyInstrument('x');
  ins.slots = slots.map((s) => ({ ...emptySlot(), fn: s.fn, outVar: s.outVar }));
  return ins;
}

describe('classifyVarRef', () => {
  // 0: osc→v1, 1: add (reader)→v2, 2: →v4, 3: →v3, 4: mul→v3
  const ins = instr([
    { fn: 2, outVar: 1 }, { fn: 9, outVar: 2 }, { fn: 2, outVar: 4 },
    { fn: 2, outVar: 3 }, { fn: 10, outVar: 3 },
  ]);

  it('normal when the variable is written by an EARLIER slot', () => {
    expect(classifyVarRef(ins, 1, 1)).toEqual({ kind: 'normal' });   // v1 ← slot 0
  });

  it('feedback when written only by LATER slots — source = last (highest) writer', () => {
    // reader slot 1 reads v3, written by slots 3 and 4 (both later) → feedback
    // from the highest writer (slot 4 = visible row 5).
    expect(classifyVarRef(ins, 1, 3)).toEqual({ kind: 'feedback', feedbackRow: 5 });
  });

  it('unset when no slot writes the variable at all', () => {
    const noWriter = instr([{ fn: 2, outVar: 1 }, { fn: 9, outVar: 1 }]);
    expect(classifyVarRef(noWriter, 1, 4)).toEqual({ kind: 'unset' });   // nobody writes v4
  });

  it('self-write with no earlier writer reads as feedback from itself', () => {
    // slot 0 reads + writes v1 (a resonator): previous-sample value → feedback.
    const self = instr([{ fn: 21, outVar: 1 }]);
    expect(classifyVarRef(self, 0, 1)).toEqual({ kind: 'feedback', feedbackRow: 1 });
  });

  it('an earlier writer wins even when a later one also writes it', () => {
    // v1 written by slot 0 (earlier) AND slot 4? add a later v1 writer.
    const both = instr([
      { fn: 2, outVar: 1 }, { fn: 9, outVar: 2 }, { fn: 2, outVar: 1 },
    ]);
    expect(classifyVarRef(both, 1, 1)).toEqual({ kind: 'normal' });  // earlier wins
  });

  it('v <= 0 (the "—"/const choice) is always normal', () => {
    expect(classifyVarRef(ins, 1, 0)).toEqual({ kind: 'normal' });
  });
});

describe('visibleRow', () => {
  it('counts non-empty slots, skipping fn=0 gaps', () => {
    const ins = instr([{ fn: 2, outVar: 1 }, { fn: 0, outVar: 0 }, { fn: 2, outVar: 2 }]);
    expect(visibleRow(ins, 0)).toBe(1);
    expect(visibleRow(ins, 2)).toBe(2);   // slot 1 (empty) doesn't count
  });
});

describe('varRefLabel', () => {
  it('suffixes feedback / unset, leaves normal bare', () => {
    expect(varRefLabel('v3', { kind: 'normal' })).toBe('v3');
    expect(varRefLabel('v3', { kind: 'feedback', feedbackRow: 10 })).toBe('v3 (feedback #10)');
    expect(varRefLabel('v3', { kind: 'unset' })).toBe('v3 (unset)');
  });
});
