// Patches loaded from disk can contain odd sample lengths or loop
// offsets that violate the Klang rules (Klang's GUI never enforces
// them, and a hand-edited .akp can hold anything). `normalizePatch`
// is the boundary fix-up: clamp sampleLength to the nearest even
// value, then re-snap loopOffset / recompute loopLength so the in-
// memory patch is always internally consistent before the editor
// touches it.

import { describe, it, expect } from 'vitest';
import { emptyPatch } from '../../src/patch/types';
import { normalizePatch } from '../../src/patch/normalize';

describe('normalizePatch', () => {
  it('rounds odd sampleLength DOWN to the nearest even value', () => {
    const p = emptyPatch();
    p.instruments[0]!.sampleLength = 1023;
    normalizePatch(p);
    expect(p.instruments[0]!.sampleLength).toBe(1022);
  });

  it('leaves an already-even sampleLength untouched', () => {
    const p = emptyPatch();
    p.instruments[0]!.sampleLength = 2048;
    p.instruments[0]!.loopOffset = 1024;
    p.instruments[0]!.loopLength = 1024;
    normalizePatch(p);
    expect(p.instruments[0]!.sampleLength).toBe(2048);
    expect(p.instruments[0]!.loopOffset).toBe(1024);
    expect(p.instruments[0]!.loopLength).toBe(1024);
  });

  it('snaps loopOffset to the valid even range after rounding sampleLength', () => {
    const p = emptyPatch();
    // SL=1023 → 1022 → min loop offset = floor(1022/4)*2 = 510, max = 1020.
    p.instruments[0]!.sampleLength = 1023;
    p.instruments[0]!.loopOffset = 5;       // way below min, also odd
    p.instruments[0]!.loopLength = 1018;
    normalizePatch(p);
    expect(p.instruments[0]!.sampleLength).toBe(1022);
    expect(p.instruments[0]!.loopOffset).toBe(510);
    // loopLength is derived from SL − loopOffset.
    expect(p.instruments[0]!.loopLength).toBe(512);
  });

  it('handles sampleLength = 0 by leaving loopOffset/Length at 0', () => {
    const p = emptyPatch();
    p.instruments[0]!.sampleLength = 0;
    p.instruments[0]!.loopOffset = 999;
    p.instruments[0]!.loopLength = 999;
    normalizePatch(p);
    expect(p.instruments[0]!.sampleLength).toBe(0);
    expect(p.instruments[0]!.loopOffset).toBe(0);
    expect(p.instruments[0]!.loopLength).toBe(0);
  });

  it('walks every instrument in the patch', () => {
    const p = emptyPatch();
    p.instruments[3]!.sampleLength = 999;
    p.instruments[7]!.sampleLength = 2001;
    normalizePatch(p);
    expect(p.instruments[3]!.sampleLength).toBe(998);
    expect(p.instruments[7]!.sampleLength).toBe(2000);
  });
});
