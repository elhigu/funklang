// Op 21 — onepole_flt(BYTE instance, short val, BYTE cutoff, BYTE mode)
//   short* buffer = filterBuffer + (instance << 2);
//   short pole    = buffer[3];
//   pole = clamp(pole - (mulsw(pole >> 7, cutoff))
//                     + (mulsw(val  >> 7, cutoff)));
//   buffer[3] = pole;
//   switch (mode) {
//     case 0: return pole;
//     case 1: return (val - pole);
//   }
//   return 0;
//
// Source: exe_creator/synthnodes.h line 152-162.
// Args (per refrender.c case 21):
//   instance = j
//   val      = (slot.val1 in 1..4) ? variables[slot.val1] : 0
//   cutoff   = (BYTE)pick_short(slot.freq, slot.freqVal, vars)
//   mode     = (BYTE)slot.gain     <-- RAW gain byte, not pick_byte
//
// Subtleties:
//   - `pole >> 7`: pole is short → int promotion (sign-extend) → arith shift.
//   - `mulsw(pole>>7, cutoff)`: each arg truncated to int16. cutoff is BYTE
//     (signed 8-bit) but mulsw treats low 16 bits as signed. For cutoff < 0
//     the result is signed.
//   - clamp() returns short; we store via toI16.
//   - `val - pole`: int subtraction; return value truncated to short on
//     assignment to `out` in refrender. We mirror via toI16.

import type { OpFn } from '../types';
import { clampI16, toI16 } from './_helpers';

export const op_onepole_flt: OpFn = (state, slotIdx, vars, slot, _t) => {
  const val = (slot.val1 > 0 && slot.val1 <= 4) ? vars[slot.val1]! : 0;
  // cutoff: pick_short → BYTE (signed int8).
  const rawCut = (slot.freq > 0 && slot.freq <= 4) ? vars[slot.freq]! : slot.freqVal;
  const cutoff = (toI16(rawCut) << 24) >> 24;        // BYTE
  // mode: raw slot.gain as BYTE (signed int8).
  const mode = (slot.gain << 24) >> 24;

  const base = slotIdx << 2;
  let pole = state.filterBuffer[base + 3]!;

  // mulsw truncates each arg to int16; (pole>>7) and (val>>7) are int.
  const a = Math.imul(toI16(pole >> 7), toI16(cutoff));
  const b = Math.imul(toI16(val  >> 7), toI16(cutoff));
  pole = clampI16(pole - a + b);
  state.filterBuffer[base + 3] = pole;

  switch (mode) {
    case 0: return pole;
    case 1: return toI16(val - pole);
    default: return 0;
  }
};
