import { describe, it, expect } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import type { Patch } from '../../src/patch/types';
import { tunableParams, paramIndex } from '../../src/ui/param-list';

function withSlots(slots: Array<Partial<ReturnType<typeof emptySlot>>>, instrIdx = 0): Patch {
  const p = emptyPatch();
  p.instruments[instrIdx]!.slots = slots.map((s) => ({ ...emptySlot(), ...s }));
  return p;
}

describe('tunableParams', () => {
  it('lists const-mode var-or-const knobs in order (osc_saw → freq, gain)', () => {
    const p = withSlots([{ fn: 2, outVar: 1, freqVal: 1000, gainVal: 80 }]); // osc_saw, all const
    const list = tunableParams(p, 0);
    expect(list.map((x) => x.label)).toEqual(['freq', 'gain']);
    expect(list[0]).toMatchObject({ field: 'freqVal', min: 0, max: 10000, scale: 'pow', value: 1000 });
    expect(list[1]).toMatchObject({ field: 'gainVal', min: 0, max: 128, value: 80 });
  });

  it('skips a var-or-const param sourced from a variable (not const)', () => {
    const p = withSlots([{ fn: 2, outVar: 1, freq: 1 /* freq ← v1, not const */, gainVal: 80 }]);
    const list = tunableParams(p, 0);
    expect(list.map((x) => x.label)).toEqual(['gain']);     // freq dropped
  });

  it('includes a const-int and applies the clone-offset step 2 + dynamic max', () => {
    const p = emptyPatch();
    p.instruments[0]!.sampleLength = 256;                    // clone SOURCE
    p.instruments[0]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1 }];
    // instrument 1 clones instrument 0: gain = source index 0, freq const.
    p.instruments[1]!.slots = [{ ...emptySlot(), fn: 17, gain: 0, val2Value: 10 }];
    const list = tunableParams(p, 1);
    const offset = list.find((x) => x.label === 'offset')!;
    expect(offset).toMatchObject({ field: 'val2Value', step: 2, min: 0, max: 254 /* SL−2 */ });
  });

  it('returns [] for an empty instrument and skips fn=0 slots', () => {
    expect(tunableParams(emptyPatch(), 0)).toEqual([]);
    const p = withSlots([{ fn: 0 }, { fn: 2, outVar: 1 }]);
    expect(tunableParams(p, 0).every((x) => x.slotIdx === 1)).toBe(true);
  });

  it('paramIndex finds an entry and returns -1 when absent', () => {
    const p = withSlots([{ fn: 2, outVar: 1 }]);
    const list = tunableParams(p, 0);
    expect(paramIndex(list, 0, 'gainVal')).toBe(1);
    expect(paramIndex(list, 9, 'gainVal')).toBe(-1);
  });
});
