// Op 18 — chordgen(int sample, void* BaseAdr, BYTE n1, BYTE n2, BYTE n3, UBYTE shift)
//   int buf = *(BYTE*)(BaseAdr + sample) << 7;
//   if (n1==1 || n2==1 || n3==1) buf += *(BYTE*)(shift + BaseAdr + ((mulsw(sample, 271)) >> 8)) << 7;
//   if (n1==2 || ...)            buf += *(BYTE*)(shift + BaseAdr + ((mulsw(sample, 287)) >> 8)) << 7;
//   ... up to n==12 ...
//   if (n*==8|9|10) uses >>7 instead of >>8.
//   if (n*==12)     uses sample<<1 (no mulsw).
//   return clamp(buf);
//
// Source: exe_creator/synthnodes.h line 180-195.
// Args (per refrender.c case 18):
//   sample = smp (tick index)
//   BaseAdr = pre-rendered source instrument's sample bytes (BYTE-truncated v1).
//             Source instrument index is `slot.gain`.
//   n1 = (BYTE)slot.freq
//   n2 = (BYTE)slot.width
//   n3 = (BYTE)slot.val1
//   shift = (UBYTE)slot.val2Value
//
// Subtleties:
//   - BaseAdr+sample reads RAW signed-byte. We use Int8Array.
//   - Out-of-bounds reads in C UB — but in practice the source bytes are a
//     contiguous block within ModAdr. refrender.c case 18 doesn't bounds-
//     check at all (matches C exactly), so we mimic: if address falls
//     beyond `cloneBuffers[src].length`, we read 0 (mirrors how a calloc-
//     allocated buffer's tail bytes would be 0). This is the only safe
//     interpretation in JS.
//   - mulsw truncates each arg to int16; sample fits in int16 only for
//     sampleLength < 32768. For longer instruments the C code is buggy
//     (mulsw wraps); we reproduce the wrap exactly via toI16.
//   - "shift + BaseAdr + …" — shift is UBYTE (0..255), added to the
//     address. `*(BYTE*)(shift+ ...)` = signed-byte read.
//   - `<< 7` is short → int promotion then shift; result <= 127*128 = 16256.
//   - The buf accumulator is int; final clamp to short.

import type { OpFn } from '../types';
import { clampI16, toI16 } from './_helpers';

// Walking pattern: (note → (multiplier, shift-amount)). When mult==-1 the
// "sample<<1" form is used. Order matches synthnodes.h ascending n.
const STEPS: ReadonlyArray<[note: number, mult: number, shr: number]> = [
  [1,  271, 8],
  [2,  287, 8],
  [3,  304, 8],
  [4,  322, 8],
  [5,  342, 8],
  [6,  362, 8],
  [7,  383, 8],
  [8,  203, 7],
  [9,  215, 7],
  [10, 228, 7],
  [11, 483, 8],
  [12, -1,  0],   // sample << 1
];

function readSrcByte(src: Int8Array | undefined, addr: number): number {
  if (!src) return 0;
  if (addr < 0 || addr >= src.length) return 0;
  return src[addr]!;     // Int8Array — already sign-extended on read
}

export const op_chordgen: OpFn = (state, _slotIdx, vars, slot, t) => {
  const srcInst = slot.gain;
  const src = state.cloneBuffers.get(srcInst);
  // refrender.c case 18: if src missing/out-of-range → 0.
  if (!src) return 0;

  const n1 = (slot.freq  << 24) >> 24;     // BYTE (signed int8)
  const n2 = (slot.width << 24) >> 24;
  const n3 = (slot.val1  << 24) >> 24;
  // shift: literal val2Value, OR variable[val2] when val2 > 0 (Form1.cs
  // case 18 line 1338-1341). pickByte semantics.
  const shift = (slot.val2 > 0 && slot.val2 <= 4)
    ? (vars[slot.val2]! & 0xff)
    : (slot.val2Value & 0xff);

  // First term: *(BYTE*)(BaseAdr + sample) << 7
  let buf = (readSrcByte(src, t) << 7) | 0;

  // mulsw: sample truncates to int16. We mirror via toI16.
  const sampI16 = toI16(t);

  for (const [note, mult, shr] of STEPS) {
    if (n1 !== note && n2 !== note && n3 !== note) continue;
    let offset: number;
    if (mult === -1) {
      // sample << 1
      offset = (t << 1) | 0;
    } else {
      // (mulsw(sample, mult)) >> shr
      offset = (Math.imul(sampI16, mult) >> shr) | 0;
    }
    const addr = (shift + offset) | 0;
    buf = (buf + (readSrcByte(src, addr) << 7)) | 0;
  }
  return clampI16(buf);
};
