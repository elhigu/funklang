import { describe, it, expect } from 'vitest';
import { opInstrument, CALIB_SAMPLE_LENGTH } from './op-instruments';

describe('opInstrument', () => {
  it('osc_saw all-const: one phase, no producers, v1 output, literal freq/gain', () => {
    const { instrument, producerCount } = opInstrument(2, [false, false]);
    expect(producerCount).toBe(0);
    expect(instrument.sampleLength).toBe(CALIB_SAMPLE_LENGTH);
    expect(instrument.slots).toHaveLength(1);
    const op = instrument.slots[0]!;
    expect(op.fn).toBe(2); expect(op.outVar).toBe(1);
    expect(op.freq).toBe(0); expect(op.gain).toBe(0);
  });

  it('osc_saw all-var: two sine producers feed v2/v3, op selectors point at them', () => {
    const { instrument, producerCount } = opInstrument(2, [true, true]);
    expect(producerCount).toBe(2);
    expect(instrument.slots).toHaveLength(3);
    expect(instrument.slots[0]!.fn).toBe(4); expect(instrument.slots[0]!.outVar).toBe(2);
    expect(instrument.slots[1]!.fn).toBe(4); expect(instrument.slots[1]!.outVar).toBe(3);
    const op = instrument.slots[2]!;
    expect(op.fn).toBe(2); expect(op.outVar).toBe(1);
    expect(op.freq).toBe(2);
    expect(op.gain).toBe(3);
  });

  it('vol: val1 var-source always gets a producer; gain const mode keeps a mid literal', () => {
    const { instrument, producerCount } = opInstrument(1, [false]);
    expect(producerCount).toBe(1);
    const op = instrument.slots.at(-1)!;
    expect(op.fn).toBe(1); expect(op.outVar).toBe(1);
    expect(op.val1).toBe(2);
    expect(op.gain).toBe(0);
    expect(op.gainVal).toBeGreaterThan(0);
  });
});
