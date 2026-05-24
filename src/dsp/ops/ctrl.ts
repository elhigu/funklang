// Op 14 — ctrl(short val) → BYTE
//   return (val >> 9) + 64;
//
// Source: exe_creator/synthnodes.h line 131-133.
// Args (per refrender.c case 14):
//   val = (slot.val1 in 1..4) ? variables[slot.val1] : 0
//   refrender then does: out = (short)(int8_t)ctrl(val);
//   i.e. truncate the BYTE result to int8 and sign-extend back to short.
//
// Notes:
//   - `val >> 9`: val is short, promoted to int (sign-extended) before
//     arithmetic shift. Range: short ∈ [-32768, 32767] → val>>9 ∈ [-64, 63].
//   - + 64 gives [0, 127] — but for val=-32768, val>>9 = -64, +64 = 0;
//     val=32767, val>>9 = 63, +64 = 127. Always fits in BYTE.
//   - Truncating to int8 then sign-extending is a no-op when result is in
//     [-128, 127]; ours is always [0, 127] so identical.

import type { OpFn } from '../types';
import { toI16 } from './_helpers';

export const op_ctrl: OpFn = (_state, _slotIdx, vars, slot, _t) => {
  const val = (slot.val1 > 0 && slot.val1 <= 4) ? vars[slot.val1]! : 0;
  const byteVal = (val >> 9) + 64;
  // Truncate to int8, then sign-extend to short.
  const i8 = (byteVal << 24) >> 24;
  return toI16(i8);
};
