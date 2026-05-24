# Klang DSP reference (from `exe_creator/synthnodes.h` + `main-binary.c`)

Captured for funklang Phase 4. This is the ground truth the JS DSP must
reproduce bit-exact. Where the Form1 GUI code-generator (`/tmp/form1.cs`,
the `arrayfunctiontext` table and the `TextBoxTranslateInst` dispatch
switch) introduces extra glue (e.g. clone / imported-sample ops are
inline expressions rather than function calls), we paraphrase it here.

## 1. Type aliases (Amiga `gcc8_c_support.h`)

```c
typedef signed char       BYTE;     // int8_t
typedef unsigned char     UBYTE;    // uint8_t
typedef signed short      WORD;     // int16_t
typedef unsigned short    UWORD;    // uint16_t
typedef signed long       LONG;     // int32_t (LP32 Amiga ABI; on host long is 64-bit so we use int32_t)
typedef unsigned long     ULONG;    // uint32_t
```

## 2. Helper functions

These appear in `main-binary.c` / `main-executable.c` (NOT in
`synthnodes.h`), so the refrender harness must redefine them:

```c
short abs(short val);                 // saturating abs of a short
inline short clamp(int val);          // clip int → [-32768, 32767] short

// mulsw: from the Amiga toolchain, "multiply signed word". Computes
// (int)(short)a * (int)(short)b and returns the full 32-bit product.
// Inferred from usage: `mulsw(val, gain) >> 7`, `mulsw(buf, 32767-abs(buf)) >> 16`.
int  mulsw(int a, int b);             // = (int)(int16_t)a * (int)(int16_t)b

// divsw: signed-word divide; used only by loopgen.
int  divsw(int a, int b);             // = a / b
```

## 3. Per-op state arrays (referenced by `synthnodes.h`)

```c
static short  counter_saw   [16];   // osc_saw    : phase accumulator per slot
static short  counter_sh    [16];   // sh         : sample-and-hold countdown
static short  counter_tri   [16];   // osc_tri    : phase
static short  counter_sine  [16];   // osc_sine   : phase
static short  counter_pulse [16];   // osc_pulse  : phase
static short  buffer_sh     [16];   // sh         : held value
static short  ADSR_Mode     [16];   // adsr       : current segment (0..3)
static int    ADSR_Value    [16];   // adsr       : current envelope value
static int    ADSR_SustainCounter[16];
static short  filterBuffer  [16*4]; // sv_flt_n / onepole_flt scratch (lpf,hpf,bpf,pole per instance)
static short  buffern       [24][2048]; // dly_cyc / cmb_flt_n delay lines
static short  decayTable    [128];  // enva / envd lookup (large hard-coded table)

// Inside osc_noise() there is a local static LFSR (g_x1,g_x2,g_x3).
// Inside dly_cyc/cmb_flt_n there is a local static index array `i[16]` / `i[24]`.
```

`clr_buf()` zeros the first 16 entries of each per-slot array, all 64
entries of `filterBuffer`, and all 24×2048 entries of `buffern`.
**It is called per instrument** by the render driver, so state does
NOT persist across instruments. The osc_noise LFSR (file-scope static
inside the function) and the dly_cyc/cmb_flt_n `i[]` arrays are NOT
cleared by `clr_buf` — those persist across instruments. The JS port
must replicate that quirk.

## 4. Op function signatures (verbatim from `synthnodes.h`)

| Code | Name           | Signature                                                                      |
|------|----------------|--------------------------------------------------------------------------------|
| 1    | `vol`          | `short vol(short val, UBYTE gain)`                                             |
| 2    | `osc_saw`      | `short osc_saw(BYTE instance, short freq, UBYTE gain)`                         |
| 3    | `osc_tri`      | `short osc_tri(BYTE instance, short freq, UBYTE gain)`                         |
| 4    | `osc_sine`     | `short osc_sine(BYTE instance, short freq, UBYTE gain)`                        |
| 5    | `osc_pulse`    | `short osc_pulse(BYTE instance, short freq, UBYTE gain, UBYTE dutycycle)`      |
| 6    | `osc_noise`    | `short osc_noise(int sample, UBYTE gain)`                                      |
| 7    | `enva`         | `short enva(int sample, BYTE attack, BYTE sustain, UBYTE gain)`                |
| 8    | `envd`         | `short envd(int sample, BYTE decay, BYTE sustain, UBYTE gain)`                 |
| 9    | `add`          | `short add(short val1, short val2)`                                            |
| 10   | `mul`          | `short mul(short val1, short val2)`                                            |
| 11   | `dly_cyc`      | `short dly_cyc(BYTE instance, short val, short delay, UBYTE gain)`             |
| 12   | `cmb_flt_n`    | `short cmb_flt_n(BYTE instance, short val, short delay, UBYTE feedback, UBYTE gain)` |
| 13   | `reverb`       | `short reverb(short val, UBYTE feedback, UBYTE gain)`                          |
| 14   | `ctrl`         | `BYTE  ctrl(short val)`  *(returns BYTE, not short — `(val>>9)+64`)*           |
| 15   | `sv_flt_n`     | `short sv_flt_n(BYTE instance, short val, short cutoff, UBYTE resonance, BYTE mode)` |
| 16   | `distortion`   | `short distortion(int val, UBYTE gain)`                                        |
| 17   | **clone**      | NOT a function; inline expression — see §6                                     |
| 18   | `chordgen`     | `short chordgen(int sample, void* BaseAdr, BYTE n1, BYTE n2, BYTE n3, UBYTE shift)` |
| 19   | `sh`           | `short sh(BYTE instance, short val1, UBYTE step)`                              |
| 20   | **imported**   | NOT a function; inline expression — see §6                                     |
| 21   | `onepole_flt`  | `short onepole_flt(BYTE instance, short val, BYTE cutoff, BYTE mode)`          |
| 22   | **loop_gen**   | NOT a per-tick op; a post-render side effect — see §6.5. When slot[15].fn===22, runs `loopgen(loopLength, loopOffset, BaseAdr)` once after the per-tick render to crossfade the tail of the 8-bit sample buffer with the bytes `loopLength` before `loopOffset`. The pre-truncation v1 stream is unaffected; only the bytes that downstream clone/chordgen ops read are modified. |
| 23   | `adsr`         | `short adsr(BYTE inst, int attackAmount, int decayAmount, int sustainLevel, int sustainLength, int releaseAmount, int peak)` |
| 24   | `vocoder`      | declared in Form1.cs (`arrayfunctiontext[24]`) but has **no case in the code generator** and no function in synthnodes.h — effectively a no-op in v1. |

## 5. Variable convention

Each slot's "outVar" / "val1" / "val2" / "gain" / "freq" / "width"
field stores an *index*. The convention used by the code-generator
(Form1.cs, `arrayvartext = ["", "v1", "v2", "v3", "v4"]`):

- `0` → use the corresponding `*Value` field as a *literal*
- `1..4` → use `variable[N]` (one of `v1..v4`)

`outVar` is special: 0 means **skip this slot entirely** (the code-generator
also skips when `fn == 22`).

## 6. Inline ops (clone, imported sample) — emitted by Form1 directly

These are NOT in `synthnodes.h`. Form1.cs emits them as inline C
expressions into the generated `Inst.h`. Faithful reproduction:

### Op 17 — clone (source-instrument sampling with transpose/offset/reverse)

Form1 emits something equivalent to (paraphrased; see Form1.cs case 17
~line 5328):

```c
// freq = transpose (Int16), val2Value = offset (Int16, treated unsigned),
// gain = source-instrument index, gainVal = 0 → forward, !=0 → reverse.
int idx = ((smp * (freq + 32768)) >> 15) + (uint16_t)val2Value;
if (idx < SmpLength[srcInst]) {
    if (gainVal == 0) {
        out = (*(BYTE*)(BaseAdr[srcInst] + idx)) << 8;        // forward
    } else {
        out = (*(BYTE*)(BaseAdr[srcInst + 1] - idx)) << 8;    // reverse
    }
} else {
    out = 0;
}
```

The source instrument must therefore be rendered first. The harness
renders source-before-clone on demand with a cycle-depth cap.

### Op 20 — imported sample

```c
out = (smp < ImpLength[gain]) ? (*(BYTE*)(BaseImpAdr[gain] + smp)) << 8 : 0;
```

Imported samples are delta-decoded once at load (running prefix-sum of
signed bytes — see `main-binary.c` lines 56-62 / `main-executable.c`
509-515) before any rendering.

### 6.5 Op 22 — Loop Generator (post-render side-effect)

Op 22 is not a per-tick op. It is a flag: **when `arrayfunction[i, 15] == 22`**
(Form1.cs line 1471), the runtime applies the Loop Generator after the
instrument's per-tick render loop finishes. The trigger is hard-coded to
**slot index 15** (the 16th slot). Op 22 in any other slot is silently
ignored. There is no `case 22` in the per-tick switch — Form1.cs cases 18 → 19 → 20 → 21 → 23, skipping 22, and main-binary.c does likewise.

Codegen path (Form1.cs save → main-binary.c run):

1. Form1.cs line 4828: if `arrayfunction[i,15] == 22`, write
   `samplename_flag[i] = 'l';` into Ilen.h.
2. main-binary.c lines 83-86: after the per-tick loop, if
   `samplename_flag[i] == 'l'` then call
   `loopgen(repeat_length[i], repeat_offset[i], BaseAdr[i])`.
3. `repeat_offset[i]` and `repeat_length[i]` are NOT slot fields — they
   are per-instrument values stored separately in the .akp (the GUI's
   `loopoffset[i]` / `looplength[i]` arrays — Form1.cs case 22 panel,
   line 2105).

The C function (synthnodes.h lines 200-219):

```c
void loopgen(WORD repeat_length, WORD repeat_offset, void* BaseAdr) {
    BYTE* src1 = BaseAdr + repeat_offset;
    BYTE* src2 = BaseAdr + repeat_offset - repeat_length;
    int delta = divsw((32767 << 8), repeat_length);
    int rampup = 0;
    int rampdown = 32767 << 8;
    for (smp = 0; smp < repeat_length; smp++) {
        short a = rampup >> 8;
        short b = rampdown >> 8;
        BYTE s1 = src1[smp];
        BYTE s2 = src2[smp];
        BYTE blend = (mulsw(s1, b) + mulsw(s2, a)) >> 15;
        src1[smp] = blend;
        rampup += delta;
        rampdown -= delta;
    }
}
```

It crossfades the `repeat_length` bytes starting at `repeat_offset` with
the `repeat_length` bytes immediately preceding `repeat_offset`, ramping
from "all-pre-loop" at the start of the loop region to "all-post-loop"
at the end. The result makes the loop region wrap seamlessly into itself
when the Amiga hardware loops the sample.

**Critical**: loopgen modifies the post-truncation 8-bit bytes only. The
pre-truncation `v1` stream that refrender writes is untouched. So
loopgen's effect is **invisible to a one-instrument render** in the bit-
exact harness — but it IS observable when ANY downstream op17 (clone) or
op18 (chordgen) reads from the loop-generated instrument's byte buffer.
164 instruments across the project's test fixtures use op22, and 99
downstream slots read from them — so the integration coverage is real.

**JS / refrender implementation**:
- `funklang/src/dsp/ops/loop_gen.ts` — `applyLoopGen(bytes, off, len)`.
- `funklang/src/dsp/engine.ts` — calls `applyLoopGen()` in the post-tick
  block (after writing the 8-bit byte buffer, before returning); the
  bytes are then handed to any caller that uses this instrument as a
  clone/chordgen source via `RenderResult.bytes`.
- `funklang/tools/refrender/refrender.c` — calls `loopgen()` in the
  matching post-tick block of `render_instrument()`.
- Tests: `funklang/tests/dsp/loop_gen.test.ts` covers (a) the trigger
  predicate, (b) bytes mutation, (c) v1 stream is unaffected, and (d)
  downstream chordgen sees the modified bytes and JS↔C still match.

## 7. Render driver (paraphrase of `main-binary.c::synth`)

```text
For each instrument i in 0..numinstruments-1:
    clr_buf();
    v1 = v2 = v3 = v4 = 0
    For smp in 0..SmpLength[i] inclusive:        // note: <= not <
        For each slot j in 0..15:                // codegen iterates only 0..15
            if arrayvar[i,j] == 0 or fn == 22:   // skip empty / loop-cfg
                continue
            compute `out` per dispatch table above, reading either
                v1..v4 (when the index field is >0) or the *Value literal
            v[arrayvar[i,j]] = out
        sampleByte = (v1 >> 8) & 0xff            // truncate to 8-bit Amiga sample
        BaseAdr[i][smp] = (BYTE)sampleByte
    If samplename_flag[i] == 'l':
        loopgen(repeat_length[i], repeat_offset[i], BaseAdr[i])
    BaseAdr[i][0] = BaseAdr[i][1] = 0            // silence first two bytes
```

Key observations driving the refrender design:

1. **The final output is always `v1`.** The C generator hard-codes
   the assignment `*(BYTE*)(BaseAdr[i]+smp) = v1` after the per-tick
   slot loop. Other variables (v2..v4) are scratch.
2. **Sample loop is inclusive (`smp <= SmpLength`).** That produces
   `SmpLength+1` samples. We replicate this exactly.
3. **Amiga sample resolution is 1 signed byte (8-bit).** `v1>>=8`
   truncates the 16-bit DSP output to 8 bits before storage.
   refrender writes the *pre-truncation* `v1` as Int16 LE so that
   the JS DSP can verify the full-precision internal value. (Truncating
   to 8-bit would mask tiny low-bit bugs.)
4. **Clone op reads `BaseAdr[src]+idx`** — i.e. the bytes already
   written by the source instrument's render. So clone is a *cross-
   instrument* dependency. refrender resolves it by recursively
   rendering the source instrument (with cycle detection).
5. **v1..v4 reset between ticks** (re-initialized to 0 at the top
   of the smp loop in main-binary.c… actually no: `v1=0;v2=0;v3=0;v4=0`
   sits *outside* the `for smp` loop. So variables persist between
   ticks within an instrument.) **CORRECTION after re-reading lines
   76-82:** `v1=0;...v4=0` is set once per *instrument*, then the
   sample loop runs. So v1..v4 carry over between ticks. The slot
   loop runs every tick and writes them. Slots that don't fire
   leave the previous tick's value in place.

## 8. Slot field → op argument mapping (from Form1's `case` arms)

(For the JS dispatch table; numbers in parens are the field's role.)

| Op | Args sourced from slot fields                                                            |
|----|------------------------------------------------------------------------------------------|
| 1  vol         | `val1`/`val1Value` → val ; `gain`/`gainVal` → gain                          |
| 2  osc_saw     | slot-index `j` → instance ; `freq`/`freqVal` ; `gain`/`gainVal`             |
| 3  osc_tri     | same shape as osc_saw                                                       |
| 4  osc_sine    | same shape as osc_saw                                                       |
| 5  osc_pulse   | osc_saw shape + `width`/`widthVal` → dutycycle                              |
| 6  osc_noise   | `smp` → sample ; `gain`/`gainVal` → gain                                    |
| 7  enva        | `smp` → sample ; `val1`/`val1Value` → attack ; literal 0 → sustain ; gain   |
| 8  envd        | `smp` ; `val1`/`val1Value` → decay ; `val2`/`val2Value` → sustain ; gain    |
| 9  add         | `val1` (must be v1..v4, no literal) ; `val2`/`val2Value`                    |
| 10 mul         | `val1` (must be v1..v4) ; `val2`/`val2Value`                                |
| 11 dly_cyc     | `j` → instance ; `val1` (must be v1..v4) ; `freq`/`freqVal` ; `gain`        |
| 12 cmb_flt_n   | `j` → instance ; `val1` (v1..v4) ; `freq`/`freqVal` ; `val2`/`val2Value` → feedback ; `gain` |
| 13 reverb      | `val1` (v1..v4) ; `val2`/`val2Value` → feedback ; `gain`                    |
| 14 ctrl        | `val1` (v1..v4) only                                                        |
| 15 sv_flt_n    | `j` → instance ; `val1` (v1..v4) ; `freq`/`freqVal` ; `val2`/`val2Value` → resonance ; **raw `gain` byte** → mode (NOT gain channel!) |
| 16 distortion  | `val1` (v1..v4) ; `gain`/`gainVal`                                          |
| 17 clone       | inline; uses `freq`/`freqVal` (transpose), `gain` (src instr idx), `gainVal` (reverse flag), `val2Value` (offset) |
| 18 chordgen    | `smp` ; `BaseAdr[gain]` ; `freq`,`width`,`val1` → n1,n2,n3 ; `val2Value` → shift |
| 19 sh          | `j` → instance ; `val1` (v1..v4) ; `gain`/`gainVal` → step                  |
| 20 imported    | inline; `gain` → import index                                               |
| 21 onepole_flt | `j` → instance ; `val1` (v1..v4) ; `freq`/`freqVal` → cutoff ; raw `gain` byte → mode |
| 22 loop_gen    | NO slot args (per-tick); post-render uses the instrument's `loopOffset`/`loopLength` fields. Trigger is hard-coded to slot index 15 only — see §6.5. |
| 23 adsr        | `j` → instance ; pre-computed integers derived from val2Value/val1Value/freqVal/widthVal/gainVal — see Form1.cs lines 5491-5530. The harness must mirror that computation. |
| 24 vocoder     | (no-op in v1)                                                               |

## 9. Notes on op 23 (`adsr`) argument pre-computation

Form1.cs case 23 (lines 5491-5530) does NOT pass the slot fields
directly; it pre-computes integers from them and emits them as literal
constants in the generated Inst.h. The exact math:

```c
int attackTicks  = (val2Value << 8) + 1;
int decayTicks   = (val1Value << 8) + 1;
int releaseTicks = (freqVal   << 8) + 1;
int sustainTicks = SmpLength[i] - attackTicks - decayTicks - releaseTicks;
UBYTE  peakByte    = gainVal;
short  sustain16   = widthVal << 8;
int    peak        = 32767 * peakByte << 1;
int    sustainVal  = sustain16 * peakByte << 1;
int    attackAmt   = peak                       / attackTicks;
int    decayAmt    = (peak - sustainVal)        / decayTicks;
int    releaseAmt  = sustainVal                 / releaseTicks;

// Then: adsr(j, attackAmt, decayAmt, sustainVal, sustainTicks, releaseAmt, peak)
```

(Names chosen for clarity; Form1 uses `num`/`num2`/… etc.)

The refrender harness performs this same computation at slot-dispatch
time, once per render (cached per slot would also be valid but the
overhead is trivial).

## 10. Notes on op 18 (`chordgen`) — verification trace

User feedback in v1 testing was that chordgen sounded different from
real Klang. Cross-verification of three independent sources confirms our
implementation:

| Source                                              | n1 field             | n2 field             | n3 field             | shift field         | source idx           |
|-----------------------------------------------------|----------------------|----------------------|----------------------|---------------------|----------------------|
| synthnodes.h prototype                              | BYTE                 | BYTE                 | BYTE                 | UBYTE               | BaseAdr arg          |
| Form1.cs case 18 (line 1333-1343)                   | `arrayfrequency`     | `arraywidth`         | `arrayval1`          | `arrayval2value`†   | `arraygain`          |
| Form1.cs GUI panel binding (line 2056-2080)         | ComboBoxChordNote1   | ComboBoxChordNote2   | ComboBoxChordNote3   | ComboBoxChordShift  | ComboBoxChordSamplenr|
| refrender.c case 18 (line 516-527)                  | `s->freq`            | `s->width`           | `s->val1`            | `s->val2Value`      | `s->gain`            |
| funklang JS `op_chordgen` (`ops/chordgen.ts`)       | `slot.freq`          | `slot.width`         | `slot.val1`          | `slot.val2Value`    | `slot.gain`          |

†When `arrayval2 > 0` the GUI uses `variable[arrayval2]` instead of the
literal — meaning shift can be modulated by a v1..v4 variable. Both
`ops/chordgen.ts` and `refrender.c case 18` implement this branch (added
2026-05); prior to that revision both forced the literal path. No
existing test patch exercises the variable branch but the implementation
is now faithful to the GUI's semantics.

The likely cause of the audio mismatch user reported is NOT chordgen
itself but its INTERACTION with op 22 (loop_gen). In real Klang the
loop generator writes to bytes that chordgen subsequently reads. Before
the §6.5 fix, our renderer skipped op 22 entirely — so any chordgen
reading from a loop-generated source saw the un-crossfaded bytes,
which would sound subtly (or grossly) different. With op 22 wired in,
99 chordgen/clone slots across the project's test patches now produce
DIFFERENT v1 output than before, and JS still matches C bit-exact on
all 403 paired renders.

A residual concern remains: chordgen's transposed reads frequently go
OUT OF BOUNDS of the source buffer (the `mulsw(sample, 483) >> 8` step
can reach ≈ 1.9× the sample length). In real Amiga RAM, OOB reads see
the NEXT instrument's bytes (everything lives in one contiguous
ModAdr). Our refrender (and now our JS engine) over-allocates the
byte buffer with a 64 KiB zero-padded tail and reads zeros for OOB —
so JS↔C match, but neither matches actual Amiga playback for chord
chains that bleed across instrument boundaries. Validating that path
requires an Amiga emulator round-trip (e.g. running the generated
Hatari/.adf through WinUAE and capturing audio).
