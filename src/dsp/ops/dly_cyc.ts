// Op 11 — dly_cyc(BYTE instance, short val, short delay, UBYTE gain)
//   if (delay > 2047) delay = 2047;
//   static short i[16];
//   buffern[instance][i[instance]] = vol(val, gain);
//   if (++i[instance] >= delay) i[instance] = 0;
//   return buffern[instance][i[instance]];
//
// Source: exe_creator/synthnodes.h line 108-113.
// Args (per refrender.c case 11):
//   instance = j
//   val      = (slot.val1 in 1..4) ? variables[slot.val1] : 0
//   delay    = pick_short(slot.freq, slot.freqVal, vars)
//   gain     = pick_byte(slot.gain, slot.gainVal, vars)
//
// Subtleties (vs cmb_flt_n):
//   - dly_cyc WRITES vol(val,gain) into the slot, then READS one tick LATER
//     (after the index advances). cmb_flt_n reads the SAME slot it just
//     wrote (no offset). So the return value is the buffer state at the
//     NEW index, which is the OLDEST sample in the ring.
//   - Function-local `static short i[16]` is a different static from
//     cmb_flt_n's i[24]. We use state.dly_cyc_i (length N_SLOTS_MAX).
//   - The delay>2047 cap is the same. delay<=0 degeneracies: ++i is always
//     ≥0 so the comparison fires → i stays at 0 (everything reads/writes
//     slot 0).

import type { OpFn } from '../types';
import { pickShort, pickByte, vol, toI16 } from './_helpers';

export const op_dly_cyc: OpFn = (state, slotIdx, vars, slot, _t) => {
  const val = (slot.val1 > 0 && slot.val1 <= 4) ? vars[slot.val1]! : 0;
  let delay = pickShort(slot.freq, slot.freqVal, vars);
  if (delay > 2047) delay = 2047;
  const gain = pickByte(slot.gain, slot.gainVal, vars);

  const inst = slotIdx;
  const rowBase = inst * 2048;
  const idx = state.dly_cyc_i[inst]!;

  // buffern[inst][i] = vol(val, gain)  (truncated to short on store)
  state.buffern[rowBase + idx] = toI16(vol(val, gain));

  // if (++i >= delay) i = 0
  let next = toI16(idx + 1);
  if (next >= delay) next = 0;
  state.dly_cyc_i[inst] = next;

  // return buffern[inst][i]  — READ AFTER the index advanced
  return state.buffern[rowBase + next]!;
};
