import { describe, it, expect } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import type { Patch } from '../../src/patch/types';
import { isInstrumentValid } from '../../src/patch/validation';

function patchWith(mutate: (p: Patch) => void): Patch {
  const p = emptyPatch();
  mutate(p);
  return p;
}

describe('isInstrumentValid — empty instruments', () => {
  it('an instrument with no filled slots is valid (nothing to be wrong)', () => {
    const p = emptyPatch();
    expect(isInstrumentValid(p, 0)).toBe(true);
  });
});

describe('isInstrumentValid — var-source / var-or-const wiring', () => {
  it('var-source pointing at an UNwritten variable is invalid', () => {
    // vol (fn=1) has a single var-source `val1`. Picking v2 when no
    // earlier slot writes v2 must flag the instrument invalid.
    const p = patchWith((p) => {
      p.instruments[0]!.slots.push({ ...emptySlot(), fn: 1, outVar: 1, val1: 2 });
    });
    expect(isInstrumentValid(p, 0)).toBe(false);
  });

  it('var-source pointing at a previously-written variable is valid', () => {
    // osc_saw → v1 ; then vol with val1 = v1 (legal: v1 was written above).
    const p = patchWith((p) => {
      p.instruments[0]!.slots.push({ ...emptySlot(), fn: 2, outVar: 1, freqVal: 1000, gainVal: 80 });
      p.instruments[0]!.slots.push({ ...emptySlot(), fn: 1, outVar: 1, val1: 1 });
    });
    expect(isInstrumentValid(p, 0)).toBe(true);
  });

  it('var-source pointing at a var written by a LATER slot is valid (feedback)', () => {
    // vol reads v2 ; a LATER osc_saw writes v2. The variable bank persists
    // across samples, so this is a one-sample feedback loop — intentional,
    // NOT silence. The instrument must NOT be flagged red.
    const p = patchWith((p) => {
      p.instruments[0]!.slots.push({ ...emptySlot(), fn: 1, outVar: 1, val1: 2 });
      p.instruments[0]!.slots.push({ ...emptySlot(), fn: 2, outVar: 2, freqVal: 1000, gainVal: 80 });
    });
    expect(isInstrumentValid(p, 0)).toBe(true);
  });

  it('OPTIONAL var-source value 0 ("—") is allowed (vol: allowNone)', () => {
    const p = patchWith((p) => {
      p.instruments[0]!.slots.push({ ...emptySlot(), fn: 1, outVar: 1, val1: 0 });
    });
    expect(isInstrumentValid(p, 0)).toBe(true);
  });

  it('REQUIRED var-source left unset is invalid (reverb needs an input)', () => {
    // reverb (fn=13) val1 is a required var-source (allowNone:false). With it
    // unset the patch can't even assemble/size, so the instrument is red.
    const p = patchWith((p) => {
      p.instruments[0]!.slots.push({ ...emptySlot(), fn: 13, outVar: 1, val1: 0 });
    });
    expect(isInstrumentValid(p, 0)).toBe(false);
  });

  it('REQUIRED var-source wired to a written var is valid', () => {
    const p = patchWith((p) => {
      p.instruments[0]!.slots.push({ ...emptySlot(), fn: 2, outVar: 1, freqVal: 1000, gainVal: 80 });
      p.instruments[0]!.slots.push({ ...emptySlot(), fn: 13, outVar: 1, val1: 1 });   // reverb reads v1
    });
    expect(isInstrumentValid(p, 0)).toBe(true);
  });

  it('var-or-const selector pointing at an UNwritten var is invalid', () => {
    // osc_saw (fn=2): `gain` is var-or-const. Selector field = `gain`,
    // value field = `gainVal`. Selector > 0 + no earlier outVar writes it.
    const p = patchWith((p) => {
      p.instruments[0]!.slots.push({
        ...emptySlot(), fn: 2, outVar: 1, freqVal: 1000, gain: 3, gainVal: 80,
      });
    });
    expect(isInstrumentValid(p, 0)).toBe(false);
  });
});

describe('isInstrumentValid — clone/chordgen source ordering', () => {
  it('clone whose source >= current instrument index is invalid', () => {
    // Instrument 2 clones instrument 2 (self) — illegal.
    const p = patchWith((p) => {
      p.instruments[2]!.slots.push({ ...emptySlot(), fn: 17, outVar: 1, gain: 2 });
    });
    expect(isInstrumentValid(p, 2)).toBe(false);
  });

  it('clone whose source is a LOWER-indexed instrument is valid', () => {
    const p = patchWith((p) => {
      // Instrument 0 must actually produce something for instr 2's clone
      // to reference, but validation here is purely about the SOURCE index
      // — instrument 0 doesn't need filled slots.
      p.instruments[2]!.slots.push({ ...emptySlot(), fn: 17, outVar: 1, gain: 0 });
    });
    expect(isInstrumentValid(p, 2)).toBe(true);
  });

  it('chordgen with higher-or-equal source index is invalid', () => {
    const p = patchWith((p) => {
      p.instruments[3]!.slots.push({ ...emptySlot(), fn: 18, outVar: 1, gain: 5 });
    });
    expect(isInstrumentValid(p, 3)).toBe(false);
  });

  it('instrument 0 with a clone slot is ALWAYS invalid (no valid source exists)', () => {
    const p = patchWith((p) => {
      p.instruments[0]!.slots.push({ ...emptySlot(), fn: 17, outVar: 1, gain: 0 });
    });
    expect(isInstrumentValid(p, 0)).toBe(false);
  });
});
