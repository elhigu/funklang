import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { applyInsertDefaults } from '../../src/dsp/op-metadata';

describe('applyInsertDefaults', () => {
  it('returns the base unchanged for an op with no registered defaults', () => {
    // osc_noise (fn=6) has no entry yet — it gets one in a later task.
    const base = { ...emptySlot(), fn: 6, outVar: 1 };
    expect(applyInsertDefaults(base, 6)).toEqual(base);
  });

  it('merges registered fields on top of the base (envd → currently {23,0,128})', () => {
    // Lock in the CURRENT envd defaults; a later task overwrites this
    // assertion to match the new spec.
    const base = { ...emptySlot(), fn: 8, outVar: 1 };
    const out = applyInsertDefaults(base, 8);
    expect(out.val1Value).toBe(23);
    expect(out.val2Value).toBe(0);
    expect(out.gainVal).toBe(128);
    expect(out.fn).toBe(8);
    expect(out.outVar).toBe(1);
  });

  it('vol (fn=1) defaults gainVal to 128', () => {
    const base = { ...emptySlot(), fn: 1, outVar: 1 };
    expect(applyInsertDefaults(base, 1).gainVal).toBe(128);
  });
});
