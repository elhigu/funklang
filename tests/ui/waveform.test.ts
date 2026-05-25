import { describe, it, expect } from 'vitest';
import { bytesToInt16, bytesToInt16WithLoop } from '../../src/ui/waveform';

describe('bytesToInt16', () => {
  it('upscales Int8 → Int16 by <<8 (sign-preserving)', () => {
    const out = bytesToInt16(new Int8Array([0, 1, -1, 127, -128]));
    expect(Array.from(out)).toEqual([0, 256, -256, 32512, -32768]);
  });
});

describe('bytesToInt16WithLoop', () => {
  it('falls back to plain bytesToInt16 when loopLength is 0', () => {
    const bytes = new Int8Array([10, 20, 30, 40]);
    expect(Array.from(bytesToInt16WithLoop(bytes, 0, 0, 4)))
      .toEqual(Array.from(bytesToInt16(bytes)));
  });

  it('falls back when loopRepeats is 0', () => {
    const bytes = new Int8Array([10, 20, 30, 40]);
    expect(Array.from(bytesToInt16WithLoop(bytes, 1, 2, 0)))
      .toEqual(Array.from(bytesToInt16(bytes)));
  });

  it('falls back when loop region is out of range', () => {
    const bytes = new Int8Array([10, 20, 30, 40]);
    expect(Array.from(bytesToInt16WithLoop(bytes, 10, 5, 3)))
      .toEqual(Array.from(bytesToInt16(bytes)));
  });

  it('appends loop region N times after the original', () => {
    const bytes = new Int8Array([1, 2, 3, 4, 5, 6]);
    // loop region = indices 2..4 (length 2: bytes 3 and 4)
    const out = bytesToInt16WithLoop(bytes, 2, 2, 3);
    // expected: original (1..6) + (3,4) × 3
    expect(Array.from(out)).toEqual([
      256, 512, 768, 1024, 1280, 1536,  // 1..6 << 8
      768, 1024,                          // 3, 4
      768, 1024,                          // 3, 4
      768, 1024,                          // 3, 4
    ]);
  });

  it('clamps loop region to buffer length', () => {
    const bytes = new Int8Array([1, 2, 3, 4]);
    // loop 2..5 requested, buffer length 4 → effective loop = 2..3 (len 2)
    const out = bytesToInt16WithLoop(bytes, 2, 3, 2);
    expect(out.length).toBe(4 + 2 * 2);   // original + 2 reps of 2 samples
    expect(Array.from(out.subarray(4))).toEqual([768, 1024, 768, 1024]);
  });
});
