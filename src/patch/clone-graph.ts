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
import { isCrossInstrumentOp } from '../dsp/op-metadata';

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
      // clone + chordgen pull from a source instrument (slot.gain).
      if (!isCrossInstrumentOp(slot.fn)) continue;
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
 * Per Klang's ordering rule: instrument N may only clone from instruments
 * < N. (Instrument 0 has no valid source.) Used both for filtering the
 * clone-source dropdown and for marking already-stored invalid sources
 * with a warning.
 */
export function isValidCloneSource(
  activeInstrIdx: number,
  candidateSrcIdx: number,
): boolean {
  return candidateSrcIdx >= 0 && candidateSrcIdx < activeInstrIdx;
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
