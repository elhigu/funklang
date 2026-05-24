// Common helpers used by op implementations. These mirror the small
// helper functions in synthnodes.h / main-binary.c (clamp, abs, vol) so
// each op file reads close to its C counterpart.

import type { Slot } from '../../patch/types';

/** Saturating clamp of a 32-bit int into Int16 range. Mirrors C `clamp`. */
export function clampI16(v: number): number {
  v = v | 0;
  if (v > 32767) return 32767;
  if (v < -32768) return -32768;
  return v;
}

/** Truncate a 32-bit signed value to Int16, sign-extending the low 16 bits. */
export function toI16(v: number): number {
  return (v << 16) >> 16;
}

/** Saturating abs of a short, matching synthnodes.h `abs(short)`. */
export function absI16(v: number): number {
  // C `abs(short)`: val = val<0?-val:val. For -32768, `-val` overflows int16
  // wrap → -32768 again (since 32768 wraps to -32768). We replicate exactly.
  if (v < 0) return toI16(-v);
  return v;
}

/**
 * Klang `vol(short val, UBYTE gain)` — `mulsw(val, gain) >> 7`.
 * Returns a 32-bit JS number (arithmetic shift). Engine clamps on store.
 */
export function vol(val: number, gain: number): number {
  // gain is UBYTE (0..255). mulsw = signed16*signed16 → int32. >>7 arithmetic.
  return Math.imul(toI16(val), toI16(gain & 0xff)) >> 7;
}

/**
 * Pick a short value: when ref ∈ 1..4 read variables[ref], else use literal.
 * Mirrors refrender.c `pick_short`.
 */
export function pickShort(ref: number, literal: number, vars: Int16Array): number {
  if (ref > 0 && ref <= 4) return vars[ref]!;
  return toI16(literal);
}

/**
 * Pick a UBYTE: same convention but masks low 8 bits.
 * Mirrors refrender.c `pick_byte` — note ref/literal are uint8.
 */
export function pickByte(ref: number, literal: number, vars: Int16Array): number {
  if (ref > 0 && ref <= 4) return vars[ref]! & 0xff;
  return literal & 0xff;
}

/** Convenience re-export of the Slot type for op files. */
export type { Slot };
