import { describe, it, expect } from 'vitest';
import { parseAki, serializeAki } from '../../src/fileio/aki';
import { emptyInstrument, emptySlot } from '../../src/patch/types';
import type { Instrument } from '../../src/patch/types';

function makeInstrument(): Instrument {
  const ins = emptyInstrument(''); // .aki has no name on disk
  ins.sampleLength = 12345;
  ins.loopOffset = 100;
  ins.loopLength = 200;
  // a few non-empty slots, then trailing empties
  const s0 = emptySlot();
  s0.outVar = 1;
  s0.fn = 2;
  s0.instance = 3;
  s0.freq = -1;
  s0.freqVal = 32767;
  s0.gain = 5;
  s0.gainVal = 6;
  s0.width = 7;
  s0.widthVal = 8;
  s0.val1 = -32768;
  s0.val1Value = 9;
  s0.val2 = 10;
  s0.val2Value = 11;

  const s1 = emptySlot();
  s1.outVar = 4;
  s1.fn = 9;
  s1.gain = 12;

  ins.slots = [s0, s1];
  return ins;
}

describe('parseAki / serializeAki', () => {
  it('serializes to exactly 668 bytes', () => {
    const ins = makeInstrument();
    const bytes = serializeAki(ins);
    expect(bytes.length).toBe(668);
  });

  it('round-trips an instrument byte-for-byte', () => {
    const ins = makeInstrument();
    const bytes = serializeAki(ins);
    const parsed = parseAki(bytes);
    const bytes2 = serializeAki(parsed);
    expect(Array.from(bytes2)).toEqual(Array.from(bytes));
  });

  it('round-trips preserving non-empty slot fields', () => {
    const ins = makeInstrument();
    const bytes = serializeAki(ins);
    const parsed = parseAki(bytes);
    expect(parsed.name).toBe('');
    expect(parsed.sampleLength).toBe(12345);
    expect(parsed.loopOffset).toBe(100);
    expect(parsed.loopLength).toBe(200);
    expect(parsed.slots.length).toBe(2);
    expect(parsed.slots[0]).toEqual(ins.slots[0]);
    expect(parsed.slots[1]).toEqual(ins.slots[1]);
  });

  it('rejects wrong magic', () => {
    const bytes = new Uint8Array(668);
    expect(() => parseAki(bytes)).toThrow(/magic/i);
  });

  it('rejects wrong length', () => {
    const bytes = new Uint8Array(100);
    expect(() => parseAki(bytes)).toThrow(/668/);
  });
});
