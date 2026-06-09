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
import { exactSize, _clearSizeCache } from '../../src/asm/size-service';
import { phaseCost, addOpCost } from '../../src/asm/size-ablation';

const REAL = join(__dirname, '..', '..', 'sizelab', 'corpus', 'real');
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

  it('addOpCost reports a non-negative byte delta for an already-used op', async () => {
    const { i, fn } = firstSlot(patch);
    const r = await addOpCost(patch, i, fn);
    expect(r.ok).toBe(true);
    expect(r.bytes!).toBeGreaterThanOrEqual(0);
  });
});
