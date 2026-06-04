import { describe, it, expect } from 'vitest';
import { emptyPatch } from '../../src/patch/types';
import { emitIset, emitIswitch } from './emit-iset';

describe('emitIset', () => {
  it('emits the fixed header with computed numinstruments/lengths', () => {
    const p = emptyPatch();
    p.instruments[0]!.sampleLength = 1000;
    p.instruments[1]!.sampleLength = 2000;
    p.importedSamples[0]!.data = new Int8Array(50);
    const out = emitIset(p);
    expect(out).toBe(
      '#define executable\r\n' +
      '#define numinstruments 2\r\n' +
      'const void * protrackermod;\r\n' +
      'INCBIN(protrackermod, "empty.mod");\r\n' +
      'const void * importedsamples;\r\n' +
      'INCBIN(importedsamples, "Isamp.raw");\r\n' +
      'int mod_length_empty = 2108;\r\n' +
      'int imp_length = 50;\r\n' +
      'long gen_length = 3000;\r\n',
    );
  });
});

describe('emitIswitch', () => {
  it('is exactly the executable define', () => {
    expect(emitIswitch()).toBe('#define executable\r\n');
  });
});
