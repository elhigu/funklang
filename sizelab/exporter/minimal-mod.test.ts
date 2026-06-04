import { describe, it, expect } from 'vitest';
import { minimalMod, MOD_LENGTH_EMPTY } from './minimal-mod';

describe('minimalMod', () => {
  it('is a 2108-byte valid M.K. module', () => {
    const m = minimalMod();
    expect(m.length).toBe(2108);
    expect(MOD_LENGTH_EMPTY).toBe(2108);
    expect(String.fromCharCode(m[1080]!, m[1081]!, m[1082]!, m[1083]!)).toBe('M.K.');
    expect(m[950]).toBe(1);   // songlength
    expect(m[951]).toBe(127); // restart
  });
  it('order table is all zero (one pattern)', () => {
    const m = minimalMod();
    for (let i = 952; i <= 1079; i++) expect(m[i]).toBe(0);
  });
});
