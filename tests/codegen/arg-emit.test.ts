import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { renderArgs, VARTEXT } from '../../src/codegen/arg-emit';

describe('renderArgs', () => {
  it('VARTEXT table', () => {
    expect(VARTEXT).toEqual(['', 'v1', 'v2', 'v3', 'v4']);
  });

  it('renders instance(l), VARLIT var vs literal, joined by ", "', () => {
    const slot = { ...emptySlot(), freq: 2, freqVal: 999, gain: 0, gainVal: 64 };
    const s = renderArgs(slot, 3, [
      { kind: 'instance' },
      { kind: 'varlit', sel: 'freq', lit: 'freqVal' },
      { kind: 'varlit', sel: 'gain', lit: 'gainVal' },
    ]);
    expect(s).toBe('3, v2, 64'); // freq selector 2 → v2; gain selector 0 → literal 64
  });

  it('VAR emits only the var name; RAW emits raw decimal; SMP/ZERO literal', () => {
    const slot = { ...emptySlot(), val1: 1, gain: 5 };
    expect(renderArgs(slot, 0, [{ kind: 'smp' }])).toBe('smp');
    expect(renderArgs(slot, 0, [{ kind: 'zero' }])).toBe('0');
    expect(renderArgs(slot, 0, [{ kind: 'var', field: 'val1' }])).toBe('v1');
    expect(renderArgs(slot, 0, [{ kind: 'raw', field: 'gain' }])).toBe('5');
    expect(renderArgs(slot, 0, [{ kind: 'baseadr', field: 'gain' }])).toBe('BaseAdr[5]');
  });
});
