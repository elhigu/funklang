// Op 10 — mul(short val1, short val2) → mulsw(val1, val2) >> 15
//
// Source: exe_creator/synthnodes.h line 104-106.
// Args (per refrender.c case 10):
//   val1 must be v1..v4 (literal not allowed); else 0
//   val2 = pick_short(slot.val2, slot.val2Value, vars)

import type { OpFn } from '../types';
import { pickShort, toI16 } from './_helpers';

export const op_mul: OpFn = (_state, _slotIdx, vars, slot, _t) => {
  const a = (slot.val1 > 0 && slot.val1 <= 4) ? vars[slot.val1]! : 0;
  const b = pickShort(slot.val2, slot.val2Value, vars);
  return Math.imul(toI16(a), toI16(b)) >> 15;
};
