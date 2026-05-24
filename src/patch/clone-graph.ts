// Clone dependency graph derived from a Patch.
//
// A slot with `fn === 17` (clone) — or `fn === 18` (chordgen) — pulls a
// sample from a "source" instrument identified by `slot.gain`. The editor
// needs the reverse direction: "if instrument S changes, which other
// instruments must I re-render because they reference S?"
//
// Use `buildCloneGraph(patch)` once after load and re-run on structure
// changes (slot insert/remove/move). The map is small (≤ 31×31) so we
// don't bother with incremental updates.

import type { Patch } from './types';

export interface CloneGraph {
  /** sources.get(I) = set of instrument indices I clones FROM. */
  sources: Map<number, Set<number>>;
  /** dependents.get(S) = set of instrument indices that clone S. */
  dependents: Map<number, Set<number>>;
}

export function buildCloneGraph(patch: Patch): CloneGraph {
  const sources = new Map<number, Set<number>>();
  const dependents = new Map<number, Set<number>>();
  for (let i = 0; i < patch.instruments.length; i++) {
    const ins = patch.instruments[i]!;
    for (const slot of ins.slots) {
      // Both clone (17) and chordgen (18) pull from a source instrument.
      if (slot.fn !== 17 && slot.fn !== 18) continue;
      const src = slot.gain;
      if (src < 0 || src >= patch.instruments.length) continue;
      if (src === i) continue; // self-references are ignored
      let srcSet = sources.get(i);
      if (!srcSet) { srcSet = new Set(); sources.set(i, srcSet); }
      srcSet.add(src);
      let depSet = dependents.get(src);
      if (!depSet) { depSet = new Set(); dependents.set(src, depSet); }
      depSet.add(i);
    }
  }
  return { sources, dependents };
}

/**
 * Walk dependents transitively. If A clones B and B clones C, then
 * editing C should refresh both B and A.
 */
export function allDependentsOf(
  graph: CloneGraph,
  instrIdx: number,
): Set<number> {
  const out = new Set<number>();
  const stack: number[] = [instrIdx];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    const deps = graph.dependents.get(cur);
    if (!deps) continue;
    for (const d of deps) {
      if (out.has(d)) continue;
      out.add(d);
      stack.push(d);
    }
  }
  return out;
}
