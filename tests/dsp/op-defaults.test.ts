import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { applyInsertDefaults } from '../../src/dsp/op-metadata';

describe('applyInsertDefaults', () => {
  it('returns the base unchanged for an op with no registered defaults', () => {
    const base = { ...emptySlot(), fn: 9, outVar: 1 };
    expect(applyInsertDefaults(base, 9)).toEqual(base);
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

  it.each([
    { code: 2, name: 'osc_saw' },
    { code: 3, name: 'osc_tri' },
    { code: 4, name: 'osc_sine' },
  ])('$name (fn=$code) defaults freqVal=50 gainVal=64', ({ code }) => {
    const base = { ...emptySlot(), fn: code, outVar: 1 };
    const out = applyInsertDefaults(base, code);
    expect(out.freqVal).toBe(50);
    expect(out.gainVal).toBe(64);
  });

  it('osc_pulse (fn=5) defaults freqVal=50 gainVal=64 widthVal=63', () => {
    const base = { ...emptySlot(), fn: 5, outVar: 1 };
    const out = applyInsertDefaults(base, 5);
    expect(out.freqVal).toBe(50);
    expect(out.gainVal).toBe(64);
    expect(out.widthVal).toBe(63);
  });

  it('osc_noise (fn=6) defaults gainVal to 64', () => {
    const base = { ...emptySlot(), fn: 6, outVar: 1 };
    expect(applyInsertDefaults(base, 6).gainVal).toBe(64);
  });
});
