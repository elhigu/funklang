// .akp (whole-patch) parser & serializer.
//
// On-disk layout: see funklang/docs/format-notes.md.
//
// Highlights:
//   - magic Int32 = 0x02CEDA9F
//   - 31 instruments × { name (LEB128+UTF-8), sampleLength i32, 20 slots × 33 bytes }
//   - each slot embeds loopOffset+loopLength (i32 each) at +25/+29; written 20×,
//     last-write-wins on load
//   - then optionally 8 imported-sample entries (length i32 + bytes). The original
//     loader only reads them if stream.Position < stream.Length; we mirror that.
//     The original saver ALWAYS writes them; we also always write 8 entries so
//     freshly-saved files round-trip exactly even if the loaded patch didn't have
//     the block.

import { BinReader, BinWriter } from './binio';
import {
  AKP_MAGIC,
  N_IMPORTS,
  N_INSTRUMENTS,
  N_SLOTS_MAX,
  emptyImportedSample,
  emptyInstrument,
  emptySlot,
} from '../patch/types';
import type { ImportedSample, Instrument, Patch, Slot } from '../patch/types';

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
  // loopOffset/loopLength live INSIDE the slot loop (per format-notes.md);
  // last-write-wins on load.
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

function readInstrument(r: BinReader): Instrument {
  const ins = emptyInstrument(r.cstr());
  ins.sampleLength = r.i32();
  const slots: Slot[] = [];
  for (let i = 0; i < N_SLOTS_MAX; i++) {
    slots.push(readSlot(r, ins));
  }
  // Trim trailing all-zero slots from the in-memory model so the editor only
  // surfaces filled rows. The serializer always re-pads back to 20.
  let end = slots.length;
  while (end > 0 && isEmptySlot(slots[end - 1]!)) end--;
  ins.slots = slots.slice(0, end);
  return ins;
}

function writeInstrument(w: BinWriter, ins: Instrument): void {
  w.cstr(ins.name);
  w.i32(ins.sampleLength);
  // The Amiga binary checks slot 15 specifically for loop_gen
  // (Form1.cs line 4828). When the in-memory model has loop_gen at
  // some OTHER index (typical for freshly-built dense patches),
  // re-arrange on save so on-disk slot 15 always holds loop_gen.
  // Non-loop_gen slots keep their model indices to preserve
  // per-slot `j` indexing used by cmb_flt_n / dly_cyc / counter_*
  // — that's why the bit-exact suite (all 164 loop_gen fixtures
  // sit at slot 15) keeps matching refrender after this change.
  const out: Slot[] = [];
  for (let i = 0; i < N_SLOTS_MAX; i++) out.push(emptySlot());
  const loopIdx = ins.slots.findIndex((s) => s.fn === 22);
  for (let i = 0; i < Math.min(N_SLOTS_MAX, ins.slots.length); i++) {
    if (i === loopIdx) continue;            // loop_gen handled below
    if (loopIdx >= 0 && i === 15) continue; // reserve slot 15 when a loop_gen exists
    out[i] = ins.slots[i]!;
  }
  if (loopIdx >= 0) out[15] = ins.slots[loopIdx]!;
  for (const s of out) writeSlot(w, s, ins);
}

export function parseAkp(bytes: Uint8Array): Patch {
  const r = new BinReader(bytes);
  const magic = r.i32();
  if (magic !== AKP_MAGIC) {
    throw new Error(
      `bad magic: got 0x${(magic >>> 0).toString(16)} expected 0x${AKP_MAGIC.toString(16)} (.akp)`,
    );
  }
  const instruments: Instrument[] = [];
  for (let i = 0; i < N_INSTRUMENTS; i++) {
    instruments.push(readInstrument(r));
  }
  const importedSamples: ImportedSample[] = [];
  for (let i = 0; i < N_IMPORTS; i++) {
    importedSamples.push(emptyImportedSample());
  }
  // Optional block: only present if more bytes remain.
  if (!r.eof) {
    for (let k = 0; k < N_IMPORTS; k++) {
      const name = r.cstr();
      const len = r.i32();
      const data = r.bytes_(len);
      // Int8Array view over the same bytes (preserves length & sign for .NET sbyte interop)
      const i8 = new Int8Array(data.buffer, data.byteOffset, data.byteLength);
      importedSamples[k] = { name, data: i8 };
    }
  }
  return { instruments, importedSamples };
}

export function serializeAkp(patch: Patch): Uint8Array {
  const w = new BinWriter();
  w.i32(AKP_MAGIC);
  if (patch.instruments.length !== N_INSTRUMENTS) {
    throw new Error(
      `expected ${N_INSTRUMENTS} instruments, got ${patch.instruments.length}`,
    );
  }
  for (const ins of patch.instruments) writeInstrument(w, ins);
  // Always write 8 imported-sample entries (matches the original saver, which
  // writes them unconditionally). Empty samples = empty name + length 0.
  if (patch.importedSamples.length !== N_IMPORTS) {
    throw new Error(
      `expected ${N_IMPORTS} imported samples, got ${patch.importedSamples.length}`,
    );
  }
  for (const s of patch.importedSamples) {
    w.cstr(s.name);
    w.i32(s.data.length);
    if (s.data.length > 0) {
      w.bytes_(new Uint8Array(s.data.buffer, s.data.byteOffset, s.data.byteLength));
    }
  }
  return w.toUint8();
}
