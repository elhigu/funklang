// op 20 — imported_sample: reads a signed byte from patch.importedSamples[idx]
// at offset = current tick, shifts left by 8 into the high byte of a short.
//
// Setup: a single-instrument patch where slot 0 = imported_sample(imp=K) → v1.
// The .akp serializer writes importedSamples[].data RAW (no delta encoding),
// and refrender now reads them raw too — so JS data and C data are the same
// bytes after load.

import { describe, it, expect } from 'vitest';
import { emptySlot, emptyPatch } from '../../src/patch/types';
import type { Patch } from '../../src/patch/types';
import { runBoth, fp } from './_dsp_helpers';

function patchWithImport(
  impIdx: number,
  bytes: Int8Array,
  sampleLength = 256,
): Patch {
  const p = emptyPatch();
  const ins = p.instruments[0]!;
  ins.sampleLength = sampleLength;
  // gain field carries the import index.
  ins.slots = [
    { ...emptySlot(), outVar: 1, fn: 20, gain: impIdx },
  ];
  p.importedSamples[impIdx] = { name: 'imp', data: bytes };
  return p;
}

describe('op imported_sample (code 20)', () => {
  it('short ramp (length < sampleLength)', () => {
    const data = new Int8Array(64);
    for (let i = 0; i < data.length; i++) data[i] = i - 32;
    const p = patchWithImport(0, data, 256);
    const { c, js } = runBoth(p);
    expect(fp(js)).toEqual(fp(c));
  });

  it('long ramp (length > sampleLength)', () => {
    const data = new Int8Array(512);
    for (let i = 0; i < data.length; i++) data[i] = ((i * 3) & 0xff) - 128;
    const p = patchWithImport(2, data, 256);
    const { c, js } = runBoth(p);
    expect(fp(js)).toEqual(fp(c));
  });

  it('empty import → all zeros', () => {
    const p = patchWithImport(0, new Int8Array(0), 128);
    const { c, js } = runBoth(p);
    expect(fp(js)).toEqual(fp(c));
  });

  it('import at non-zero slot (idx=5)', () => {
    const data = new Int8Array([0, -64, 127, -128, 64, 0, -32, 32, 96, -96]);
    const p = patchWithImport(5, data, 32);
    const { c, js } = runBoth(p);
    expect(fp(js)).toEqual(fp(c));
  });

  it('signed-byte boundary values', () => {
    const data = new Int8Array([0, 1, -1, 127, -128, 64, -64]);
    const p = patchWithImport(0, data, 16);
    const { c, js } = runBoth(p);
    expect(fp(js)).toEqual(fp(c));
  });
});
