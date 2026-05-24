// Op 3 — osc_tri(BYTE instance, short freq, UBYTE gain)
//   short buf = counter_tri[instance] += freq;
//   if (buf < 0) buf = 65535 - buf;
//   buf -= 16384; buf <<= 1;
//   return vol(buf, gain);
//
// Source: exe_creator/synthnodes.h line 55-59.
// Args (per refrender.c case 3):
//   instance = slot index j
//   freq     = pick_short(slot.freq, slot.freqVal, vars)
//   gain     = pick_byte (slot.gain, slot.gainVal, vars)
//
// Subtleties:
//   - counter_tri is short[]; += truncates to Int16 on store.
//   - `65535 - buf` is computed as int (buf promoted to int), then stored
//     to short → truncated. e.g. buf = -1 → 65535 - (-1) = 65536 → short 0.
//   - `buf -= 16384` and `buf <<= 1` are short arithmetic; results
//     re-truncated to Int16.

import type { OpFn } from '../types';
import { pickShort, pickByte, vol, toI16 } from './_helpers';

export const op_osc_tri: OpFn = (state, slotIdx, vars, slot, _t) => {
  const freq = pickShort(slot.freq, slot.freqVal, vars);
  const gain = pickByte(slot.gain, slot.gainVal, vars);

  // counter_tri[instance] += freq → stored back as short.
  const cur = toI16(state.counter_tri[slotIdx]! + freq);
  state.counter_tri[slotIdx] = cur;

  let buf = cur;
  if (buf < 0) buf = toI16(65535 - buf);   // int subtract, truncate to short
  buf = toI16(buf - 16384);                // short arithmetic
  buf = toI16(buf << 1);                   // short <<= 1 truncates
  return vol(buf, gain);
};
