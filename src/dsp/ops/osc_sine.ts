// Op 4 — osc_sine(BYTE instance, short freq, UBYTE gain)
//   short buf = counter_sine[instance] += freq;
//   buf -= 16384;
//   temp = mulsw(buf, 32767 - abs(buf));
//   res  = temp >> 16;
//   res <<= 3;
//   return vol(res, gain);
//
// Source: exe_creator/synthnodes.h line 61-70.
// Args (per refrender.c case 4):
//   instance = slot index j
//   freq     = pick_short(slot.freq, slot.freqVal, vars)
//   gain     = pick_byte (slot.gain, slot.gainVal, vars)
//
// Subtleties:
//   - `buf -= 16384` then potentially wraps; buf is `short` so wrap is mod-2^16.
//   - `temp = mulsw(buf, 32767-abs(buf))`: abs(buf) is short and may overflow
//     for buf == -32768 (matches absI16 helper). The expression
//     `32767 - abs(buf)` is computed as int.
//   - `res = temp >> 16` is arithmetic shift of int32; then `res <<= 3` is on
//     a `short`, so it truncates the high bits.

import type { OpFn } from '../types';
import { pickShort, pickByte, vol, toI16, absI16 } from './_helpers';

export const op_osc_sine: OpFn = (state, slotIdx, vars, slot, _t) => {
  const freq = pickShort(slot.freq, slot.freqVal, vars);
  const gain = pickByte(slot.gain, slot.gainVal, vars);

  const cur = toI16(state.counter_sine[slotIdx]! + freq);
  state.counter_sine[slotIdx] = cur;

  let buf = toI16(cur - 16384);                       // short
  const temp = Math.imul(buf, 32767 - absI16(buf));   // int32
  let res = temp >> 16;                               // short (later)
  res = toI16(res << 3);                              // short <<= 3 truncates
  return vol(res, gain);
};
