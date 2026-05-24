import { describe, it, expect } from 'vitest';
import { BinReader, BinWriter } from '../../src/fileio/binio';

describe('BinWriter + BinReader', () => {
  it('round-trips Int32 LE (-12345 and 0x7fffffff)', () => {
    const w = new BinWriter();
    w.i32(-12345);
    w.i32(0x7fffffff);
    const bytes = w.toUint8();
    const r = new BinReader(bytes);
    expect(r.i32()).toBe(-12345);
    expect(r.i32()).toBe(0x7fffffff);
  });

  it('round-trips Int16 LE (-1 and 32767)', () => {
    const w = new BinWriter();
    w.i16(-1);
    w.i16(32767);
    const r = new BinReader(w.toUint8());
    expect(r.i16()).toBe(-1);
    expect(r.i16()).toBe(32767);
  });

  it('round-trips UByte (0 and 255)', () => {
    const w = new BinWriter();
    w.u8(0);
    w.u8(255);
    const r = new BinReader(w.toUint8());
    expect(r.u8()).toBe(0);
    expect(r.u8()).toBe(255);
  });

  it("round-trips .NET-style 7-bit-length-prefixed UTF-8 string 'hello'", () => {
    const w = new BinWriter();
    w.cstr('hello');
    const bytes = w.toUint8();
    // 1-byte length prefix (5), then 5 ASCII bytes
    expect(bytes.length).toBe(6);
    expect(bytes[0]).toBe(5);
    const r = new BinReader(bytes);
    expect(r.cstr()).toBe('hello');
  });

  it('round-trips a 200-char string (multi-byte LEB128 length prefix)', () => {
    const s = 'x'.repeat(200);
    const w = new BinWriter();
    w.cstr(s);
    const bytes = w.toUint8();
    // 200 -> LEB128: 0xC8 0x01 -> 2 bytes
    expect(bytes[0]).toBe(0xc8);
    expect(bytes[1]).toBe(0x01);
    expect(bytes.length).toBe(2 + 200);
    const r = new BinReader(bytes);
    expect(r.cstr()).toBe(s);
  });

  it('BinReader throws RangeError with byte offset on truncated input', () => {
    const r = new BinReader(new Uint8Array([0x01, 0x02])); // 2 bytes
    r.u8(); // ok
    expect(() => r.i32()).toThrow(/unexpected EOF: needed 4 bytes at offset 1/);
  });

  it('BinReader throws on truncated string content', () => {
    // length prefix says 10, but only 3 bytes follow
    const bytes = new Uint8Array([10, 65, 66, 67]);
    const r = new BinReader(bytes);
    expect(() => r.cstr()).toThrow(/unexpected EOF/);
  });
});
