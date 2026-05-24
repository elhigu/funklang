// Op 1 — vol(short val, UBYTE gain) → mulsw(val, gain) >> 7
//
// Source: exe_creator/synthnodes.h line 23-25.
// Args (per refrender.c case 1):
//   val  = pick_short(slot.val1, slot.val1Value, vars)
//   gain = pick_byte (slot.gain, slot.gainVal,   vars)

import type { OpFn } from '../types';
import { pickShort, pickByte, vol } from './_helpers';

export const op_vol: OpFn = (_state, _slotIdx, vars, slot, _t) => {
  const val = pickShort(slot.val1, slot.val1Value, vars);
  const gain = pickByte(slot.gain, slot.gainVal, vars);
  return vol(val, gain);
};
