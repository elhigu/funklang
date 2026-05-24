// .aki (single-instrument) parser & serializer.
//
// On-disk layout: see funklang/docs/format-notes.md.
//
//   magic Int32 = 0x02CEDAA0
//   sampleLength Int32
//   20 slots × 33 bytes (same slot layout as .akp; loopOffset/loopLength embedded)
//
// File is asserted to be exactly 668 bytes (4 + 4 + 20*33). The .aki does not
// store the instrument name on disk (the original GUI takes the name from the
// filename); parseAki sets name = ''.

import { BinReader, BinWriter } from './binio';
import { AKI_MAGIC, N_SLOTS_MAX, emptyInstrument, emptySlot } from '../patch/types';
import type { Instrument, Slot } from '../patch/types';

const AKI_SIZE = 4 + 4 + N_SLOTS_MAX * 33; // 668

function readSlot(r: BinReader, ins: Instrument): Slot {
  const slot: Slot = {
    outVar: r.i32(),
    fn: r.i32(),
    instance: r.u8(),
    freq: r.i16(),
    freqVal: r.i16(),
    gain: r.u8(),
    gainVal: r.u8(),
    width: r.u8(),
    widthVal: r.u8(),
    val1: r.i16(),
    val1Value: r.i16(),
    val2: r.i16(),
    val2Value: r.i16(),
  };
  ins.loopOffset = r.i32();
  ins.loopLength = r.i32();
  return slot;
}

function writeSlot(w: BinWriter, slot: Slot, ins: Instrument): void {
  w.i32(slot.outVar);
  w.i32(slot.fn);
  w.u8(slot.instance);
  w.i16(slot.freq);
  w.i16(slot.freqVal);
  w.u8(slot.gain);
  w.u8(slot.gainVal);
  w.u8(slot.width);
  w.u8(slot.widthVal);
  w.i16(slot.val1);
  w.i16(slot.val1Value);
  w.i16(slot.val2);
  w.i16(slot.val2Value);
  w.i32(ins.loopOffset);
  w.i32(ins.loopLength);
}

function isEmptySlot(s: Slot): boolean {
  return (
    s.outVar === 0 &&
    s.fn === 0 &&
    s.instance === 0 &&
    s.freq === 0 &&
    s.freqVal === 0 &&
    s.gain === 0 &&
    s.gainVal === 0 &&
    s.width === 0 &&
    s.widthVal === 0 &&
    s.val1 === 0 &&
    s.val1Value === 0 &&
    s.val2 === 0 &&
    s.val2Value === 0
  );
}

export function parseAki(bytes: Uint8Array): Instrument {
  if (bytes.length !== AKI_SIZE) {
    throw new Error(`bad .aki length: got ${bytes.length} expected ${AKI_SIZE}`);
  }
  const r = new BinReader(bytes);
  const magic = r.i32();
  if (magic !== AKI_MAGIC) {
    throw new Error(
      `bad magic: got 0x${(magic >>> 0).toString(16)} expected 0x${AKI_MAGIC.toString(16)} (.aki)`,
    );
  }
  const ins = emptyInstrument('');
  ins.sampleLength = r.i32();
  const slots: Slot[] = [];
  for (let i = 0; i < N_SLOTS_MAX; i++) slots.push(readSlot(r, ins));
  let end = slots.length;
  while (end > 0 && isEmptySlot(slots[end - 1]!)) end--;
  ins.slots = slots.slice(0, end);
  return ins;
}

export function serializeAki(ins: Instrument): Uint8Array {
  const w = new BinWriter();
  w.i32(AKI_MAGIC);
  w.i32(ins.sampleLength);
  const padded: Slot[] = ins.slots.slice(0, N_SLOTS_MAX);
  while (padded.length < N_SLOTS_MAX) padded.push(emptySlot());
  for (const s of padded) writeSlot(w, s, ins);
  const out = w.toUint8();
  if (out.length !== AKI_SIZE) {
    throw new Error(`serializeAki produced ${out.length} bytes, expected ${AKI_SIZE}`);
  }
  return out;
}
