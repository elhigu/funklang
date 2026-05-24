// Patch / instrument / slot types for funklang.
//
// On-disk layout reference: funklang/docs/format-notes.md
// (verified against decompiled AmigaKlangGUI.Form1 save/load routines).

export const AKP_MAGIC = 0x02ceda9f; // 47110815
export const AKI_MAGIC = AKP_MAGIC + 1; // 0x02CEDAA0 = 47110816

export const N_INSTRUMENTS = 31;
export const N_SLOTS_MAX = 20;
// 8, not 9 — the saver loops `for (int k = 0; k < 8; k++)` (see format-notes.md).
export const N_IMPORTS = 8;

/** Variable reference index (0..4) used by `outVar` / `val1` / `val2`. */
export type VarRef = 0 | 1 | 2 | 3 | 4;

/**
 * One synthesis slot. Fields appear in the order they live on disk
 * (see format-notes.md, "Slot layout — exact field order"). 33 bytes total.
 */
export interface Slot {
  outVar: number;     // arrayvar       Int32
  fn: number;         // arrayfunction  Int32
  instance: number;   // arrayinstance  UInt8
  freq: number;       // arrayfrequency Int16
  freqVal: number;    // arrayfrequencyval Int16
  gain: number;       // arraygain      UInt8
  gainVal: number;    // arraygainval   UInt8
  width: number;      // arraywidth     UInt8
  widthVal: number;   // arraywidthval  UInt8
  val1: number;       // arrayval1      Int16
  val1Value: number;  // arrayval1value Int16
  val2: number;       // arrayval2      Int16
  val2Value: number;  // arrayval2value Int16
}

export interface Instrument {
  name: string;
  sampleLength: number;
  loopOffset: number;
  loopLength: number;
  slots: Slot[]; // length 0..N_SLOTS_MAX
}

export interface ImportedSample {
  name: string;
  data: Int8Array;
}

export interface Patch {
  instruments: Instrument[];   // length N_INSTRUMENTS
  importedSamples: ImportedSample[]; // length N_IMPORTS
}

export function emptySlot(): Slot {
  return {
    outVar: 0,
    fn: 0,
    instance: 0,
    freq: 0,
    freqVal: 0,
    gain: 0,
    gainVal: 0,
    width: 0,
    widthVal: 0,
    val1: 0,
    val1Value: 0,
    val2: 0,
    val2Value: 0,
  };
}

export function emptyInstrument(name = ''): Instrument {
  return {
    name,
    sampleLength: 0,
    loopOffset: 0,
    loopLength: 0,
    slots: [],
  };
}

export function emptyImportedSample(name = ''): ImportedSample {
  return { name, data: new Int8Array(0) };
}

export function emptyPatch(): Patch {
  const instruments: Instrument[] = [];
  for (let i = 0; i < N_INSTRUMENTS; i++) instruments.push(emptyInstrument());
  const importedSamples: ImportedSample[] = [];
  for (let i = 0; i < N_IMPORTS; i++) importedSamples.push(emptyImportedSample());
  return { instruments, importedSamples };
}
