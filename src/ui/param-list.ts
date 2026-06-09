// The ordered list of TUNABLE sliders for an instrument — the spine of the
// touch value tuner's swipe-up/down navigation. A "tunable" param is one the
// editor draws as a knob the user can drag a numeric value on:
//   - `const-int`     → always a knob.
//   - `var-or-const`  → a knob ONLY in const mode (its selector field === 0);
//                       when sourced from a variable there's no value to tune.
// Everything else (var-source / enum / instr-ref / sample-ref dropdowns) is
// not a draggable value, so it's skipped.
//
// Pure: takes the patch, returns plain data. No DOM, no model.

import type { Patch, Slot } from '../patch/types';
import { opByCode } from '../schema/op-metadata';

export interface TunableParam {
  /** Model slot index within the instrument. */
  slotIdx: number;
  /** Slot field holding the literal value. */
  field: keyof Slot;
  /** Display label (e.g. "freq", "gain", "offset"). */
  label: string;
  min: number;
  max: number;
  /** Value granularity — 1 normally, 2 for the clone read offset. */
  step: number;
  /** Knob response curve, mirrors the slot-grid knob. */
  scale: 'linear' | 'pow';
  /** Current value. */
  value: number;
}

/**
 * Ordered tunable sliders for instrument `instrIdx`, in (slot, param) order —
 * exactly the sequence the swipe gesture walks. Mirrors the slot-grid's own
 * knob rules (including the clone-offset dynamic max + step 2) so the tuner
 * and the inline knobs always agree on range.
 */
export function tunableParams(patch: Patch, instrIdx: number): TunableParam[] {
  const ins = patch.instruments[instrIdx];
  if (!ins) return [];
  const out: TunableParam[] = [];
  for (let slotIdx = 0; slotIdx < ins.slots.length; slotIdx++) {
    const slot = ins.slots[slotIdx]!;
    if (slot.fn === 0) continue;
    const def = opByCode(slot.fn);
    if (!def) continue;
    for (const p of def.params) {
      const t = p.type;
      if (t.kind === 'const-int') {
        // Clone (fn=17) read offset: max = source sample length − 2, step 2.
        const isCloneOffset = slot.fn === 17 && p.field === 'val2Value';
        const max = isCloneOffset
          ? Math.max(2, (patch.instruments[slot.gain]?.sampleLength ?? t.max) - 2)
          : t.max;
        out.push({
          slotIdx, field: p.field, label: t.label,
          min: t.min, max, step: isCloneOffset ? 2 : 1,
          scale: t.scale ?? 'linear', value: slot[p.field] as number,
        });
      } else if (t.kind === 'var-or-const') {
        // Only tunable when in const mode (selector field === 0).
        const sel = p.selector ? (slot[p.selector] as number) : 0;
        if (sel !== 0) continue;
        out.push({
          slotIdx, field: p.field, label: t.label,
          min: t.min, max: t.max, step: 1,
          scale: t.scale ?? 'linear', value: slot[p.field] as number,
        });
      }
    }
  }
  return out;
}

/** Index of the (slotIdx, field) entry in `list`, or -1 if absent. */
export function paramIndex(list: TunableParam[], slotIdx: number, field: keyof Slot): number {
  return list.findIndex((p) => p.slotIdx === slotIdx && p.field === field);
}
