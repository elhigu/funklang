// Op 16 — distortion(int val, UBYTE gain)
//   val = clamp(val * gain >> 5);   // int * UBYTE → int; >>5 arith; clamp → short → back to int
//   val >>= 1;                       // int arith shift
//   temp = mulsw(val, 32767 - abs(val));   // mulsw truncates each to int16; abs(short) too
//   res = temp >> 16;
//   res <<= 3;                       // short <<= int → truncate to int16
//   return res;
//
// Source: exe_creator/synthnodes.h line 11-20.
// Args (per refrender.c case 16):
//   val  = (slot.val1 in 1..4) ? variables[slot.val1] : 0   (sign-extended to int)
//   gain = pick_byte(slot.gain, slot.gainVal, vars)
//
// Subtleties:
//   - val starts as a short (variables[]), then function param is int —
//     sign-extend on entry.
//   - `val * gain` is int * int (UBYTE promoted to int). `>> 5` is int
//     arith shift. clamp returns short, then back to int (sign-extend).
//   - `abs(val)` calls `short abs(short)` — val is implicitly truncated to
//     short BEFORE abs is computed.
//   - `mulsw(val, 32767 - abs(val))`: both args truncated to int16 inside
//     mulsw. The "32767 - abs(val)" expression is int (abs returns short
//     promoted to int).

import type { OpFn } from '../types';
import { pickByte, clampI16, toI16, absI16 } from './_helpers';

export const op_distortion: OpFn = (_state, _slotIdx, vars, slot, _t) => {
  // val arg is int — sign-extend from the v[] short.
  const v0 = (slot.val1 > 0 && slot.val1 <= 4) ? vars[slot.val1]! : 0;
  const gain = pickByte(slot.gain, slot.gainVal, vars);

  // val = clamp(val * gain >> 5)
  // gain is UBYTE 0..255; Math.imul OK since both fit in int32 here.
  let val = clampI16(Math.imul(v0, gain) >> 5);
  // val >>= 1  (int arith)
  val = val >> 1;
  // abs(val) truncates val to short first
  const valI16 = toI16(val);
  const a = absI16(valI16);
  // mulsw truncates each to int16; (32767 - a) fits in int
  const temp = Math.imul(valI16, 32767 - a);
  // res = temp >> 16 (int arith), then res <<= 3 short-truncate
  let res = temp >> 16;
  res = toI16(res << 3);
  return res;
};
