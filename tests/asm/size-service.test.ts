// @vitest-environment node
//
// Exercises the exact-size service + ablation on the main-thread fallback
// (vitest/node has no Web Worker, so size-service assembles directly). Uses a
// real oracle-accepted patch so we know it assembles.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAkp } from '../../src/fileio/akp';
import { emptyPatch } from '../../src/patch/types';
import type { Patch } from '../../src/patch/types';
import { emptySlot } from '../../src/patch/types';
import { resetSlotForOp } from '../../src/schema/op-metadata';
import { exactSize, packedSize, _clearSizeCache } from '../../src/asm/size-service';
import { phaseCost, addOpCost, replaceOpCost } from '../../src/asm/size-ablation';

const REAL = join(__dirname, '..', '..', 'groundtruth', 'corpus', 'real');
const patch = parseAkp(new Uint8Array(readFileSync(join(REAL, 'ext_P01.akp'))));

function firstSlot(p: Patch): { i: number; s: number; fn: number } {
  for (let i = 0; i < p.instruments.length; i++) {
    const ins = p.instruments[i]!;
    for (let s = 0; s < ins.slots.length; s++) {
      if (ins.slots[s]!.fn !== 0) return { i, s, fn: ins.slots[s]!.fn };
    }
  }
  throw new Error('fixture has no filled slot');
}

beforeEach(() => _clearSizeCache());

describe('exactSize', () => {
  it('assembles a real patch to a positive byte count', async () => {
    const r = await exactSize(patch);
    expect(r.ok).toBe(true);
    expect(r.size!).toBeGreaterThan(0);
  });

  it('packedSize returns a Shrinkler-packed size smaller than the raw .bin', async () => {
    const r = await packedSize(patch);
    expect(r.ok).toBe(true);
    expect(r.raw!).toBeGreaterThan(0);
    expect(r.packed!).toBeGreaterThan(0);
    expect(r.packed!).toBeLessThan(r.raw!);
  });

  it('memoises identical patches (returns the cached result)', async () => {
    const a = await exactSize(patch);
    const b = await exactSize(patch);
    expect(b).toBe(a);
  });

  it('empty patch assembles and is smaller than a populated one', async () => {
    const empty = await exactSize(emptyPatch());
    const full = await exactSize(patch);
    expect(empty.ok).toBe(true);
    expect(full.ok).toBe(true);
    expect(empty.size!).toBeLessThan(full.size!);
  });
});

describe('ablation', () => {
  it('phaseCost frees a positive number of bytes for a real phase', async () => {
    const { i, s } = firstSlot(patch);
    const r = await phaseCost(patch, i, s);
    expect(r.ok).toBe(true);
    expect(r.bytes!).toBeGreaterThan(0);
  });

  it('addOpCost reports a POSITIVE byte delta (the added slot must actually emit)', async () => {
    // Regression: the added slot needs a valid outVar, else codegen skips it
    // (arrayvar==0 → continue) and every op falsely reports +0 B.
    const { i, fn } = firstSlot(patch);
    const r = await addOpCost(patch, i, fn);
    expect(r.ok).toBe(true);
    expect(r.bytes!).toBeGreaterThan(0);
  });

  it('replaceOpCost is NEGATIVE when changing a big op to a smaller one (reverb → add)', async () => {
    // Changing an existing slot's op can shrink the patch — the picker must be
    // able to show negatives, unlike insertion which only ever adds.
    const p = emptyPatch();
    const ins = p.instruments[0]!;
    ins.sampleLength = 12288;            // >2 so the instrument is emitted
    ins.name = 'test';
    ins.slots = [
      { ...resetSlotForOp(emptySlot(), 2), outVar: 1 },          // osc_saw writes v1
      { ...resetSlotForOp(emptySlot(), 13), outVar: 1, val1: 1 }, // reverb (large), reads v1
    ];
    const r = await replaceOpCost(p, 0, 1, 9);             // reverb → add (small)
    expect(r.ok).toBe(true);
    expect(r.bytes!).toBeLessThan(0);
  });
});
