// Op 12 — cmb_flt_n(BYTE instance, short val, short delay, UBYTE feedback, UBYTE gain)
//   if (delay > 2047) delay = 2047;
//   static short i[24];
//   buffern[instance][i[instance]] = add(val, vol(buffern[instance][i[instance]], feedback));
//   short output = buffern[instance][i[instance]];
//   if (++i[instance] >= delay) i[instance] = 0;
//   return vol(output, gain);
//
// Source: exe_creator/synthnodes.h line 115-121.
// Args (per refrender.c case 12):
//   instance = j
//   val      = (slot.val1 in 1..4) ? variables[slot.val1] : 0
//   delay    = pick_short(slot.freq, slot.freqVal, vars)
//   feedback = (slot.val2 in 1..4) ? (UBYTE)variables[slot.val2]
//                                  : (UBYTE)slot.val2Value
//   gain     = pick_byte(slot.gain, slot.gainVal, vars)
//
// Note: refrender.c case 12 contains dead code
//   `pick_byte(s->val2 ? 0 : 0, ...)` followed by an immediate overwrite —
// we ignore that, only the final `feedback` assignment matters.
//
// Subtleties:
//   - `delay > 2047` cap, but ALSO no check for delay <= 0. If delay==0,
//     the post-store `if (++i >= 0)` always fires → i stays at 0 every
//     sample, so the buffer at [0] is read+written each tick (degenerate
//     1-sample feedback). If delay<0, the comparison is still signed-int
//     based on `++i >= delay`; ++i is always ≥0 so condition fires → i=0
//     same as delay=0. We replicate the comparison directly.
//   - add() = clamp(val1 + val2). vol() = mulsw(val, gain) >> 7 (arith
//     shift on int; result stored as short).
//   - buffern is row-major Int16Array — index as instance * 2048 + i.

import type { OpFn } from '../types';
import { pickShort, pickByte, clampI16, vol, toI16 } from './_helpers';

export const op_cmb_flt_n: OpFn = (state, slotIdx, vars, slot, _t) => {
  const val = (slot.val1 > 0 && slot.val1 <= 4) ? vars[slot.val1]! : 0;
  let delay = pickShort(slot.freq, slot.freqVal, vars);
  if (delay > 2047) delay = 2047;
  const feedback = (slot.val2 > 0 && slot.val2 <= 4)
    ? (vars[slot.val2]! & 0xff)
    : (slot.val2Value & 0xff);
  const gain = pickByte(slot.gain, slot.gainVal, vars);

  const inst = slotIdx;          // BYTE instance = j
  const rowBase = inst * 2048;
  const idx = state.cmb_flt_n_i[inst]!;
  const addr = rowBase + idx;

  // buffern[inst][i] = add(val, vol(buffern[inst][i], feedback))
  const prev = state.buffern[addr]!;
  const fb = toI16(vol(prev, feedback));   // vol returns int; store-as-short
  const stored = clampI16(val + fb);       // add() = clamp(val + val2)
  state.buffern[addr] = stored;
  const output = stored;                   // read AFTER the store

  // if (++i >= delay) i = 0
  let next = toI16(idx + 1);
  if (next >= delay) next = 0;
  state.cmb_flt_n_i[inst] = next;

  return vol(output, gain);
};
