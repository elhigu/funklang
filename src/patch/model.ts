// Mutator-facing wrapper around a Patch. All edits go through here so the
// editor (and anyone else listening) can observe changes via `events`.

import { EventBus } from './events';
import type { PatchChange } from './events';
import { N_INSTRUMENTS, N_SLOTS_MAX } from './types';
import type { Instrument, Patch, Slot } from './types';

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
    this.events.emit({ instrIdx, kind: 'param' });
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
    instr[key] = value;
    this.events.emit({ instrIdx, kind: 'meta' });
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
