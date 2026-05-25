import { describe, it, expect } from 'vitest';
import {
  minLoopOffset, maxLoopOffset, validLoopOffsets, clampLoopOffset, loopLengthFor,
} from '../../src/patch/loop-rules';

describe('loop-rules', () => {
  // Exact enumeration the user dictated for the rule.
  it.each([
    [2,  [0]],
    [4,  [2]],
    [6,  [2, 4]],
    [8,  [4, 6]],
    [10, [4, 6, 8]],
    [12, [6, 8, 10]],
    [16, [8, 10, 12, 14]],
  ])('validLoopOffsets(SL=%i) = %j', (sl, expected) => {
    expect(validLoopOffsets(sl)).toEqual(expected);
  });

  describe('minLoopOffset / maxLoopOffset', () => {
    it('min is floor(SL/4)*2', () => {
      expect(minLoopOffset(2)).toBe(0);
      expect(minLoopOffset(4)).toBe(2);
      expect(minLoopOffset(6)).toBe(2);
      expect(minLoopOffset(8)).toBe(4);
      expect(minLoopOffset(10)).toBe(4);
      expect(minLoopOffset(100)).toBe(50);
      expect(minLoopOffset(101)).toBe(50);  // rounds down
    });
    it('max is SL - 2 (leaves at least 2 samples in the loop)', () => {
      expect(maxLoopOffset(2)).toBe(0);
      expect(maxLoopOffset(4)).toBe(2);
      expect(maxLoopOffset(10)).toBe(8);
      expect(maxLoopOffset(8192)).toBe(8190);
    });
    it('handles SL=0 / negative defensively', () => {
      expect(minLoopOffset(0)).toBe(0);
      expect(maxLoopOffset(0)).toBe(0);
      expect(validLoopOffsets(0)).toEqual([]);
    });
  });

  describe('clampLoopOffset', () => {
    it('snaps below-min up to min', () => {
      expect(clampLoopOffset(10, 0)).toBe(4);
      expect(clampLoopOffset(10, 3)).toBe(4);
    });
    it('snaps above-max down to max', () => {
      expect(clampLoopOffset(10, 999)).toBe(8);
    });
    it('snaps odd values down to nearest even', () => {
      expect(clampLoopOffset(10, 5)).toBe(4);   // 5 → 4 (still ≥ min)
      expect(clampLoopOffset(10, 7)).toBe(6);
    });
    it('keeps valid values as-is', () => {
      expect(clampLoopOffset(10, 6)).toBe(6);
      expect(clampLoopOffset(2,  0)).toBe(0);
    });
  });

  describe('loopLengthFor', () => {
    it('always equals sampleLength - loopOffset', () => {
      expect(loopLengthFor(10, 4)).toBe(6);
      expect(loopLengthFor(8192, 4096)).toBe(4096);
    });
    it('never negative', () => {
      expect(loopLengthFor(4, 10)).toBe(0);
    });
  });
});
