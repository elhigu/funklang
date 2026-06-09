// Context-aware per-phase costs: what a phase costs / frees IN THE CURRENT PATCH.
//
// An op's routine code is SHARED by every phase using that op, so it's only paid
// once (first use) and only freed when the LAST use is removed. The connection
// code is per-use. These are recomputed whenever the patch changes, so e.g.
// deleting one of two reverb phases makes the remaining one "own" the routine.
import type { Patch } from '../patch/types';
import type { CalibrationData } from './calibration-data';
import { slotVarOperands } from './code-size';

export interface SlotLoc { instrIdx: number; slotIdx: number; }

export interface PhaseMarginal {
  fn: number;
  /** Bytes freed if this phase is removed (routine only if it's the last use). */
  freed: number;
  /** True if this is the only remaining phase using its op (its routine is at stake). */
  lastUse: boolean;
  /** The op's shared routine bytes (freed only on last use). */
  routine: number;
  /** This phase's connection bytes (always freed). */
  connection: number;
  /** Extra bytes from this phase's variable operands. */
  varBytes: number;
  /** How many phases (incl. this one) use this op. */
  opUses: number;
  /** The other phases sharing this op's routine. */
  sharedWith: SlotLoc[];
}

export interface AddCost {
  /** Bytes adding one phase of `op` would cost in this patch. */
  cost: number;
  routine: number;
  connection: number;
  /** True if the op is already used elsewhere (so its routine is already paid). */
  alreadyPresent: boolean;
}

function opUseLocations(patch: Patch, fn: number): SlotLoc[] {
  const locs: SlotLoc[] = [];
  for (let i = 0; i < patch.instruments.length; i++) {
    const slots = patch.instruments[i]!.slots;
    for (let s = 0; s < slots.length; s++) if (slots[s]!.fn === fn) locs.push({ instrIdx: i, slotIdx: s });
  }
  return locs;
}

/** Cost of adding one phase of `op` to the patch as it currently stands. */
export function addCost(patch: Patch, op: number, cal: CalibrationData): AddCost {
  const present = opUseLocations(patch, op).length > 0;
  const routine = cal.opRoutine[op] ?? 0;
  const connection = cal.opConnection[op] ?? 0;
  return { cost: (present ? 0 : routine) + connection, routine, connection, alreadyPresent: present };
}

/** Cost freed by removing the phase at (instrIdx, slotIdx), in current context. */
export function phaseMarginal(patch: Patch, instrIdx: number, slotIdx: number, cal: CalibrationData): PhaseMarginal | null {
  const slot = patch.instruments[instrIdx]?.slots[slotIdx];
  if (!slot || slot.fn === 0) return null;
  const fn = slot.fn;
  const locs = opUseLocations(patch, fn);
  const lastUse = locs.length <= 1;
  const routine = cal.opRoutine[fn] ?? 0;
  const connection = cal.opConnection[fn] ?? 0;
  const varBytes = (cal.perVarOperand ?? 0) * slotVarOperands(slot);
  return {
    fn,
    freed: (lastUse ? routine : 0) + connection + varBytes,
    lastUse,
    routine,
    connection,
    varBytes,
    opUses: locs.length,
    sharedWith: locs.filter((l) => l.instrIdx !== instrIdx || l.slotIdx !== slotIdx),
  };
}
