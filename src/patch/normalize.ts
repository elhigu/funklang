// Boundary normalisation for a freshly-loaded Patch. Klang's GUI never
// enforced the "sampleLength must be even" rule, and a hand-edited .akp
// can hold any value, so the parser is kept byte-faithful and the
// editor calls `normalizePatch` once at adoption time:
//
//   * sampleLength is rounded DOWN to the nearest even value (matches
//     the `setInstrumentField` defensive floor — never round UP, since
//     that could push past the end of the original sample data).
//   * loopOffset is clamped to the valid set for the (post-rounding)
//     sampleLength via `clampLoopOffset`.
//   * loopLength is recomputed from `sampleLength − loopOffset` (it is
//     never a user choice; the field exists on disk for compat).

import type { Patch } from './types';
import { clampLoopOffset, loopLengthFor } from './loop-rules';

export function normalizePatch(patch: Patch): void {
  for (const ins of patch.instruments) {
    if (ins.sampleLength < 0) ins.sampleLength = 0;
    if (ins.sampleLength & 1) ins.sampleLength -= 1;
    if (ins.sampleLength <= 0) {
      ins.loopOffset = 0;
      ins.loopLength = 0;
      continue;
    }
    ins.loopOffset = clampLoopOffset(ins.sampleLength, ins.loopOffset);
    ins.loopLength = loopLengthFor(ins.sampleLength, ins.loopOffset);
  }
}
