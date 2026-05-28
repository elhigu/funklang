// Mutator-facing wrapper around a Patch. All edits go through here so the
// editor (and anyone else listening) can observe changes via `events`.

import { EventBus } from './events';
import type { PatchChange } from './events';
import { N_INSTRUMENTS, N_SLOTS_MAX } from './types';
import type { Instrument, Patch, Slot } from './types';
import { clampLoopOffset } from './loop-rules';

export class PatchModel {
  readonly events = new EventBus<PatchChange>();

  constructor(public patch: Patch) {}

  setSlotParam<K extends keyof Slot>(
    instrIdx: number,
    slotIdx: number,
    key: K,
    value: Slot[K],
  ): void {
    const instr = this.instr(instrIdx);
    const slot = instr.slots[slotIdx];
    if (!slot) throw new RangeError(`slot index out of range: ${slotIdx}`);
    slot[key] = value;
    // Changing `fn` is structural — the slot's whole param schema changes,
    // so the UI needs to rebuild the row (new knobs, new labels) rather
    // than just refresh the existing waveform tap.
    // Changing `outVar` is structural for OTHER slots: it widens (or
    // narrows) the set of variables earlier slots have written to, which
    // affects the var-source warning colours rendered by LATER slots.
    if (key === 'fn' || key === 'outVar') {
      this.events.emit({ instrIdx, kind: 'structure' });
    } else {
      this.events.emit({
        instrIdx,
        kind: 'param',
        coalesceKey: { instrIdx, slotIdx, field: String(key) },
      });
    }
  }

  insertSlot(instrIdx: number, at: number, slot: Slot): void {
    const instr = this.instr(instrIdx);
    if (instr.slots.length >= N_SLOTS_MAX) {
      throw new RangeError(`cannot insert: instrument already has ${N_SLOTS_MAX} slots`);
    }
    const clamped = Math.max(0, Math.min(at, instr.slots.length));
    instr.slots.splice(clamped, 0, slot);
    this.events.emit({ instrIdx, kind: 'structure' });
  }

  removeSlot(instrIdx: number, at: number): void {
    const instr = this.instr(instrIdx);
    if (at < 0 || at >= instr.slots.length) return;
    instr.slots.splice(at, 1);
    this.events.emit({ instrIdx, kind: 'structure' });
  }

  /** Splice-remove `from`, then splice-insert at `to` in the post-removal array. */
  moveSlot(instrIdx: number, from: number, to: number): void {
    const instr = this.instr(instrIdx);
    if (from < 0 || from >= instr.slots.length) return;
    const [moved] = instr.slots.splice(from, 1);
    if (!moved) return;
    const clamped = Math.max(0, Math.min(to, instr.slots.length));
    instr.slots.splice(clamped, 0, moved);
    this.events.emit({ instrIdx, kind: 'structure' });
  }

  setInstrumentField<K extends keyof Instrument>(
    instrIdx: number,
    key: K,
    value: Instrument[K],
  ): void {
    const instr = this.instr(instrIdx);
    // Klang requires even sample lengths. Round DOWN to the nearest even
    // value as a defensive floor — the UI already does this on input but
    // a stray caller (history-restore, future API, …) shouldn't be able
    // to put an odd value into the model.
    if (key === 'sampleLength' && typeof value === 'number') {
      const v = value | 0;
      (value as unknown as number) = Math.max(0, v - (v & 1));
    }
    // Capture sampleLength BEFORE the assignment so we can rescale
    // loopOffset proportionally — user-stated rule: the loop region
    // should keep the same fractional position when the sample is
    // resized. Otherwise lowering sampleLength can pin loopOffset to
    // the new maximum and shrink the loop to almost nothing.
    const oldSL = instr.sampleLength;
    instr[key] = value;

    if (key === 'sampleLength') {
      const newSL = instr.sampleLength;
      if (oldSL > 0 && newSL > 0 && instr.loopOffset > 0 && oldSL !== newSL) {
        // Scale linearly: newOffset / newSL == oldOffset / oldSL.
        instr.loopOffset = Math.round(instr.loopOffset * newSL / oldSL);
      }
      // Snap to the legal even range for the new sampleLength.
      const snappedOffset = clampLoopOffset(instr.sampleLength, instr.loopOffset);
      if (snappedOffset !== instr.loopOffset) instr.loopOffset = snappedOffset;
      const newLen = Math.max(0, instr.sampleLength - instr.loopOffset);
      if (newLen !== instr.loopLength) instr.loopLength = newLen;
    }

    this.events.emit({
      instrIdx,
      kind: 'meta',
      // slotIdx=-1 sentinel for instrument-level mutations so the history
      // layer can coalesce a loop-handle drag into a single undo step.
      coalesceKey: { instrIdx, slotIdx: -1, field: String(key) },
    });
  }

  private instr(instrIdx: number): Instrument {
    if (instrIdx < 0 || instrIdx >= N_INSTRUMENTS) {
      throw new RangeError(`instrument index out of range: ${instrIdx}`);
    }
    const instr = this.patch.instruments[instrIdx];
    if (!instr) throw new RangeError(`instrument missing at index: ${instrIdx}`);
    return instr;
  }
}
