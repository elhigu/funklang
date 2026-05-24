// Op 23 — adsr
//
// Two layers:
//
// 1) PRE-COMPUTATION from slot fields (Form1.cs case 23, lines 5491-5530;
//    mirrored in refrender.c case 23). The slot's freqVal / val1Value /
//    val2Value / widthVal / gainVal are combined into the 6 int arguments
//    passed to the C `adsr` function:
//
//      attackTicks  = (val2Value << 8) + 1
//      decayTicks   = (val1Value << 8) + 1
//      releaseTicks = (freqVal   << 8) + 1
//      sustainTicks = sampleLength - attackTicks - decayTicks - releaseTicks
//      peakByte     = gainVal               (UBYTE)
//      sustain16    = (short)(widthVal << 8)
//      peak         = 32767 * peakByte << 1
//      sustainVal   = sustain16 * peakByte << 1     (int wrap on overflow)
//      attackAmt    = peak                 / attackTicks
//      decayAmt     = (peak - sustainVal)  / decayTicks
//      releaseAmt   = sustainVal           / releaseTicks
//
//    Then call adsr(j, attackAmt, decayAmt, sustainVal,
//                   sustainTicks, releaseAmt, peak).
//
// 2) The actual adsr(...) (synthnodes.h line 164-178):
//      int val = ADSR_Value[instance];
//      switch (ADSR_Mode[instance]) {
//        case 0: val += attackAmount;
//                if (val >= peak) { val = peak; mode = 1; }
//                break;
//        case 1: val -= decayAmount;
//                if (val <= sustainLevel) { val = sustainLevel; mode = 2; }
//                break;
//        case 2: ADSR_SustainCounter[i]++;
//                if (ADSR_SustainCounter[i] > sustainLength) mode = 3;
//                break;
//        case 3: val -= releaseAmount;
//                if (val < 0) val = 0;
//                break;
//      }
//      ADSR_Value[instance] = val;
//      return val >> 8;
//
// Subtleties:
//   - `peak = 32767 * peakByte << 1`: C semantics. peakByte is UBYTE
//     (0..255), promoted to int. `32767 * 255 = 8'355'585`, then << 1 =
//     16'711'170. Always fits in int32. Math.imul is safe.
//   - `sustainVal = sustain16 * peakByte << 1`: sustain16 is short, then
//     promoted to int. Max: 32512 * 255 ≈ 8.3M; << 1 ≈ 16.6M. Fits in int32.
//   - `peak - sustainVal` may be negative (if sustain > peak). C integer
//     division truncates toward zero — JS `(a/b)|0` matches when both ops fit.
//     We use `Math.trunc(a/b) | 0` for safety.
//   - Division by zero is impossible: ticks have +1 offset.
//   - `val >> 8` is signed arith shift on int. JS >> on int32 matches.

import type { OpFn } from '../types';
import { toI16 } from './_helpers';

// C-truncating integer division for int32 args.
function idiv(a: number, b: number): number {
  return (Math.trunc(a / b)) | 0;
}

export const op_adsr: OpFn = (state, slotIdx, _vars, slot, _t) => {
  // --- pre-computation (constants per render, but cheap to recompute) ---
  const attackTicks  = (slot.val2Value << 8) + 1;
  const decayTicks   = (slot.val1Value << 8) + 1;
  const releaseTicks = (slot.freqVal   << 8) + 1;
  // sampleLength is held outside the slot; the adsr op uses the
  // ENCLOSING instrument's sampleLength (NOT the +1 inclusive-loop total).
  // Engine populates state.sampleLength before the per-tick loop.
  const sustainTicks = state.sampleLength - attackTicks - decayTicks - releaseTicks;

  const peakByte = slot.gainVal & 0xff;                     // UBYTE
  const sustain16 = toI16(slot.widthVal << 8);              // short

  // peak = 32767 * peakByte << 1  (int32; never overflows for peakByte ≤ 255)
  const peak = (Math.imul(32767, peakByte) << 1) | 0;
  // sustainVal = sustain16 * peakByte << 1
  const sustainVal = (Math.imul(sustain16, peakByte) << 1) | 0;

  const attackAmt  = attackTicks  !== 0 ? idiv(peak, attackTicks) : 0;
  const decayAmt   = decayTicks   !== 0 ? idiv(peak - sustainVal, decayTicks) : 0;
  const releaseAmt = releaseTicks !== 0 ? idiv(sustainVal, releaseTicks) : 0;

  // --- adsr() body ---
  let val = state.ADSR_Value[slotIdx]!;
  const mode = state.ADSR_Mode[slotIdx]!;
  switch (mode) {
    case 0:
      val = (val + attackAmt) | 0;
      if (val >= peak) {
        val = peak;
        state.ADSR_Mode[slotIdx] = 1;
      }
      break;
    case 1:
      val = (val - decayAmt) | 0;
      if (val <= sustainVal) {
        val = sustainVal;
        state.ADSR_Mode[slotIdx] = 2;
      }
      break;
    case 2:
      state.ADSR_SustainCounter[slotIdx] = (state.ADSR_SustainCounter[slotIdx]! + 1) | 0;
      if (state.ADSR_SustainCounter[slotIdx]! > sustainTicks) {
        state.ADSR_Mode[slotIdx] = 3;
      }
      break;
    case 3:
      val = (val - releaseAmt) | 0;
      if (val < 0) val = 0;
      break;
  }
  state.ADSR_Value[slotIdx] = val;
  return val >> 8;
};
