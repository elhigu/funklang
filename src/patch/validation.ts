// Per-instrument validation. Used by the sidebar to flash a row RED when
// any of its slots reference a variable that no earlier slot has written,
// or when a clone/chordgen targets an out-of-order source instrument.
//
// The rules here mirror EXACTLY what the slot-grid paints as `.var-unset`
// red so the sidebar can never disagree with the row-level indicators.

import { opByCode } from '../dsp/op-metadata';
import { isValidCloneSource } from './clone-graph';
import type { Patch, Slot } from './types';

export function isInstrumentValid(patch: Patch, instrIdx: number): boolean {
  const ins = patch.instruments[instrIdx];
  if (!ins) return true;
  const written = new Set<number>();   // var indices written by earlier slots
  for (const slot of ins.slots) {
    if (slot.fn === 0) continue;       // empty slot — UI hides it
    if (!slotIsValid(slot, instrIdx, written)) return false;
    if (slot.outVar > 0) written.add(slot.outVar);
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
