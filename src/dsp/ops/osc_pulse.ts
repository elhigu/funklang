// Op 5 — osc_pulse(BYTE instance, short freq, UBYTE gain, UBYTE dutycycle)
//   short buf = counter_pulse[instance] += freq;
//   if (buf < (dutycycle - 63) << 9) buf = -32768; else buf = 32767;
//   return vol(buf, gain);
//
// Source: exe_creator/synthnodes.h line 72-76.
// Args (per refrender.c case 5):
//   instance  = slot index j
//   freq      = pick_short(slot.freq,  slot.freqVal,  vars)
//   gain      = pick_byte (slot.gain,  slot.gainVal,  vars)
//   dutycycle = pick_byte (slot.width, slot.widthVal, vars)
//
// Subtleties:
//   - dutycycle is UBYTE; `dutycycle - 63` promotes to int. e.g. dutycycle
//     0 → -63, dutycycle 255 → 192. `<< 9` is an int shift, result is int.
//   - Comparison `buf < int` promotes buf (short) to int (sign-extended).

import type { OpFn } from '../types';
import { pickShort, pickByte, vol, toI16 } from './_helpers';

export const op_osc_pulse: OpFn = (state, slotIdx, vars, slot, _t) => {
  const freq = pickShort(slot.freq, slot.freqVal, vars);
  const gain = pickByte(slot.gain, slot.gainVal, vars);
  const dutycycle = pickByte(slot.width, slot.widthVal, vars);

  const cur = toI16(state.counter_pulse[slotIdx]! + freq);
  state.counter_pulse[slotIdx] = cur;

  // (dutycycle - 63) << 9 — int math (UBYTE promotes to int).
  const threshold = (dutycycle - 63) << 9;
  const buf = (cur < threshold) ? -32768 : 32767;
  return vol(buf, gain);
};
