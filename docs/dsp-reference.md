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
| 22   | **loop cfg**   | NOT a render op; configures per-instrument loop offset/length only. Skipped during render. |
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
| 22 loop cfg    | (skipped; only sets per-instrument loopOffset/looplength)                   |
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
