// Op 6 — osc_noise(int sample, UBYTE gain)
//   static int g_x1 = 0x67452301, g_x2 = 0xefcdab89, g_x3 = 0;
//   g_x1 ^= g_x2; g_x3 += g_x2; g_x2 += g_x1;
//   short buf = g_x3;
//   return vol(buf, gain);
//
// Source: exe_creator/synthnodes.h line 78-82.
// Args (per refrender.c case 6):
//   sample (unused inside the op body — just signature)
//   gain   = pick_byte(slot.gain, slot.gainVal, vars)
//
// State lives on OpState (noise_x1..x3). Initial seeds match the C statics.
// Per docs/dsp-reference.md §3 this state is NOT cleared by clr_buf — it
// persists across instruments. For single-instrument tests that's moot;
// see Phase 5 Batch B+ for multi-instrument render where the OpState
// needs to outlive renderInstrument calls.

import type { OpFn } from '../types';
import { pickByte, vol, toI16 } from './_helpers';

export const op_osc_noise: OpFn = (state, _slotIdx, vars, slot, _t) => {
  const gain = pickByte(slot.gain, slot.gainVal, vars);
  // 32-bit signed math throughout. `| 0` forces JS to int32.
  state.noise_x1 = (state.noise_x1 ^ state.noise_x2) | 0;
  state.noise_x3 = (state.noise_x3 + state.noise_x2) | 0;
  state.noise_x2 = (state.noise_x2 + state.noise_x1) | 0;
  const buf = toI16(state.noise_x3);   // short buf = g_x3 → low 16 bits, sign-extended
  return vol(buf, gain);
};
