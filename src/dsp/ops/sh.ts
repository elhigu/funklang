// Op 19 — sh(BYTE instance, short val1, UBYTE step)  — "new s&h from DAN"
//   short step2 = mulsw(step, step) >> 2;
//   counter_sh[instance]--;
//   if (counter_sh[instance] < 0) {
//       buffer_sh[instance] = val1;
//       counter_sh[instance] = step2;
//   }
//   return buffer_sh[instance];
//
// Source: exe_creator/synthnodes.h line 42-52.
// Args (per refrender.c case 19):
//   instance = slot index j
//   val1     = (slot.val1 in 1..4) ? variables[slot.val1] : 0
//   step     = pick_byte(slot.gain, slot.gainVal, vars)
//
// Subtleties:
//   - mulsw(step, step): step is UBYTE 0..255 → mulsw treats both as int16
//     (positive, since UBYTE < 256). Always non-negative, result fits in
//     int. `>> 2` arith. step2 is short → truncate (large step e.g. 255*255
//     = 65025 → >>2 = 16256, fits).
//   - counter_sh is short[]; `--` underflows -32768 → 32767 (C wraps mod 2^16).
//     Int16Array's [-]/[+]= does NOT wrap on store automatically when we do
//     manual arithmetic; we explicitly toI16().

import type { OpFn } from '../types';
import { pickByte, toI16 } from './_helpers';

export const op_sh: OpFn = (state, slotIdx, vars, slot, _t) => {
  const val1 = (slot.val1 > 0 && slot.val1 <= 4) ? vars[slot.val1]! : 0;
  const step = pickByte(slot.gain, slot.gainVal, vars);

  const step2 = toI16(Math.imul(step, step) >> 2);
  let counter = toI16(state.counter_sh[slotIdx]! - 1);
  if (counter < 0) {
    state.buffer_sh[slotIdx] = toI16(val1);
    counter = step2;
  }
  state.counter_sh[slotIdx] = counter;
  return state.buffer_sh[slotIdx]!;
};
