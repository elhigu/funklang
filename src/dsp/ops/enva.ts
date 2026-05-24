// Op 7 — enva(int sample, BYTE attack, BYTE sustain, UBYTE gain)
//   short t   = decayTable[attack];
//   int   buf = (sample * t) >> 8;
//   if (buf > 32767) buf = 32767;
//   return vol(buf, gain);
//
// Source: exe_creator/synthnodes.h line 84-90.
// Args (per refrender.c case 7):
//   sample  = smp (tick index)
//   attack  = (BYTE)pick_short(slot.val1, slot.val1Value, vars)
//   sustain = literal 0  (Form1 always passes 0 for enva — ignored anyway)
//   gain    = pick_byte(slot.gain, slot.gainVal, vars)
//
// Subtleties:
//   - `attack` is BYTE (signed 8-bit). decayTable[] is indexed in 0..127;
//     negative attack values would read out-of-bounds in C. JS bounds-checks
//     read 0; we mirror C by masking to a safe range. In practice Form1
//     constrains attack to 0..127.
//   - `sample * t`: both ints; the product can overflow int32 for large
//     sample counts (sample up to ~2.1M with t=32767 ≈ 7e10 — exceeds int32
//     ~2.1e9). The C compiler defines this as wraparound on x86; we replicate
//     with Math.imul, which performs the low-32-bit signed multiply.
//   - The `>>` is arithmetic on the int product; Math.imul + JS >> matches.
//   - `if (buf > 32767) buf = 32767` clips only the high side; large
//     negative values pass through into vol(), which is the C behavior.

import type { OpFn } from '../types';
import { pickByte, vol, toI16 } from './_helpers';
import { decayTable } from './_decay_table';

export const op_enva: OpFn = (_state, _slotIdx, vars, slot, t) => {
  // attack is BYTE — pick_short → truncate to int8.
  const raw = (slot.val1 > 0 && slot.val1 <= 4) ? vars[slot.val1]! : slot.val1Value;
  // (BYTE)pick_short: truncate to int8, sign-extend back. Form1 keeps
  // attack in 0..127 in practice. Clamp to 0..127 defensively (mirrors what
  // a sane patch yields; negative BYTE values would be C UB anyway).
  const attack = (toI16(raw) << 24) >> 24;
  const idx = attack < 0 ? 0 : (attack > 127 ? 127 : attack);
  const tCoef = decayTable[idx]!;
  const gain = pickByte(slot.gain, slot.gainVal, vars);

  // (sample * t) >> 8 with int32 wraparound. Math.imul gives low-32-bit
  // signed product; arithmetic >> 8 matches C `int` shift on x86.
  let buf = Math.imul(t, tCoef) >> 8;
  if (buf > 32767) buf = 32767;
  return vol(buf, gain);
};
