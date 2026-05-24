// Op 13 — reverb(short val, UBYTE feedback, UBYTE gain)
//   int buf = cmb_flt_n(16, val, 557, feedback, gain);
//   buf    += cmb_flt_n(17, val, 593, feedback, gain);
//   buf    += cmb_flt_n(18, val, 641, feedback, gain);
//   buf    += cmb_flt_n(19, val, 677, feedback, gain);
//   buf    += cmb_flt_n(20, val, 709, feedback, gain);
//   buf    += cmb_flt_n(21, val, 743, feedback, gain);
//   buf    += cmb_flt_n(22, val, 787, feedback, gain);
//   buf    += cmb_flt_n(23, val, 809, feedback, gain);
//   return clamp(buf);
//
// Source: exe_creator/synthnodes.h line 123-129.
// Args (per refrender.c case 13):
//   val      = (slot.val1 in 1..4) ? variables[slot.val1] : 0
//   feedback = (slot.val2 in 1..4) ? (UBYTE)variables[slot.val2]
//                                  : (UBYTE)slot.val2Value
//   gain     = pick_byte(slot.gain, slot.gainVal, vars)
//
// Subtleties:
//   - Reverb's 8 internal comb filters SHARE `buffern` rows 16..23 and the
//     SAME `cmb_flt_n_i[]` index array as cmb_flt_n itself (because they
//     literally call cmb_flt_n in C). So state must persist across all 8
//     internal calls. We inline the cmb_flt_n math here to avoid touching
//     state.cmb_flt_n_i twice per "call" needlessly.
//   - The 8 prime delays (557, 593, 641, 677, 709, 743, 787, 809) are
//     literal arguments; no slot fields control them.
//   - `int buf` accumulator: sum of 8 shorts → fits easily in int32; final
//     clamp converts to short.

import type { OpFn } from '../types';
import { pickByte, clampI16, vol, toI16 } from './_helpers';

const REVERB_DELAYS = [557, 593, 641, 677, 709, 743, 787, 809] as const;

export const op_reverb: OpFn = (state, _slotIdx, vars, slot, _t) => {
  const val = (slot.val1 > 0 && slot.val1 <= 4) ? vars[slot.val1]! : 0;
  const feedback = (slot.val2 > 0 && slot.val2 <= 4)
    ? (vars[slot.val2]! & 0xff)
    : (slot.val2Value & 0xff);
  const gain = pickByte(slot.gain, slot.gainVal, vars);

  let buf = 0;
  for (let k = 0; k < 8; k++) {
    const inst = 16 + k;
    // Prime delays 557..809; all under the 2047 cap.
    const delay = REVERB_DELAYS[k]!;
    const rowBase = inst * 2048;
    const idx = state.cmb_flt_n_i[inst]!;
    const addr = rowBase + idx;

    // cmb_flt_n body: buffer[i] = add(val, vol(buffer[i], feedback))
    const prev = state.buffern[addr]!;
    const fb = toI16(vol(prev, feedback));
    const stored = clampI16(val + fb);
    state.buffern[addr] = stored;

    // if (++i >= delay) i = 0
    let next = toI16(idx + 1);
    if (next >= delay) next = 0;
    state.cmb_flt_n_i[inst] = next;

    // cmb_flt_n returns vol(output, gain) where output == stored
    buf = (buf + vol(stored, gain)) | 0;
  }
  return clampI16(buf);
};
