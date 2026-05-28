import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { applyInsertDefaults, opByCode } from '../../src/dsp/op-metadata';

describe('applyInsertDefaults', () => {
  it('envd (fn=8) defaults decay=16 sustain=64 gain=64', () => {
    const base = { ...emptySlot(), fn: 8, outVar: 1 };
    const out = applyInsertDefaults(base, 8);
    expect(out.val1Value).toBe(16);
    expect(out.val2Value).toBe(64);
    expect(out.gainVal).toBe(64);
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

  it('enva (fn=7) defaults val1Value=16 (attack), gainVal=64', () => {
    const base = { ...emptySlot(), fn: 7, outVar: 1 };
    const out = applyInsertDefaults(base, 7);
    expect(out.val1Value).toBe(16);
    expect(out.gainVal).toBe(64);
  });

  it('add (fn=9) defaults val1=1 (v1) and val2Value=0', () => {
    const base = { ...emptySlot(), fn: 9, outVar: 1 };
    const out = applyInsertDefaults(base, 9);
    expect(out.val1).toBe(1);
    expect(out.val2Value).toBe(0);
  });

  it('dly_cyc (fn=11) defaults freqVal=0 (delay), gainVal=128', () => {
    const base = { ...emptySlot(), fn: 11, outVar: 1 };
    const out = applyInsertDefaults(base, 11);
    expect(out.freqVal).toBe(0);
    expect(out.gainVal).toBe(128);
  });

  it('cmb_flt_n (fn=12) defaults delay/fbk to 0 and gain to 64', () => {
    const base = { ...emptySlot(), fn: 12, outVar: 1 };
    const out = applyInsertDefaults(base, 12);
    expect(out.freqVal).toBe(0);
    expect(out.val2Value).toBe(0);
    expect(out.gainVal).toBe(64);
  });

  it('cmb_flt_n labels feedback as "feedback" (not "fbk")', () => {
    const fb = opByCode(12)!.params.find((p) => p.field === 'val2Value')!;
    expect((fb.type as { label: string }).label).toBe('feedback');
  });

  it('reverb (fn=13) defaults feedback=64 gain=64', () => {
    const base = { ...emptySlot(), fn: 13, outVar: 1 };
    const out = applyInsertDefaults(base, 13);
    expect(out.val2Value).toBe(64);
    expect(out.gainVal).toBe(64);
  });

  it('reverb labels feedback as "feedback"', () => {
    const fb = opByCode(13)!.params.find((p) => p.field === 'val2Value')!;
    expect((fb.type as { label: string }).label).toBe('feedback');
  });

  it('sv_flt_n (fn=15) defaults cutoff=16 reso=16 mode=LP (gain field = 0)', () => {
    const base = { ...emptySlot(), fn: 15, outVar: 1 };
    const out = applyInsertDefaults(base, 15);
    expect(out.freqVal).toBe(16);
    expect(out.val2Value).toBe(16);
    expect(out.gain).toBe(0);
  });

  it('distortion (fn=16) defaults gainVal to 64', () => {
    const base = { ...emptySlot(), fn: 16, outVar: 1 };
    expect(applyInsertDefaults(base, 16).gainVal).toBe(64);
  });

  it('sample_hold (fn=19) defaults step to 8', () => {
    const base = { ...emptySlot(), fn: 19, outVar: 1 };
    expect(applyInsertDefaults(base, 19).gainVal).toBe(8);
  });
});
