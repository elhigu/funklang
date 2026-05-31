import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import {
  applyInsertDefaults, opByCode, isCrossInstrumentOp, isPostRenderOp,
} from '../../src/dsp/op-metadata';

describe('op trait predicates', () => {
  it('isCrossInstrumentOp is true only for clone (17) and chordgen (18)', () => {
    expect(isCrossInstrumentOp(17)).toBe(true);   // clone
    expect(isCrossInstrumentOp(18)).toBe(true);   // chordgen
    for (const fn of [1, 2, 6, 8, 14, 16, 19, 22, 24]) {
      expect(isCrossInstrumentOp(fn), `fn ${fn}`).toBe(false);
    }
    expect(isCrossInstrumentOp(999)).toBe(false); // unknown op
  });

  it('isPostRenderOp is true only for loop_gen (22)', () => {
    expect(isPostRenderOp(22)).toBe(true);
    for (const fn of [1, 2, 17, 18, 19, 24]) {
      expect(isPostRenderOp(fn), `fn ${fn}`).toBe(false);
    }
    expect(isPostRenderOp(999)).toBe(false);
  });

  it('the flags live on the op defs, so the predicates stay in sync with OP_DEFS', () => {
    expect(opByCode(17)!.crossInstrument).toBe(true);
    expect(opByCode(18)!.crossInstrument).toBe(true);
    expect(opByCode(22)!.postRender).toBe(true);
  });

  it("mul's val2Value param declares display:'fractional' (drives the sidecar)", () => {
    const mulVal2 = opByCode(10)!.params.find((p) => p.field === 'val2Value')!;
    expect(mulVal2.type.kind).toBe('var-or-const');
    expect((mulVal2.type as { display?: string }).display).toBe('fractional');
    // add (fn=9) has the same field but NO fractional sidecar.
    const addVal2 = opByCode(9)!.params.find((p) => p.field === 'val2Value')!;
    expect((addVal2.type as { display?: string }).display).toBeUndefined();
  });
});

describe('applyInsertDefaults', () => {
  it('preserves fn and outVar — defaults merge ON TOP of the base, not replace it', () => {
    const base = { ...emptySlot(), fn: 8, outVar: 3 };
    const out = applyInsertDefaults(base, 8);
    expect(out.fn).toBe(8);
    expect(out.outVar).toBe(3);
  });

  it('returns the base unchanged when there is no INSERT_DEFAULTS entry (chordgen fn=18)', () => {
    const base = { ...emptySlot(), fn: 18, outVar: 1 };
    expect(applyInsertDefaults(base, 18)).toEqual(base);
  });

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
