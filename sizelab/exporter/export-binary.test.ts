import { describe, it, expect } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import { emitIsetBinary, emitIswitchBinary } from './emit-iset';
import { exportPatchBinary } from './export-patch';

function p1() {
  const p = emptyPatch();
  p.instruments[0]!.sampleLength = 5000;
  p.instruments[0]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1, freqVal: 1000, gainVal: 64 }];
  return p;
}

describe('binary Iset/Iswitch', () => {
  it('Iset binary: #define binary + numinstruments + imp_length only (no mod/INCBIN/gen_length)', () => {
    const p = emptyPatch();
    p.instruments[0]!.sampleLength = 1000;
    p.importedSamples[0]!.data = new Int8Array(50);
    expect(emitIsetBinary(p)).toBe('#define binary\r\n#define numinstruments 1\r\nint imp_length = 50;\r\n');
  });
  it('Iswitch binary', () => {
    expect(emitIswitchBinary()).toBe('#define binary\r\n');
  });
});

describe('exportPatchBinary', () => {
  it('emits 5 artifacts (no empty.mod) with the binary flavor; ilen/inst reuse the exe codegen', () => {
    const a = exportPatchBinary(p1());
    expect(Object.keys(a).sort()).toEqual(['Isamp.raw', 'Iset.h', 'ilen.h', 'inst.h', 'support/Iswitch.h']);
    expect(a['Iset.h'].startsWith('#define binary\r\n')).toBe(true);
    expect(a['support/Iswitch.h']).toBe('#define binary\r\n');
    expect(a['inst.h']).toContain('v1 = osc_saw(0, 1000, 64);');
    expect(a['ilen.h']).toContain('SmpLength[0] = 0x1388;');
  });
});
