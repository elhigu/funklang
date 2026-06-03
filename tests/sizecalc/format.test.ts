import { describe, it, expect } from 'vitest';
import { fmtBytes } from '../../src/sizecalc/format';

describe('fmtBytes', () => {
  it('shows raw bytes below 1024', () => {
    expect(fmtBytes(0)).toBe('0 B');
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(1023)).toBe('1023 B');
  });
  it('shows one-decimal kB at and above 1024', () => {
    expect(fmtBytes(1024)).toBe('1.0 kB');
    expect(fmtBytes(1536)).toBe('1.5 kB');
    expect(fmtBytes(12288)).toBe('12.0 kB');
  });
  it('rounds estimate fractions to whole bytes first', () => {
    expect(fmtBytes(1209.6)).toBe('1.2 kB');
    expect(fmtBytes(700.4)).toBe('700 B');
  });
});
