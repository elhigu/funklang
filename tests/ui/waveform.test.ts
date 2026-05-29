import { describe, it, expect } from 'vitest';
import { bytesToInt16, bytesToInt16WithLoop, waveStats } from '../../src/ui/waveform';

describe('waveStats', () => {
  it('returns null for empty / null input', () => {
    expect(waveStats(null)).toBeNull();
    expect(waveStats(new Int16Array(0))).toBeNull();
  });

  it('reports min/max and a symmetric peak for bipolar audio', () => {
    const s = new Int16Array([0, 30000, -32768, 12000, -5000]);
    const st = waveStats(s)!;
    expect(st.min).toBe(-32768);
    expect(st.max).toBe(30000);
    // peak = max(|min|,|max|) → 32768, floored at 1.
    expect(st.peak).toBe(32768);
  });

  it('uses a SMALL peak for a 0..127 control signal (no ±32k scale)', () => {
    const s = new Int16Array([0, 64, 127, 32, 100]);
    const st = waveStats(s)!;
    expect(st.min).toBe(0);
    expect(st.max).toBe(127);
    expect(st.peak).toBe(127);   // NOT 32768 — small signals fill the cell
  });

  it('floors peak at 1 for an all-zero (silent) buffer — no divide-by-zero', () => {
    const st = waveStats(new Int16Array([0, 0, 0]))!;
    expect(st.min).toBe(0);
    expect(st.max).toBe(0);
    expect(st.peak).toBe(1);
  });

  it('peak is symmetric — a negative-only signal still scales by |min|', () => {
    const st = waveStats(new Int16Array([-100, -40, -7]))!;
    expect(st.min).toBe(-100);
    expect(st.max).toBe(-7);
    expect(st.peak).toBe(100);
  });

  it('honours start/end slicing', () => {
    const s = new Int16Array([32000, 5, 9, -32000]);
    // window [1,3) → samples 5, 9 only.
    const st = waveStats(s, 1, 3)!;
    expect(st.min).toBe(5);
    expect(st.max).toBe(9);
    expect(st.peak).toBe(9);
  });
});

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
