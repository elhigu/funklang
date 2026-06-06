import { describe, it, expect } from 'vitest';
import { normalizeLoop } from './loop-norm';

describe('normalizeLoop', () => {
  it('clamps offset to half-1 when below half (P01)', () => {
    expect(normalizeLoop(5000, 0)).toEqual({ off: 2499, len: 2501 });
  });
  it('clamps offset to half-1 when below half (P04)', () => {
    expect(normalizeLoop(8000, 512)).toEqual({ off: 3999, len: 4001 });
  });
  it('handles tiny sample (P07 gap)', () => {
    expect(normalizeLoop(2, 0)).toEqual({ off: 0, len: 2 });
  });
  it('handles zero-length sample', () => {
    expect(normalizeLoop(0, 0)).toEqual({ off: 0, len: 0 });
  });
  it('keeps offset when at or above half', () => {
    expect(normalizeLoop(5000, 4000)).toEqual({ off: 4000, len: 1000 });
  });
});
