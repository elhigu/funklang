// Op 8 — envd(int sample, BYTE decay, BYTE sustain, UBYTE gain)
//   short sustain16 = sustain << 8;
//   short t         = decayTable[decay];
//   int   buf       = 32767 - ((sample * t) >> 8);
//   if (buf <= sustain16) buf = sustain16;
//   return vol(buf, gain);
//
// Source: exe_creator/synthnodes.h line 92-98.
// Args (per refrender.c case 8):
//   sample  = smp
//   decay   = (BYTE)pick_short(slot.val1, slot.val1Value, vars)
//   sustain = (BYTE)pick_short(slot.val2, slot.val2Value, vars)
//   gain    = pick_byte(slot.gain, slot.gainVal, vars)
//
// Subtleties:
//   - `sustain << 8`: sustain is BYTE (signed). Shift left by 8 stays in
//     int range; result truncated to short. For sustain in 0..127 this is
//     0..32512. For negative sustain, shift gives a negative short.
//   - Same int32 wraparound concern as enva for (sample * t).
//   - The check `buf <= sustain16` is signed; if buf goes very negative
//     it floors to sustain16.

import type { OpFn } from '../types';
import { pickByte, vol, toI16 } from './_helpers';
import { decayTable } from './_decay_table';

export const op_envd: OpFn = (_state, _slotIdx, vars, slot, t) => {
  const rawDecay = (slot.val1 > 0 && slot.val1 <= 4) ? vars[slot.val1]! : slot.val1Value;
  const decay = (toI16(rawDecay) << 24) >> 24;        // BYTE
  const idx = decay < 0 ? 0 : (decay > 127 ? 127 : decay);
  const tCoef = decayTable[idx]!;

  const rawSustain = (slot.val2 > 0 && slot.val2 <= 4) ? vars[slot.val2]! : slot.val2Value;
  const sustain = (toI16(rawSustain) << 24) >> 24;    // BYTE
  // sustain16 = sustain << 8, truncated to short.
  const sustain16 = toI16(sustain << 8);

  const gain = pickByte(slot.gain, slot.gainVal, vars);

  let buf = 32767 - (Math.imul(t, tCoef) >> 8);
  if (buf <= sustain16) buf = sustain16;
  return vol(buf, gain);
};
