// Op 2 — osc_saw(BYTE instance, short freq, UBYTE gain)
//   counter_saw[instance] += freq;
//   return vol(counter_saw[instance], gain);
//
// Source: exe_creator/synthnodes.h line 27-30.
// Args (per refrender.c case 2):
//   instance = slot index j (NOT slot.instance — refrender passes (BYTE)j)
//   freq     = pick_short(slot.freq, slot.freqVal, vars)
//   gain     = pick_byte (slot.gain, slot.gainVal, vars)
//
// Note: counter_saw is `short[]` in C, so the += truncates to Int16 on each
// store. Int16Array gives us the same truncation behavior automatically.

import type { OpFn } from '../types';
import { pickShort, pickByte, vol, toI16 } from './_helpers';

export const op_osc_saw: OpFn = (state, slotIdx, vars, slot, _t) => {
  const freq = pickShort(slot.freq, slot.freqVal, vars);
  const gain = pickByte(slot.gain, slot.gainVal, vars);
  // C: counter_saw[instance] += freq → adds as int, stores as short.
  const next = toI16(state.counter_saw[slotIdx]! + freq);
  state.counter_saw[slotIdx] = next;
  return vol(next, gain);
};
