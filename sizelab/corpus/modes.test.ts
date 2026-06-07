import { describe, it, expect } from 'vitest';
import { producerSlot, PRODUCER_FREQ, PRODUCER_GAIN } from './producer';
import { varOrConstParams, varSourceParams, modesFor, modeId } from './modes';

describe('producerSlot', () => {
  it('is an osc_sine with const freq/gain writing to the given var', () => {
    const s = producerSlot(2);
    expect(s.fn).toBe(4);
    expect(s.outVar).toBe(2);
    expect(s.freq).toBe(0); expect(s.freqVal).toBe(PRODUCER_FREQ);
    expect(s.gain).toBe(0); expect(s.gainVal).toBe(PRODUCER_GAIN);
  });
});

describe('param introspection (op-metadata driven)', () => {
  it('osc_saw (2) has freq+gain var-or-const, no var-source', () => {
    expect(varOrConstParams(2).map((p) => p.selector)).toEqual(['freq', 'gain']);
    expect(varSourceParams(2)).toEqual([]);
  });
  it('vol (1) has gain var-or-const and val1 var-source', () => {
    expect(varOrConstParams(1).map((p) => p.selector)).toEqual(['gain']);
    expect(varSourceParams(1)).toEqual(['val1']);
  });
});

describe('modesFor / modeId', () => {
  it('2-param op → all-const, each-single-var, all-var', () => {
    expect(modesFor(2)).toEqual([[false, false], [true, false], [false, true], [true, true]]);
    expect(modesFor(2).map(modeId)).toEqual(['cc', 'Vc', 'cV', 'VV']);
  });
  it('1-param op → const, var', () => {
    expect(modesFor(1).map(modeId)).toEqual(['c', 'V']);
  });
  it('0-var-or-const op → single empty mode', () => {
    expect(modesFor(14)).toEqual([[]]);
    expect(modeId([])).toBe('-');
  });
});
