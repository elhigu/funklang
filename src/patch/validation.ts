// Per-instrument validation. Used by the sidebar to flash a row RED when
// any of its slots reference a variable that NO slot writes (true silence),
// or when a clone/chordgen targets an out-of-order source instrument.
//
// A read of a variable written only by a LATER slot is NOT an error: the DSP
// variable bank persists across samples, so it picks up that slot's previous-
// sample value — a deliberate one-sample feedback loop (see var-refs.ts, shown
// cyan in the row dropdowns). So we validate against EVERY writer in the
// instrument, not just earlier ones — only a var with no writer at all is red.

import { opByCode } from '../schema/op-metadata';
import { isValidCloneSource } from './clone-graph';
import type { Patch, Slot } from './types';

export function isInstrumentValid(patch: Patch, instrIdx: number): boolean {
  const ins = patch.instruments[instrIdx];
  if (!ins) return true;
  // Every variable written by any non-empty slot (earlier OR later = feedback).
  const written = new Set<number>();
  for (const slot of ins.slots) {
    if (slot.fn !== 0 && slot.outVar > 0) written.add(slot.outVar);
  }
  for (const slot of ins.slots) {
    if (slot.fn === 0) continue;       // empty slot — UI hides it
    if (!slotIsValid(slot, instrIdx, written)) return false;
  }
  return true;
}

function slotIsValid(slot: Slot, instrIdx: number, written: ReadonlySet<number>): boolean {
  const op = opByCode(slot.fn);
  if (!op) return true;                // unknown op — don't claim invalidity
  for (const p of op.params) {
    switch (p.type.kind) {
      case 'var-source': {
        const v = slot[p.field] as number;
        // Value 0 reads as "—" (no source connected); UI treats it as a
        // soft warning, not a red error, so the sidebar follows suit.
        if (v > 0 && !written.has(v)) return false;
        break;
      }
      case 'var-or-const': {
        if (!p.selector) break;
        const sel = slot[p.selector] as number;
        if (sel > 0 && !written.has(sel)) return false;
        break;
      }
      case 'instr-ref': {
        // Both clone (17) and chordgen (18) carry the cross-instrument
        // ordering constraint: source must be a LOWER-indexed instrument.
        const src = slot[p.field] as number;
        if (!isValidCloneSource(instrIdx, src)) return false;
        break;
      }
      default:
        break;
    }
  }
  return true;
}
