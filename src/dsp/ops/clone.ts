// Op 17 — clone (inline expression; NOT in synthnodes.h — emitted by
// Form1.cs case 17 ~line 5328). Reads from a previously-rendered source
// instrument's 8-bit sample bytes with transpose / offset / reverse.
//
//   int idx = ((smp * (freq + 32768)) >> 15) + (uint16_t)val2Value;
//   if (idx < SmpLength[srcInst]) {
//       if (gainVal == 0) {
//           out = (*(BYTE*)(BaseAdr[srcInst]     + idx))  << 8;   // forward
//       } else {
//           out = (*(BYTE*)(BaseAdr[srcInst + 1] - idx)) << 8;   // reverse
//       }
//   } else out = 0;
//
// Source: dsp-reference.md §6 / refrender.c case 17 lines 462-490.
//
// Args (slot fields):
//   srcInst   = slot.gain        (UBYTE index)
//   transpose = pick_short(slot.freq, slot.freqVal, vars)
//   offset    = (uint16_t)slot.val2Value   — *unsigned* cast in C
//   gainVal   = slot.gainVal     (0 → forward, non-zero → reverse)
//
// Subtleties:
//   - `smp * (transpose + 32768)`: transpose is short (signed); + 32768
//     promotes to int, range [0..65535]. Multiplied by smp (int). For long
//     samples this can overflow int32 — we match C int32 wrap via |0.
//   - `>> 15` is int arith shift.
//   - `(uint16_t)val2Value` — val2Value is int16; the cast wraps negative
//     values modulo 65536. e.g. val2Value = -1 → offset = 65535.
//   - Bounds check `idx < SmpLength[srcInst]`: SmpLength is the original
//     `sampleLength` (NOT sampleLength + 1). For idx exactly == sampleLength
//     the read is REJECTED → returns 0.
//   - Reverse: `BaseAdr[src+1] - idx` reads ONE PAST the end of src's
//     buffer and walks backwards. In our pre-rendered Int8Array layout we
//     emulate via `r = (sampleLength + 1) - idx`, then read src[r]. That
//     `+1` mirrors C reading one past — when idx==0, r==sampleLength+1
//     which is out of bounds (we return 0); when idx==1, r==sampleLength
//     which is the LAST valid index.
//   - Note refrender.c case 17 uses `total_src = sampleLength + 1` and
//     bounds-checks `r < 0 || r >= total_src` — we mirror exactly.

import type { OpFn } from '../types';
import { pickShort, toI16 } from './_helpers';

export const op_clone: OpFn = (state, _slotIdx, vars, slot, t) => {
  const srcInst = slot.gain;
  const src = state.cloneBuffers.get(srcInst);
  if (!src) return 0;

  const transpose = pickShort(slot.freq, slot.freqVal, vars);
  // (transpose + 32768): always non-negative int in [0..65535].
  const factor = (transpose + 32768) | 0;
  // smp * factor → int32 (we accept C overflow wrap).
  const product = Math.imul(t, factor);
  const offset = slot.val2Value & 0xffff;        // uint16_t cast
  const idx = ((product >> 15) + offset) | 0;

  // The pre-rendered buffer is sampleLength + 1 bytes long (matches
  // refrender's `total = SmpLength + 1` allocation). SmpLength[srcInst]
  // is therefore src.length - 1 in our representation.
  const smpLen = src.length - 1;
  if (idx >= smpLen) return 0;

  if (slot.gainVal === 0) {
    // forward
    if (idx < 0 || idx >= src.length) return 0;
    return toI16(src[idx]! << 8);
  } else {
    // reverse: r = total_src - idx ; bounds-check against total_src
    const totalSrc = src.length;
    const r = totalSrc - idx;
    if (r < 0 || r >= totalSrc) return 0;
    return toI16(src[r]! << 8);
  }
};
