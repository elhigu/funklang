// src/asm/size-ablation.ts
//
// Exact per-phase and per-op size deltas by ABLATION: assemble a variant patch
// and diff its exact .bin size against the original. Because the asm build is
// deterministic, size(full) − size(without one phase) is the EXACT number of
// bytes that phase contributes in the current context — it automatically
// accounts for shared op routines (removing a non-last use frees only the
// connection; removing the last use frees the routine too).
//
// Variants are produced on a structural clone of the patch, so the live patch
// is never mutated. Results ride the size-service cache (keyed by generated
// asm), so re-opening the breakdown or re-hovering an op is instant.
import type { Patch } from '../patch/types';
import { emptySlot, N_SLOTS_MAX } from '../patch/types';
import { applyInsertDefaults } from '../schema/op-metadata';
import { pickSmartOutVar } from '../patch/smart-out-var';
import { exactSize } from './size-service';

function clonePatch(p: Patch): Patch {
  return structuredClone(p);
}

/** Patch with the op at (instrIdx, slotIdx) blanked (fn=0 → omitted by codegen). */
export function patchWithoutSlot(patch: Patch, instrIdx: number, slotIdx: number): Patch {
  const c = clonePatch(patch);
  const ins = c.instruments[instrIdx];
  if (ins && ins.slots[slotIdx]) ins.slots[slotIdx] = emptySlot();
  return c;
}

/** Patch with `op` added (default args) to `instrIdx` — reusing a blank padded
 *  slot when present, otherwise appended. Null if the instrument is missing or
 *  already at the hard slot cap. */
export function patchWithAddedOp(patch: Patch, instrIdx: number, op: number): Patch | null {
  const c = clonePatch(patch);
  const ins = c.instruments[instrIdx];
  if (!ins) return null;
  const free = ins.slots.findIndex((s) => s.fn === 0);
  const at = free >= 0 ? free : ins.slots.length;
  if (free < 0 && ins.slots.length >= N_SLOTS_MAX) return null;
  // Mirror the real insert: give the new slot a valid output variable. Codegen
  // SKIPS slots whose outVar is 0 (`arrayvar==0 → continue`), so an outVar-0
  // slot would assemble identically to the original and report +0 bytes.
  const outVar = pickSmartOutVar(ins, at) || 1;
  const slot = applyInsertDefaults({ ...emptySlot(), fn: op, outVar }, op);
  if (free >= 0) ins.slots[free] = slot;
  else ins.slots.push(slot);
  return c;
}

export interface DeltaResult {
  ok: boolean;
  /** Signed byte delta (freed for phaseCost, added for addOpCost). */
  bytes?: number;
  error?: string;
}

/** Exact bytes that deleting one phase frees, in the current patch context. */
export async function phaseCost(patch: Patch, instrIdx: number, slotIdx: number): Promise<DeltaResult> {
  const [full, without] = await Promise.all([
    exactSize(patch),
    exactSize(patchWithoutSlot(patch, instrIdx, slotIdx)),
  ]);
  if (!full.ok || !without.ok) return { ok: false, error: full.error ?? without.error ?? 'unavailable' };
  return { ok: true, bytes: full.size! - without.size! };
}

/** Exact bytes that adding `op` to `instrIdx` would cost, in the current context. */
export async function addOpCost(patch: Patch, instrIdx: number, op: number): Promise<DeltaResult> {
  const variant = patchWithAddedOp(patch, instrIdx, op);
  if (!variant) return { ok: false, error: 'no free slot in instrument' };
  const [full, withOp] = await Promise.all([exactSize(patch), exactSize(variant)]);
  if (!full.ok || !withOp.ok) return { ok: false, error: full.error ?? withOp.error ?? 'unavailable' };
  return { ok: true, bytes: withOp.size! - full.size! };
}

/** True iff any slot in the patch already uses `op`. */
export function patchHasOp(patch: Patch, op: number): boolean {
  return patch.instruments.some((ins) => ins.slots.some((s) => s.fn === op));
}
