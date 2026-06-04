import { describe, it, expect } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import { emitInst, OPNAME } from './emit-inst';
import type { Slot } from '../../src/patch/types';

function instr(p: ReturnType<typeof emptyPatch>, k: number, sampleLength: number, slots: Array<Partial<Slot>>) {
  const ins = p.instruments[k]!;
  ins.sampleLength = sampleLength;
  ins.slots = Array.from({ length: 16 }, () => ({ ...emptySlot() }));
  slots.forEach((s, i) => { ins.slots[i] = { ...emptySlot(), ...s }; });
}

describe('emitInst', () => {
  it('wraps each non-trivial instrument and emits regular-op slot lines', () => {
    const p = emptyPatch();
    p.instruments[0]!.name = 'lead';
    instr(p, 0, 5000, [{ fn: 2, outVar: 1, freqVal: 1000, gainVal: 64 }]);
    const out = emitInst(p);
    expect(out).toContain('// lead\r\n');
    expect(out).toContain('if (instrument == 0) {\r\n');
    expect(out).toContain('v1 = osc_saw(0, 1000, 64);\r\n');
    expect(out.endsWith('}\r\n')).toBe(true);
  });

  it('skips instruments with sampleLength<=2 and slots with outVar 0 or fn 22', () => {
    const p = emptyPatch();
    instr(p, 0, 2, [{ fn: 2, outVar: 1 }]);
    instr(p, 1, 5000, [
      { fn: 2, outVar: 0, freqVal: 5 },
      { fn: 22, outVar: 1 },
      { fn: 1, outVar: 2, val1: 1, gainVal: 10 },
    ]);
    const out = emitInst(p);
    expect(out).not.toContain('instrument == 0');
    expect(out).toContain('if (instrument == 1) {\r\n');
    expect(out).toContain('v2 = vol(v1, 10);\r\n');
    expect(out).not.toContain('osc_saw');
  });

  it('uses variable args when a selector is set', () => {
    const p = emptyPatch();
    instr(p, 0, 5000, [{ fn: 2, outVar: 3, freq: 2, freqVal: 999, gain: 0, gainVal: 50 }]);
    expect(emitInst(p)).toContain('v3 = osc_saw(0, v2, 50);\r\n');
  });

  it('throws on an unknown/unsupported op (e.g. vocoder 24)', () => {
    const p = emptyPatch();
    instr(p, 0, 5000, [{ fn: 24, outVar: 1 }]);
    expect(() => emitInst(p)).toThrow(/unsupported op/i);
  });
});
