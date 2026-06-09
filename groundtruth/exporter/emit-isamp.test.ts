import { describe, it, expect } from 'vitest';
import { emptyPatch } from '../../src/patch/types';
import { emitIsamp } from './emit-isamp';

describe('emitIsamp', () => {
  it('concatenates the 8 imports then successive-delta-encodes', () => {
    const p = emptyPatch();
    p.importedSamples[0]!.data = Int8Array.from([10, 13, 13, 8]);
    p.importedSamples[1]!.data = Int8Array.from([8]); // continues the delta chain
    const out = emitIsamp(p);
    // raw = [10,13,13,8, 8]; delta = [10,3,0,-5, 0] → bytes 0x0A,0x03,0x00,0xFB,0x00
    expect(Array.from(out)).toEqual([0x0a, 0x03, 0x00, 0xfb, 0x00]);
  });

  it('round-trips against the runtime delta-decode', () => {
    const p = emptyPatch();
    p.importedSamples[0]!.data = Int8Array.from([5, -7, 100, -100, 42]);
    const enc = emitIsamp(p);
    const dec = new Int8Array(enc.length);
    let last = 0;
    for (let i = 0; i < enc.length; i++) { last = (last + enc[i]!) << 24 >> 24; dec[i] = last; }
    expect(Array.from(dec)).toEqual([5, -7, 100, -100, 42]);
  });

  it('is empty when no imports', () => {
    expect(emitIsamp(emptyPatch()).length).toBe(0);
  });
});
