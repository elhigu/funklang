// Pure read-only queries over a Patch. No mutation, no events.

import type { Patch } from './types';

/** True when an instrument has at least one non-empty (fn ≠ 0) slot. */
function instrumentIsPopulated(ins: Patch['instruments'][number]): boolean {
  return ins.slots.some((s) => s.fn !== 0);
}

/**
 * Index of the first instrument with any non-empty slot, or 0 when the
 * whole patch is blank. Used to decide which instrument to focus when a
 * patch is loaded, restored from autosave, or reverted.
 */
export function firstPopulatedInstrument(patch: Patch): number {
  const idx = patch.instruments.findIndex(instrumentIsPopulated);
  return idx < 0 ? 0 : idx;
}

/** True when no instrument in the patch has any non-empty slot. */
export function isPatchBlank(patch: Patch): boolean {
  return !patch.instruments.some(instrumentIsPopulated);
}

/** True when the instrument at `idx` exists and has no non-empty slot. */
export function instrumentIsEmpty(patch: Patch, idx: number): boolean {
  const ins = patch.instruments[idx];
  return !ins || !instrumentIsPopulated(ins);
}
