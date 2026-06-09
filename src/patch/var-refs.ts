// How a variable read (v1..v4) resolves within an instrument's per-sample
// chain. The DSP engine's variable bank persists across samples (reset once
// per instrument, not per tick — see dsp/engine.ts), so a read of a variable
// that is only written by a LATER slot is NOT silence: it picks up that
// slot's output from the PREVIOUS sample — a deliberate one-sample feedback
// loop. Only a variable written by NO slot at all is truly unset (silence).

import type { Instrument } from './types';

export type VarRefKind = 'normal' | 'feedback' | 'unset';

export interface VarRef {
  kind: VarRefKind;
  /** Visible (1-based) row of the feedback source, when kind === 'feedback'. */
  feedbackRow?: number;
}

/**
 * Classify variable `v` (1..4) as read by the slot at model index `readerIdx`:
 *   - 'normal'   — written by an EARLIER slot → same-sample value.
 *   - 'feedback' — written only by later (or its own) slot → previous-sample
 *                  value via the persistent bank. Source = the LAST writer.
 *   - 'unset'    — written by no slot → always silence.
 * `v <= 0` (the "—" / const choice) is always 'normal'.
 */
export function classifyVarRef(ins: Instrument, readerIdx: number, v: number): VarRef {
  if (v <= 0) return { kind: 'normal' };
  let earlier = false;
  let lastWriter = -1;
  for (let i = 0; i < ins.slots.length; i++) {
    const s = ins.slots[i]!;
    if (s.fn !== 0 && s.outVar === v) {
      if (i < readerIdx) earlier = true;
      lastWriter = i;                       // highest-index writer wins each tick
    }
  }
  if (lastWriter < 0) return { kind: 'unset' };
  if (earlier) return { kind: 'normal' };
  return { kind: 'feedback', feedbackRow: visibleRow(ins, lastWriter) };
}

/** Visible (1-based) row number of a model slot index — counts non-empty slots. */
export function visibleRow(ins: Instrument, modelIdx: number): number {
  let row = 0;
  for (let i = 0; i <= modelIdx && i < ins.slots.length; i++) {
    if (ins.slots[i]!.fn !== 0) row++;
  }
  return row;
}

/** Option/label suffix for a variable given its classification. */
export function varRefLabel(base: string, st: VarRef): string {
  if (st.kind === 'unset') return `${base} (unset)`;
  if (st.kind === 'feedback') return `${base} (feedback #${st.feedbackRow})`;
  return base;
}
