import type { Patch } from '../../src/patch/types';
import { highestInstrument } from '../../src/codegen/emit-ilen';
import { MOD_LENGTH_EMPTY } from './minimal-mod';

export function emitIset(patch: Patch): string {
  const numinstruments = highestInstrument(patch);
  let imp = 0;
  for (const s of patch.importedSamples) imp += s.data.length;
  let gen = 0;
  for (const ins of patch.instruments) gen += Math.max(0, ins.sampleLength | 0);
  return (
    '#define executable\r\n' +
    `#define numinstruments ${numinstruments}\r\n` +
    'const void * protrackermod;\r\n' +
    'INCBIN(protrackermod, "empty.mod");\r\n' +
    'const void * importedsamples;\r\n' +
    'INCBIN(importedsamples, "Isamp.raw");\r\n' +
    `int mod_length_empty = ${MOD_LENGTH_EMPTY};\r\n` +
    `int imp_length = ${imp};\r\n` +
    `long gen_length = ${gen};\r\n`
  );
}

export function emitIswitch(): string {
  return '#define executable\r\n';
}

/** Iset.h for the BINARY target (Form1.cs exportBinary, 6413-6425): no mod /
 *  INCBIN / gen_length — main-binary.c is a relocatable blob, not a player. */
export function emitIsetBinary(patch: Patch): string {
  const numinstruments = highestInstrument(patch);
  let imp = 0;
  for (const s of patch.importedSamples) imp += s.data.length;
  return (
    '#define binary\r\n' +
    `#define numinstruments ${numinstruments}\r\n` +
    `int imp_length = ${imp};\r\n`
  );
}

export function emitIswitchBinary(): string {
  return '#define binary\r\n';
}
