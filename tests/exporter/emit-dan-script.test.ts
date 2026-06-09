import { describe, it, expect } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import { emitDanScript } from '../../src/codegen/emit-inst';

describe('emitDanScript (Aklang2Asm input format)', () => {
  it('emits the imports line + $ instrument header + vN = op(args) statements', () => {
    const p = emptyPatch();
    p.instruments[0]!.name = 'lead';
    p.instruments[0]!.sampleLength = 12288;
    p.instruments[0]!.loopOffset = 7550;
    p.instruments[0]!.loopLength = 4738;
    p.instruments[0]!.slots = [
      { ...emptySlot(), fn: 4, outVar: 1, freqVal: 490, gainVal: 89 }, // osc_sine(0,490,89)
    ];
    const s = emitDanScript(p);
    const lines = s.split('\r\n');
    expect(lines[0]).toBe('0, 0, 0, 0, 0, 0, 0, 0');           // 8 import lengths
    expect(lines[1]).toBe('$ lead, 12288, 7550, 4738, N');     // header, N = no loop_gen in slot 15
    expect(lines[2]).toBe('#');
    expect(lines[3]).toBe('v1 = osc_sine(0, 490, 89);');
  });

  it('flags Y when slot 15 is a loop_gen', () => {
    const p = emptyPatch();
    p.instruments[0]!.sampleLength = 4096;
    p.instruments[0]!.slots = Array.from({ length: 16 }, () => ({ ...emptySlot() }));
    p.instruments[0]!.slots[0] = { ...emptySlot(), fn: 2, outVar: 1 };
    p.instruments[0]!.slots[15] = { ...emptySlot(), fn: 22, outVar: 1 };
    expect(emitDanScript(p).split('\r\n')[1]).toMatch(/, Y$/);
  });
});
