// Op 22 — Loop Generator (post-render side-effect, NOT a per-tick op).
//
// In real Klang, op 22 is a flag: when slot[15] of an instrument has fn==22,
// the code-generator (Form1.cs lines 4828, 1471-1474) emits a
// `samplename_flag[i] = 'l'` token. The runtime (main-binary.c lines 83-86)
// checks that flag AFTER the per-tick render loop and, if set, runs
// `loopgen(repeat_length, repeat_offset, BaseAdr)` once over the instrument's
// 8-bit sample buffer. This crossfades the tail of the sample with the bytes
// `repeat_length` before the loop point so the sample loops seamlessly.
//
// `repeat_offset` and `repeat_length` are NOT slot fields — they are
// per-instrument values stored in the .akp (Instrument.loopOffset /
// Instrument.loopLength). The GUI sets them via a separate scrollbar that's
// only visible when op22 is present (Form1.cs case 22, lines 2105-2126).
//
// Reference: exe_creator/synthnodes.h lines 200-219.
//
//     void loopgen(WORD repeat_length, WORD repeat_offset, void* BaseAdr) {
//         BYTE* src1 = BaseAdr + repeat_offset;
//         BYTE* src2 = BaseAdr + repeat_offset - repeat_length;
//         int delta = divsw((32767 << 8), repeat_length);
//         int rampup = 0;
//         int rampdown = 32767 << 8;
//         for (smp = 0; smp < repeat_length; smp++) {
//             short a = (rampup >> 8);
//             short b = (rampdown >> 8);
//             BYTE s1 = src1[smp];
//             BYTE s2 = src2[smp];
//             BYTE blend = (mulsw(s1, b) + mulsw(s2, a)) >> 15;
//             src1[smp] = blend;
//             rampup += delta;
//             rampdown -= delta;
//         }
//     }
//
// The result overwrites the 8-bit `sampleBytes` (NOT the int16 `v1` stream).
// So the only audible effect on the rendered instrument itself comes through
// downstream clone/chordgen ops that read its bytes — and through real Amiga
// playback (which reads the same 8-bit buffer).
//
// CAVEATS:
//   - `repeat_offset - repeat_length` can be negative; C pointer arithmetic
//     produces a wild address. The GUI's `checkloopparams()` (Form1.cs lines
//     1400-1410) clamps `loopoffset >= samplelength/2 - 1` and
//     `looplength = samplelength - loopoffset` so this never actually
//     underflows in well-formed patches. We still guard defensively.
//   - `mulsw(s1, b)` truncates both to int16. `s1` is an int8 byte (-128..127)
//     so promotes cleanly; `b` is the high byte of a 0..32767 ramp (so
//     0..127 — fits in int16 trivially).
//   - `divsw` truncates toward zero. For repeat_length == 0 we no-op.
//   - The op runs ONLY if slot[15].fn === 22 (the GUI's exact trigger).

/**
 * Apply the loop crossfade to an instrument's 8-bit sample buffer, in-place.
 * Pass the instrument's loopOffset / loopLength fields and the
 * `bytes` produced by the per-tick render (length = sampleLength + 1).
 */
export function applyLoopGen(
  bytes: Int8Array,
  repeatOffset: number,
  repeatLength: number,
): void {
  const len = repeatLength | 0;
  const off = repeatOffset | 0;
  if (len <= 0) return;

  // divsw(32767 << 8, len) — C signed-int divide, truncates toward zero.
  // 32767 << 8 = 0x7FFF00 = 8_388_352.
  const delta = (8388352 / len) | 0;
  let rampup = 0;
  let rampdown = 8388352;

  for (let smp = 0; smp < len; smp++) {
    const a = (rampup >> 8) & 0xffff;       // short
    const b = (rampdown >> 8) & 0xffff;     // short

    // (a, b) are non-negative shorts (0..32767) so the int16 cast leaves them.
    const a16 = (a << 16) >> 16;
    const b16 = (b << 16) >> 16;

    const idx1 = off + smp;
    const idx2 = off - len + smp;

    // Defensive bounds — Form1.cs guarantees these never go OOB in
    // well-formed patches, but we don't want stray crashes on malformed input.
    const s1 = (idx1 >= 0 && idx1 < bytes.length) ? bytes[idx1]! : 0; // sign-extended
    const s2 = (idx2 >= 0 && idx2 < bytes.length) ? bytes[idx2]! : 0;

    // mulsw(s1, b) + mulsw(s2, a)  → both already int16. >> 15.
    const prod1 = Math.imul(s1, b16);
    const prod2 = Math.imul(s2, a16);
    let blend = (prod1 + prod2) >> 15;
    // Truncate to BYTE (int8). The C cast `BYTE blend = …` keeps low 8 bits
    // sign-extended on store; Int8Array does the same automatically.
    blend = (blend << 24) >> 24;

    if (idx1 >= 0 && idx1 < bytes.length) {
      bytes[idx1] = blend;
    }

    rampup += delta;
    rampdown -= delta;
  }
}

/**
 * Convenience: does this instrument's slot[15] trigger loopgen?
 * Mirrors the codegen condition in Form1.cs line 4828.
 */
export function shouldRunLoopGen(slots: ReadonlyArray<{ fn: number }>): boolean {
  if (slots.length <= 15) return false;
  return slots[15]!.fn === 22;
}
