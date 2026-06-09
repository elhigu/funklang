import type { Slot } from '../patch/types';
import { VARTEXT } from './arg-emit';

function freqExpr(slot: Slot): string {
  return slot.freq > 0 ? VARTEXT[slot.freq]! : String(slot.freqVal);
}

// case 20 (Form1.cs 5455-5463)
export function emitImported(slot: Slot): string {
  const g = slot.gain;
  return `smp < ImpLength[${g}] ? *(BYTE*)(BaseImpAdr[${g}]+smp)<<8 : 0`;
}

// case 17 (Form1.cs 5328-5394)
export function emitClone(slot: Slot, _k: number): string {
  const F = freqExpr(slot);
  const off = slot.val2Value;
  const g = slot.gain;
  const idx = `((smp*(${F}+32768))>>15)+${off}`;
  const cond = `(${idx})< SmpLength[${g}] ? `;
  if (slot.gainVal === 0) {
    return `${cond}*(BYTE*)(BaseAdr[${g}]+${idx})<<8 : 0`;
  }
  return `${cond}*(BYTE*)(BaseAdr[${g + 1}]-(${idx}))<<8 : 0`;
}

// case 23 (Form1.cs 5491-5529)
export function emitAdsr(slot: Slot, l: number, sampleLength: number): string {
  const num = (slot.val2Value << 8) + 1;
  const num2 = (slot.val1Value << 8) + 1;
  const num3 = (slot.freqVal << 8) + 1;
  const num4 = sampleLength - num - num2 - num3;
  const b = slot.gainVal & 0xff;
  const num5 = (slot.widthVal << 8) << 16 >> 16; // (short)(widthVal<<8)
  const num6 = (32767 * b) << 1;
  const num7 = (num5 * b) << 1;
  const num8 = Math.trunc(num6 / num);
  const num9 = Math.trunc((num6 - num7) / num2);
  const num10 = Math.trunc(num7 / num3);
  return `${l}, ${num8}, ${num9}, ${num7}, ${num4}, ${num10}, ${num6}`;
}
