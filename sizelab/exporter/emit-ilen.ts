import type { Patch } from '../../src/patch/types';
import { csHex } from './hex';

/** (max index with sampleLength>2) + 1. Form1.cs getnumberofhighestinstrument. */
export function highestInstrument(patch: Patch): number {
  let hi = 0;
  for (let i = 0; i < 31; i++) {
    if ((patch.instruments[i]?.sampleLength ?? 0) > 2) hi = i;
  }
  return hi + 1;
}

export function emitIlen(patch: Patch): string {
  let s = '';
  const n = highestInstrument(patch);
  for (let i = 0; i < n; i++) {
    const ins = patch.instruments[i]!;
    const flag = ins.slots[15]?.fn === 22 ? 'l' : ' ';
    s += `// ${ins.name}\r\n`;
    s += `SmpLength[${i}] = 0x${csHex(ins.sampleLength)};\r\n`;
    s += `repeat_offset[${i}] = 0x${csHex(ins.loopOffset)};\r\n`;
    s += `repeat_length[${i}] = 0x${csHex(ins.loopLength)};\r\n`;
    s += `samplename_flag[${i}] = '${flag}';\r\n`;
    s += `\r\n`;
  }
  for (let j = 0; j < 8; j++) {
    s += `ImpLength[${j}] = 0x${csHex(patch.importedSamples[j]?.data.length ?? 0)};\r\n`;
    s += `\r\n`;
  }
  return s;
}
