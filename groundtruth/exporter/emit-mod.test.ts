import { describe, it, expect } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import { minimalMod } from './minimal-mod';
import { patchMod } from './emit-mod';

describe('patchMod', () => {
  it('writes sampleLength>>1 as big-endian u16 at 42+30n / 43+30n', () => {
    const p = emptyPatch();
    p.instruments[0]!.sampleLength = 0x3000; // >>1 = 0x1800
    const out = patchMod(minimalMod(), p);
    expect(out[42]).toBe(0x18); // hi
    expect(out[43]).toBe(0x00); // lo
    expect(out.length).toBe(2108);
  });

  it('writes loop offset/length only when slot 15 is loop_gen (fn 22)', () => {
    const p = emptyPatch();
    const ins = p.instruments[1]!;
    ins.sampleLength = 0x2000;
    ins.loopOffset = 0x100; ins.loopLength = 0x80;
    ins.slots = Array.from({ length: 16 }, () => ({ ...emptySlot() }));
    ins.slots[15] = { ...emptySlot(), fn: 22 };
    const out = patchMod(minimalMod(), p);
    const base = 30 * 1;
    // checkloopparams normalizes off=4095,len=4097 (half=4096, offset<half)
    expect(out[46 + base]).toBe(0x07); expect(out[47 + base]).toBe(0xFF); // 4095>>1=2047=0x07FF
    expect(out[48 + base]).toBe(0x08); expect(out[49 + base]).toBe(0x00); // 4097>>1=2048=0x0800
  });

  it('does not write loop words when slot 15 is not loop_gen', () => {
    const p = emptyPatch();
    p.instruments[2]!.sampleLength = 0x10;
    p.instruments[2]!.loopOffset = 0x100;
    const out = patchMod(minimalMod(), p);
    const base = 30 * 2;
    expect(out[46 + base]).toBe(0); expect(out[47 + base]).toBe(0);
  });
});
