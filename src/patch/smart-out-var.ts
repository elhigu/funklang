// "Smart" outVar default for a newly-inserted slot.
//
// User intent (paraphrased): when adding a slot, the editor should pick
// an `outVar` that's actually useful — either a variable that some
// earlier slot has already READ (so writing to it has someone to feed)
// or, failing that, the smallest variable nothing has touched yet. We
// avoid clobbering a variable that an earlier slot wrote AND a later
// slot still depends on.
//
// Algorithm:
//   1. Walk slots BEFORE `atIdx`, collecting:
//        - varsWritten: set of vars written by an earlier slot's outVar.
//        - varsRead:    set of vars read as input (var-source field or
//                       a var-or-const selector > 0).
//   2. First choice: smallest var (1..4) in `varsRead` — i.e. some
//      earlier slot reads it (it could be from a var-source we're about
//      to fill, or an `add` chain that wants to keep accumulating).
//   3. Fallback: smallest var in [1..4] NOT in varsWritten — the next
//      truly "free" variable.
//   4. Last resort: 1 — every var is in use, just pick the first.

import { opByCode } from '../schema/op-metadata';
import type { Instrument } from './types';

export function pickSmartOutVar(ins: Instrument, atIdx: number): number {
  const written = new Set<number>();
  const read = new Set<number>();
  for (let i = 0; i < atIdx && i < ins.slots.length; i++) {
    const s = ins.slots[i]!;
    if (s.fn === 0) continue;
    if (s.outVar > 0) written.add(s.outVar);
    const op = opByCode(s.fn);
    if (!op) continue;
    for (const p of op.params) {
      if (p.type.kind === 'var-source') {
        const v = s[p.field] as number;
        if (v > 0) read.add(v);
      } else if (p.type.kind === 'var-or-const' && p.selector) {
        const v = s[p.selector] as number;
        if (v > 0) read.add(v);
      }
    }
  }
  for (let v = 1; v <= 4; v++) if (read.has(v)) return v;
  for (let v = 1; v <= 4; v++) if (!written.has(v)) return v;
  return 1;
}
