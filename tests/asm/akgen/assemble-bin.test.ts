// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { emptyPatch, emptySlot } from '../../../src/patch/types';
import { assembleBin, exactBinSize } from '../../../src/asm/assemble-bin';

describe('assembleBin (Patch → exact .bin, fully in-browser)', () => {
  it('assembles a patch to non-empty bytes + reports exact size', async () => {
    const p = emptyPatch();
    p.instruments[0]!.name = 't';
    p.instruments[0]!.sampleLength = 4096;
    p.instruments[0]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1, freqVal: 500, gainVal: 64 }];
    const r = await assembleBin(p, { format: 'bin' });
    expect(r.ok).toBe(true);
    expect(r.size).toBe(r.bytes!.length);
    expect(r.size!).toBeGreaterThan(0);
    expect(await exactBinSize(p)).toBe(r.size);
  });
});
