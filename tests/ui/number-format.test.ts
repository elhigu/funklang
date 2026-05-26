import { describe, it, expect, beforeEach } from 'vitest';
import {
  formatInt, parseFlexInt, setDisplayBase, getDisplayBase,
  onDisplayBaseChange,
} from '../../src/ui/number-format';

beforeEach(() => { setDisplayBase('dec'); });

describe('formatInt', () => {
  it('formats decimal by default', () => {
    expect(formatInt(42)).toBe('42');
    expect(formatInt(-3)).toBe('-3');
  });

  it('formats hex with 0x prefix when base = hex', () => {
    setDisplayBase('hex');
    expect(formatInt(255)).toBe('0xFF');
    expect(formatInt(16)).toBe('0x10');
    expect(formatInt(-255)).toBe('-0xFF');
  });
});

describe('parseFlexInt', () => {
  it('accepts plain decimal strings', () => {
    expect(parseFlexInt('123')).toBe(123);
    expect(parseFlexInt('-7')).toBe(-7);
  });
  it('accepts 0x hex regardless of current base', () => {
    expect(parseFlexInt('0xFF')).toBe(255);
    expect(parseFlexInt('-0x10')).toBe(-16);
    expect(parseFlexInt('+0x1A')).toBe(26);
  });
  it('returns NaN for empty / garbage input', () => {
    expect(Number.isNaN(parseFlexInt(''))).toBe(true);
    expect(Number.isNaN(parseFlexInt('not a number'))).toBe(true);
  });
});

describe('onDisplayBaseChange', () => {
  it('fires listeners exactly when the base actually changes', () => {
    let n = 0;
    const off = onDisplayBaseChange(() => { n++; });
    setDisplayBase('hex'); expect(n).toBe(1);
    setDisplayBase('hex'); expect(n).toBe(1);          // no-op
    setDisplayBase('dec'); expect(n).toBe(2);
    off();
    setDisplayBase('hex'); expect(n).toBe(2);
  });

  it('getDisplayBase reflects the latest value', () => {
    expect(getDisplayBase()).toBe('dec');
    setDisplayBase('hex');
    expect(getDisplayBase()).toBe('hex');
  });
});
