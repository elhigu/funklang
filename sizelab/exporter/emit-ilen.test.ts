import { describe, it, expect } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import { emitIlen, highestInstrument } from './emit-ilen';

describe('highestInstrument', () => {
  it('is highest index with sampleLength>2, plus one', () => {
    const p = emptyPatch();
    p.instruments[0]!.sampleLength = 100;
    p.instruments[3]!.sampleLength = 100;
    p.instruments[5]!.sampleLength = 2; // not counted (<=2)
    expect(highestInstrument(p)).toBe(4);
  });
});

describe('emitIlen', () => {
  it('emits SmpLength/repeat/flag per instrument + 8 ImpLength, CRLF + 0xHEX', () => {
    const p = emptyPatch();
    p.instruments[0]!.name = 'lead';
    p.instruments[0]!.sampleLength = 0x3000;
    p.importedSamples[0]!.data = new Int8Array(0x10);
    const out = emitIlen(p);
    expect(out).toContain('// lead\r\n');
    expect(out).toContain('SmpLength[0] = 0x3000;\r\n');
    expect(out).toContain('repeat_offset[0] = 0x17FF;\r\n');
    expect(out).toContain('repeat_length[0] = 0x1801;\r\n');
    expect(out).toContain("samplename_flag[0] = ' ';\r\n");
    expect(out).toContain('ImpLength[0] = 0x10;\r\n');
    expect(out).toContain('ImpLength[7] = 0x0;\r\n');
  });

  it("flags loop_gen instruments with 'l'", () => {
    const p = emptyPatch();
    p.instruments[0]!.sampleLength = 0x100;
    p.instruments[0]!.slots = Array.from({ length: 16 }, () => ({ ...emptySlot() }));
    p.instruments[0]!.slots[15] = { ...emptySlot(), fn: 22 };
    expect(emitIlen(p)).toContain("samplename_flag[0] = 'l';\r\n");
  });
});
