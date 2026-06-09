import { describe, it, expect } from 'vitest';
import { csHex } from '../../src/codegen/hex';

describe('csHex (C# ToString("X"))', () => {
  it('uppercase, no leading zeros', () => {
    expect(csHex(0)).toBe('0');
    expect(csHex(12288)).toBe('3000');
    expect(csHex(255)).toBe('FF');
    expect(csHex(2748)).toBe('ABC');
  });
  it('negative ints print 8-digit twos-complement', () => {
    expect(csHex(-1)).toBe('FFFFFFFF');
  });
});
