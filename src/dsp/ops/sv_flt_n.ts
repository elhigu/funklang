// Op 15 — sv_flt_n(BYTE instance, short val, short cutoff, UBYTE resonance, BYTE mode)
//   short* buffer = filterBuffer + (instance << 2);
//   short lpf = buffer[0]; short hpf = buffer[1]; short bpf = buffer[2];
//   lpf = clamp(lpf + (mulsw(bpf >> 7, cutoff)));
//   hpf = clamp(val - lpf - (mulsw(bpf >> 7, resonance)));
//   bpf = clamp(bpf + (mulsw(hpf >> 7, cutoff)));
//   buffer[0] = lpf; buffer[1] = hpf; buffer[2] = bpf;
//   switch (mode) {
//     case 0: return lpf;
//     case 1: return hpf;
//     case 2: return bpf;
//     case 3: return clamp(hpf + bpf);
//   }
//   return 0;
//
// Source: exe_creator/synthnodes.h line 135-150.
// Args (per refrender.c case 15):
//   instance   = j
//   val        = (slot.val1 in 1..4) ? variables[slot.val1] : 0
//   cutoff     = pick_short(slot.freq, slot.freqVal, vars)
//   resonance  = (slot.val2 in 1..4) ? (UBYTE)variables[slot.val2]
//                                    : (UBYTE)slot.val2Value
//   mode       = (BYTE)slot.gain    <-- RAW gain byte, not pick_byte
//
// Subtleties:
//   - mulsw: each arg → low 16 bits as signed. cutoff is short; resonance
//     is UBYTE (0..255) — the low 16 bits are still positive.
//   - bpf is updated AFTER hpf (which uses the *new* lpf). Order matters.
//   - hpf uses the post-update lpf; clamp on each line.

import type { OpFn } from '../types';
import { pickShort, clampI16, toI16 } from './_helpers';

export const op_sv_flt_n: OpFn = (state, slotIdx, vars, slot, _t) => {
  const val = (slot.val1 > 0 && slot.val1 <= 4) ? vars[slot.val1]! : 0;
  const cutoff = pickShort(slot.freq, slot.freqVal, vars);
  const reso = (slot.val2 > 0 && slot.val2 <= 4)
    ? (vars[slot.val2]! & 0xff)
    : (slot.val2Value & 0xff);
  const mode = (slot.gain << 24) >> 24;     // BYTE

  const base = slotIdx << 2;
  let lpf = state.filterBuffer[base + 0]!;
  let hpf = state.filterBuffer[base + 1]!;
  let bpf = state.filterBuffer[base + 2]!;

  // lpf = clamp(lpf + mulsw(bpf>>7, cutoff))
  lpf = clampI16(lpf + Math.imul(toI16(bpf >> 7), toI16(cutoff)));
  // hpf = clamp(val - lpf - mulsw(bpf>>7, resonance))
  // Note: bpf>>7 uses the OLD bpf (lpf was just updated; bpf hasn't).
  hpf = clampI16(val - lpf - Math.imul(toI16(bpf >> 7), toI16(reso)));
  // bpf = clamp(bpf + mulsw(hpf>>7, cutoff))   — uses NEW hpf
  bpf = clampI16(bpf + Math.imul(toI16(hpf >> 7), toI16(cutoff)));

  state.filterBuffer[base + 0] = lpf;
  state.filterBuffer[base + 1] = hpf;
  state.filterBuffer[base + 2] = bpf;

  switch (mode) {
    case 0: return lpf;
    case 1: return hpf;
    case 2: return bpf;
    case 3: return clampI16(hpf + bpf);
    default: return 0;
  }
};
