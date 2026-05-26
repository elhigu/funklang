import { describe, it, expect } from 'vitest';
import { buildCloneGraph, allDependentsOf, isValidCloneSource } from '../../src/patch/clone-graph';
import { emptyPatch, emptySlot } from '../../src/patch/types';

describe('clone-graph', () => {
  it('empty patch yields empty maps', () => {
    const g = buildCloneGraph(emptyPatch());
    expect(g.sources.size).toBe(0);
    expect(g.dependents.size).toBe(0);
  });

  it('records both forward and reverse edges for fn=17 (clone)', () => {
    const p = emptyPatch();
    // instr 5 clones from instr 2
    p.instruments[5]!.slots.push({ ...emptySlot(), fn: 17, gain: 2, outVar: 1 });
    const g = buildCloneGraph(p);
    expect([...g.sources.get(5)!]).toEqual([2]);
    expect([...g.dependents.get(2)!]).toEqual([5]);
  });

  it('records fn=18 (chordgen) edges too', () => {
    const p = emptyPatch();
    p.instruments[3]!.slots.push({ ...emptySlot(), fn: 18, gain: 1, outVar: 1 });
    const g = buildCloneGraph(p);
    expect(g.dependents.get(1)?.has(3)).toBe(true);
  });

  it('ignores self-clones and out-of-range sources', () => {
    const p = emptyPatch();
    p.instruments[4]!.slots.push({ ...emptySlot(), fn: 17, gain: 4, outVar: 1 });
    p.instruments[4]!.slots.push({ ...emptySlot(), fn: 17, gain: 99, outVar: 1 });
    const g = buildCloneGraph(p);
    expect(g.sources.has(4)).toBe(false);
    expect(g.dependents.size).toBe(0);
  });

  it('allDependentsOf walks transitively (C ← B ← A means A depends on C)', () => {
    const p = emptyPatch();
    // B (instr 1) clones from C (instr 0)
    p.instruments[1]!.slots.push({ ...emptySlot(), fn: 17, gain: 0, outVar: 1 });
    // A (instr 2) clones from B (instr 1)
    p.instruments[2]!.slots.push({ ...emptySlot(), fn: 17, gain: 1, outVar: 1 });
    const g = buildCloneGraph(p);
    // Changes to C should bubble to both B and A.
    const deps = allDependentsOf(g, 0);
    expect([...deps].sort()).toEqual([1, 2]);
  });
});

describe('isValidCloneSource', () => {
  it.each([
    [0, 0, false],     // self
    [0, 1, false],     // higher
    [1, 0, true],      // first valid case
    [1, 1, false],     // self
    [1, 2, false],     // higher
    [2, 0, true],
    [2, 1, true],
    [2, 2, false],
    [2, 3, false],
    [30, 29, true],
    [30, 30, false],
    [5, -1, false],    // negative
  ])('active=%i, src=%i → %j', (active, src, expected) => {
    expect(isValidCloneSource(active, src)).toBe(expected);
  });
});
