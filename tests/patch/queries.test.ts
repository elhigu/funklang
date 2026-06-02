import { describe, it, expect } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import type { Patch } from '../../src/patch/types';
import { firstPopulatedInstrument, isPatchBlank, instrumentIsEmpty } from '../../src/patch/queries';

function populate(p: Patch, idx: number): void {
  p.instruments[idx]!.slots.push({ ...emptySlot(), fn: 2, outVar: 1 });
}

describe('firstPopulatedInstrument', () => {
  it('returns 0 for a blank patch', () => {
    expect(firstPopulatedInstrument(emptyPatch())).toBe(0);
  });

  it('returns the index of the first instrument with a non-empty slot', () => {
    const p = emptyPatch();
    populate(p, 3);
    populate(p, 5);
    expect(firstPopulatedInstrument(p)).toBe(3);
  });

  it('ignores instruments that hold only fn=0 slots', () => {
    const p = emptyPatch();
    p.instruments[1]!.slots.push(emptySlot());   // fn=0 placeholder, not populated
    populate(p, 4);
    expect(firstPopulatedInstrument(p)).toBe(4);
  });
});

describe('isPatchBlank', () => {
  it('is true for an empty patch and false once any slot is filled', () => {
    const p = emptyPatch();
    expect(isPatchBlank(p)).toBe(true);
    populate(p, 7);
    expect(isPatchBlank(p)).toBe(false);
  });

  it('stays blank when an instrument has only fn=0 slots', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots.push(emptySlot());
    expect(isPatchBlank(p)).toBe(true);
  });
});

describe('instrumentIsEmpty', () => {
  it('is true for an out-of-range index', () => {
    expect(instrumentIsEmpty(emptyPatch(), 999)).toBe(true);
  });

  it('reflects whether that specific instrument has a filled slot', () => {
    const p = emptyPatch();
    populate(p, 2);
    expect(instrumentIsEmpty(p, 2)).toBe(false);
    expect(instrumentIsEmpty(p, 3)).toBe(true);
  });
});
