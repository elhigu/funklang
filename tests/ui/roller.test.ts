import { describe, it, expect } from 'vitest';
import { rollerNotches, applyRoller, wrapIndex, swipeRows } from '../../src/ui/roller';

describe('rollerNotches', () => {
  it('truncates drag distance to whole notches, preserving sign', () => {
    expect(rollerNotches(30, 12)).toBe(2);     // 30/12 = 2.5 → 2
    expect(rollerNotches(-30, 12)).toBe(-2);   // toward −
    expect(rollerNotches(5, 12)).toBe(0);      // below one notch
  });
  it('is 0 for a non-positive pxPerNotch', () => {
    expect(rollerNotches(100, 0)).toBe(0);
  });
});

describe('applyRoller', () => {
  it('applies notches × step from the START value', () => {
    expect(applyRoller(50, 3, 10, 0, 255)).toBe(80);    // +30
    expect(applyRoller(50, -2, 10, 0, 255)).toBe(30);   // −20
  });
  it('clamps to [min, max]', () => {
    expect(applyRoller(250, 3, 10, 0, 255)).toBe(255);
    expect(applyRoller(5, -3, 10, 0, 255)).toBe(0);
  });
  it('a step-2 roller from an even start stays even', () => {
    expect(applyRoller(10, 5, 2, 0, 254)).toBe(20);
  });
});

describe('wrapIndex', () => {
  it('wraps forward and backward past the ends', () => {
    expect(wrapIndex(0, 3, +1)).toBe(1);
    expect(wrapIndex(2, 3, +1)).toBe(0);   // wrap to start
    expect(wrapIndex(0, 3, -1)).toBe(2);   // wrap to end
  });
  it('is 0 for an empty list', () => {
    expect(wrapIndex(0, 0, +1)).toBe(0);
  });
});

describe('swipeRows', () => {
  it('counts rows of travel (up-positive)', () => {
    expect(swipeRows(140, 60)).toBe(2);
    expect(swipeRows(-140, 60)).toBe(-2);
    expect(swipeRows(40, 60)).toBe(0);
  });
});
