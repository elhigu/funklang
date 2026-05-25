// Constraints for the loop region (op22 loop_gen).
//
// Klang's loop region always runs from `loopOffset` to the END of the
// sample buffer, so loopLength is fully determined by sampleLength and
// loopOffset — the user only picks the offset. The constraints (lifted
// from user-stated rules):
//
//   * sampleLength is always even (enforced upstream when the user
//     edits it; existing patches are assumed to comply).
//   * loopOffset must be even (divisible by 2).
//   * loopOffset must leave at least 2 samples in the loop region —
//     i.e. loopOffset <= sampleLength - 2.
//   * loopOffset must be >= floor(sampleLength / 4) * 2 — the loop
//     can start no earlier than (approximately) halfway through the
//     sample, snapped down to the nearest even index. This matches the
//     enumeration the user gave:
//        SL=2  → {0}
//        SL=4  → {2}
//        SL=6  → {2,4}
//        SL=8  → {4,6}
//        SL=10 → {4,6,8}
//        SL=12 → {6,8,10}

/** Smallest loop offset valid for `sampleLength`. */
export function minLoopOffset(sampleLength: number): number {
  // floor(SL/4) * 2  ==  (SL >>> 2) << 1.  Works for SL=2 (→ 0) and up.
  if (sampleLength <= 0) return 0;
  return (sampleLength >>> 2) << 1;
}

/** Largest loop offset valid for `sampleLength` (leaves ≥2 samples in the loop). */
export function maxLoopOffset(sampleLength: number): number {
  if (sampleLength <= 2) return 0;
  return sampleLength - 2;
}

/** Enumerate every valid loop offset (ascending) for a given sample length. */
export function validLoopOffsets(sampleLength: number): number[] {
  if (sampleLength < 2) return [];
  const lo = minLoopOffset(sampleLength);
  const hi = maxLoopOffset(sampleLength);
  if (hi < lo) return [];
  const out: number[] = [];
  for (let v = lo; v <= hi; v += 2) out.push(v);
  return out;
}

/**
 * Clamp a proposed loop offset to the nearest VALID value for `sampleLength`.
 * Returns 0 when sampleLength has no room for a loop (≤ 2 samples).
 */
export function clampLoopOffset(sampleLength: number, proposed: number): number {
  if (sampleLength <= 2) return 0;
  const lo = minLoopOffset(sampleLength);
  const hi = maxLoopOffset(sampleLength);
  let v = Math.max(lo, Math.min(hi, proposed | 0));
  // Snap down to the nearest even index.
  if (v & 1) v -= 1;
  if (v < lo) v = lo;
  if (v > hi) v = hi;
  return v;
}

/**
 * Loop region length implied by a (sampleLength, loopOffset) pair.
 * Always `sampleLength - loopOffset`; no separate length field is needed.
 */
export function loopLengthFor(sampleLength: number, loopOffset: number): number {
  return Math.max(0, sampleLength - loopOffset);
}
