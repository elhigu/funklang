/*
 * funklang reference render harness.
 *
 * Loads a .akp file, picks one instrument, runs the same render loop
 * that main-binary.c::synth runs on the Amiga, and writes the
 * pre-truncation `v1` value for each tick as a little-endian Int16 to
 * stdout. This is the bit-exact ground truth that the JS DSP is
 * validated against.
 *
 * Usage:  refrender <patch.akp> <instr-index>
 *
 * See funklang/docs/dsp-reference.md for the full mapping of Klang
 * op-codes to synthnodes.h functions, and funklang/docs/format-notes.md
 * for the on-disk byte layout.
 */

#include <stdio.h>
/* synthnodes.h defines `short abs(short)`, which collides with libc's
 * `int abs(int)`. Rename libc's prototype out of the way before pulling
 * in <stdlib.h> — we don't use stdlib's abs() ourselves. */
#define abs   libc_abs_unused
#include <stdlib.h>
#undef  abs
#include <stdint.h>
#include <string.h>

/* Amiga gcc typedefs that synthnodes.h expects. */
typedef int8_t   BYTE;
typedef uint8_t  UBYTE;
typedef int16_t  WORD;
typedef uint16_t UWORD;

/* --- Helpers expected by synthnodes.h ---------------------------------
 *
 * mulsw: from the Amiga toolchain ("multiply signed word"). The
 * canonical definition is "lower 16 bits of each operand, signed,
 * multiplied to a 32-bit signed result". Inferred from usage in
 * synthnodes.h e.g. `mulsw(val, gain) >> 7`, `mulsw(buf, 32767-abs(buf)) >> 16`.
 *
 * divsw: signed-word divide. Only used by loopgen; we don't call
 * loopgen from refrender but synthnodes.h references it, so provide it.
 *
 * abs / clamp are defined as ordinary `static` functions in
 * synthnodes.h itself (lines 1-9). We do not redefine them.
 *
 * decayTable is defined in main-binary.c (not synthnodes.h) — replicate
 * it here verbatim.
 */
/* Not `static`: synthnodes.h's `vol` / `mul` are declared plain `inline`
 * (not static-inline) and reference mulsw — which means mulsw must have
 * external linkage. */
int mulsw(int a, int b) {
    return (int)(int16_t)a * (int)(int16_t)b;
}
int divsw(int a, int b) {
    return a / b;
}

/* Hard-coded decay envelope LUT (copied verbatim from main-binary.c). */
static short decayTable[128] = {
    32767, 32767, 32767, 16384, 10922, 8192, 6553, 4681, 3640, 2978,
    2520, 2048, 1724, 1489, 1310, 1129, 992, 885, 799, 712, 642, 585,
    537, 489, 448, 414, 385, 356, 330, 309, 289, 270, 254, 239, 225,
    212, 201, 190, 181, 171, 163, 155, 148, 141, 134, 129, 123, 118,
    113, 108, 104, 100, 96, 93, 89, 86, 83, 80, 77, 75, 72, 70, 68,
    65, 63, 61, 60, 58, 56, 54, 53, 51, 50, 49, 47, 46, 45, 44, 43,
    41, 40, 39, 38, 38, 37, 36, 35, 34, 33, 33, 32, 31, 30, 30, 29,
    29, 28, 27, 27, 26, 26, 25, 25, 24, 24, 23, 23, 22, 22, 22, 21,
    21, 20, 20, 20, 19, 19, 19, 18, 18, 18, 17, 17, 17, 17, 16, 16, 16
};

/* Per-slot scratch state. main-binary.c uses size-16; we use 32 for
 * safety since the file format allows up to 20 slots (and clone src
 * lookups could in theory hit any). clr_buf() zeros only the first 16
 * — we manually clear all 32 before each instrument render. */
static short  counter_saw   [32];
static short  counter_sh    [32];
static short  counter_tri   [32];
static short  counter_sine  [32];
static short  counter_pulse [32];
static short  buffer_sh     [32];
static short  ADSR_Mode     [32];
static int    ADSR_Value    [32];
static int    ADSR_SustainCounter[32];

/* sv_flt_n / onepole_flt: 4 shorts per instance (lpf, hpf, bpf, pole) */
static short  filterBuffer  [32 * 4];

/* dly_cyc / cmb_flt_n / reverb delay lines. Indexed 0..15 for normal
 * slots and 16..23 inside reverb. */
static short  buffern       [24][2048];

/* -------- synthnodes.h -------- */
#include "../../../exe_creator/synthnodes.h"

/* ---------------------------------------------------------------------
 *  Parsed-patch data structures
 * --------------------------------------------------------------------- */

typedef struct {
    int32_t outVar;       /* arrayvar */
    int32_t fn;           /* arrayfunction */
    uint8_t instance;     /* arrayinstance */
    int16_t freq;         /* arrayfrequency */
    int16_t freqVal;      /* arrayfrequencyval */
    uint8_t gain;         /* arraygain */
    uint8_t gainVal;      /* arraygainval */
    uint8_t width;        /* arraywidth */
    uint8_t widthVal;     /* arraywidthval */
    int16_t val1;         /* arrayval1 */
    int16_t val1Value;    /* arrayval1value */
    int16_t val2;         /* arrayval2 */
    int16_t val2Value;    /* arrayval2value */
} Slot;

#define N_INSTRUMENTS  31
#define N_SLOTS        20
#define N_IMPORTS      8

typedef struct {
    char    name[256];
    int32_t sampleLength;
    Slot    slots[N_SLOTS];
    int32_t loopOffset;
    int32_t loopLength;
} Instr;

typedef struct {
    char     name[256];
    int32_t  length;
    int8_t  *data;        /* delta-decoded sample bytes (signed) */
} Import;

/* ---------------------------------------------------------------------
 *  Binary reader helpers (.NET BinaryReader little-endian semantics)
 * --------------------------------------------------------------------- */

static uint32_t rd_u32(FILE *f) { uint32_t v; if (fread(&v, 4, 1, f) != 1) v = 0; return v; }
static int32_t  rd_i32(FILE *f) { int32_t  v; if (fread(&v, 4, 1, f) != 1) v = 0; return v; }
static int16_t  rd_i16(FILE *f) { int16_t  v; if (fread(&v, 2, 1, f) != 1) v = 0; return v; }
static uint8_t  rd_u8 (FILE *f) { uint8_t  v; if (fread(&v, 1, 1, f) != 1) v = 0; return v; }

/* Reads .NET BinaryWriter.Write(string) — 7-bit-encoded LEB128 length
 * prefix, then UTF-8 bytes. Truncates to `cap-1` on overflow but always
 * consumes the full encoded payload. */
static void rd_string(FILE *f, char *out, size_t cap)
{
    int len = 0, shift = 0;
    for (;;) {
        int b = rd_u8(f);
        len |= (b & 0x7f) << shift;
        if (!(b & 0x80)) break;
        shift += 7;
        if (shift >= 35) break;        /* malformed — bail */
    }
    int copy = (len < (int)cap - 1) ? len : (int)cap - 1;
    if (copy > 0) {
        size_t got = fread(out, 1, copy, f);
        if ((int)got < copy) copy = (int)got;
    }
    out[copy < 0 ? 0 : copy] = '\0';
    if (len > copy) fseek(f, len - copy, SEEK_CUR);
}

/* Read the .akp at `path` into `instrs[31]` and (optionally) `imports[8]`.
 * Returns 0 on success, nonzero on error. */
static int load_akp(const char *path, Instr instrs[N_INSTRUMENTS],
                    Import imports[N_IMPORTS])
{
    FILE *f = fopen(path, "rb");
    if (!f) { perror(path); return 1; }

    if (rd_u32(f) != 0x02CEDA9Fu) {
        fprintf(stderr, "%s: bad magic (not an .akp)\n", path);
        fclose(f); return 1;
    }

    for (int i = 0; i < N_INSTRUMENTS; i++) {
        rd_string(f, instrs[i].name, sizeof(instrs[i].name));
        instrs[i].sampleLength = rd_i32(f);
        for (int j = 0; j < N_SLOTS; j++) {
            Slot *s = &instrs[i].slots[j];
            s->outVar    = rd_i32(f);
            s->fn        = rd_i32(f);
            s->instance  = rd_u8 (f);
            s->freq      = rd_i16(f);
            s->freqVal   = rd_i16(f);
            s->gain      = rd_u8 (f);
            s->gainVal   = rd_u8 (f);
            s->width     = rd_u8 (f);
            s->widthVal  = rd_u8 (f);
            s->val1      = rd_i16(f);
            s->val1Value = rd_i16(f);
            s->val2      = rd_i16(f);
            s->val2Value = rd_i16(f);
            /* loopOffset/looplength are re-written every slot iteration
             * by Form1.cs; last value wins. We mirror that. */
            instrs[i].loopOffset = rd_i32(f);
            instrs[i].loopLength = rd_i32(f);
        }
    }

    /* Imported samples are optional. Check whether anything remains. */
    for (int k = 0; k < N_IMPORTS; k++) {
        imports[k].name[0] = '\0';
        imports[k].length  = 0;
        imports[k].data    = NULL;
    }
    long pos = ftell(f);
    fseek(f, 0, SEEK_END);
    long end = ftell(f);
    fseek(f, pos, SEEK_SET);
    if (pos < end) {
        for (int k = 0; k < N_IMPORTS; k++) {
            rd_string(f, imports[k].name, sizeof(imports[k].name));
            imports[k].length = rd_i32(f);
            if (imports[k].length > 0) {
                imports[k].data = (int8_t*)malloc(imports[k].length);
                if (!imports[k].data) {
                    fprintf(stderr, "out of memory loading import %d\n", k);
                    fclose(f); return 1;
                }
                if (fread(imports[k].data, 1, imports[k].length, f)
                        != (size_t)imports[k].length) {
                    /* short read — treat as truncated */
                    free(imports[k].data);
                    imports[k].data = NULL;
                    imports[k].length = 0;
                    break;
                }
                /* NOTE: .akp stores imported samples as RAW bytes — Form1.cs
                 * Save_Click writes `importedsample[l, k]` directly without
                 * any delta encoding (see Form1.cs ~line 4597). The runtime
                 * (main-binary.c lines 56-62) only delta-decodes the data
                 * blob it loads from the .raw INCBIN export. So when reading
                 * straight from .akp, no delta-decode is needed. */
            }
        }
    }

    fclose(f);
    return 0;
}

/* ---------------------------------------------------------------------
 *  Render driver
 * --------------------------------------------------------------------- */

/* The clone op reads bytes from a previously-rendered instrument's
 * sample buffer. We materialize each instrument's bytes lazily as needed
 * and cache them in `sampleBytes[i]`. */

static int8_t *sampleBytes[N_INSTRUMENTS];  /* lazy per-instrument sample buffer */
static int     renderState [N_INSTRUMENTS]; /* 0=unrendered, 1=in-progress, 2=done */

#define MAX_CLONE_DEPTH 8

static int render_instrument(const Instr instrs[N_INSTRUMENTS],
                             const Import imports[N_IMPORTS],
                             int idx, int depth,
                             /* if writeOut is non-NULL, also write Int16 LE
                              * pre-truncation v1 there (one per tick) */
                             int16_t *writeOut);

/* Look up the input value for a slot argument that may either be a
 * variable reference (1..4) or a literal (when the ref is 0). */
static inline short pick_short(int16_t ref, int16_t literal, const short v[5]) {
    return (ref > 0 && ref <= 4) ? v[ref] : literal;
}
static inline UBYTE pick_byte(uint8_t ref, uint8_t literal, const short v[5]) {
    return (ref > 0 && ref <= 4) ? (UBYTE)v[ref] : (UBYTE)literal;
}

/* Render a single instrument. If `writeOut` is non-NULL the per-tick
 * pre-truncation v1 is written there (sampleLength+1 shorts). Always
 * populates `sampleBytes[idx]` with the truncated 8-bit Amiga bytes
 * (sampleLength+1 of them) so that downstream clone ops can read them. */
static int render_instrument(const Instr instrs[N_INSTRUMENTS],
                             const Import imports[N_IMPORTS],
                             int idx, int depth,
                             int16_t *writeOut)
{
    if (idx < 0 || idx >= N_INSTRUMENTS) {
        fprintf(stderr, "render: bad instrument index %d\n", idx);
        return 1;
    }
    if (depth > MAX_CLONE_DEPTH) {
        fprintf(stderr, "render: clone depth exceeded (cycle?) at instr %d\n", idx);
        return 1;
    }
    if (renderState[idx] == 1) {
        fprintf(stderr, "render: clone cycle detected at instr %d\n", idx);
        return 1;
    }
    if (renderState[idx] == 2 && writeOut == NULL) {
        return 0;   /* already cached; clone op just needs the bytes */
    }

    const Instr *ins = &instrs[idx];
    int N = ins->sampleLength;
    if (N < 0) N = 0;
    int total = N + 1;   /* loop runs smp <= sampleLength, inclusive */

    /* Allocate / reset the byte cache for this instrument.
     *
     * IMPORTANT: chordgen (op 18) and clone (op 17) can read PAST the end of
     * the source buffer (e.g. chordgen step 12 reads `BaseAdr + (sample<<1) +
     * shift`, where `sample<<1` already reaches the end of the buffer). In
     * the original Amiga binary all instruments live in one big contiguous
     * ModAdr/BaseAdr block, so OOB reads see the next instrument's bytes
     * (also data). On host malloc this is UB and yields heap-bookkeeping
     * noise that breaks bit-exactness vs the JS engine (which returns 0 for
     * OOB). To make OOB reads well-defined AND match the JS engine, we
     * over-allocate by SAMPLE_PAD bytes (zeroed). This is large enough to
     * cover any reasonable chordgen/clone offset within int16 range. */
    enum { SAMPLE_PAD = 65536 };
    size_t allocSize = (size_t)(total > 0 ? total : 1) + SAMPLE_PAD;
    if (!sampleBytes[idx]) {
        sampleBytes[idx] = (int8_t*)calloc(allocSize, 1);
        if (!sampleBytes[idx]) return 1;
    } else {
        memset(sampleBytes[idx], 0, allocSize);
    }

    renderState[idx] = 1;

    /* Eagerly render any source instruments referenced by clone (17) or
     * chordgen (18) slots so their byte buffers exist before the inner
     * loop starts. In the real Amiga runtime this is implicit: all
     * instruments are rendered in index order, so by the time instrument
     * N runs, BaseAdr[0..N-1] are populated. We replicate that on demand
     * since refrender only renders one instrument by default. */
    for (int j = 0; j < N_SLOTS; j++) {
        const Slot *s = &ins->slots[j];
        if (s->outVar == 0) continue;
        if (s->fn != 17 && s->fn != 18) continue;
        int src = s->gain;
        if (src >= 0 && src < N_INSTRUMENTS && src != idx) {
            if (renderState[src] != 2) {
                if (render_instrument(instrs, imports, src, depth + 1, NULL) != 0) {
                    renderState[idx] = 0;
                    return 1;
                }
            }
        }
    }

    /* Reset per-instrument state (mirrors clr_buf() in synthnodes.h, but
     * for our size-32 arrays). */
    for (int l = 0; l < 32; l++) {
        counter_saw[l] = 0; counter_sh[l] = 0; counter_tri[l] = 0;
        counter_sine[l] = 0; counter_pulse[l] = 0; buffer_sh[l] = 0;
        ADSR_Mode[l] = 0; ADSR_Value[l] = 0; ADSR_SustainCounter[l] = 0;
    }
    for (int l = 0; l < 32 * 4; l++) filterBuffer[l] = 0;
    for (int l = 0; l < 24; l++)
        for (int j = 0; j < 2048; j++)
            buffern[l][j] = 0;

    short v[5];           /* v[0] unused; v[1..4] are v1..v4 */
    v[0] = v[1] = v[2] = v[3] = v[4] = 0;

    for (int smp = 0; smp < total; smp++) {
        for (int j = 0; j < N_SLOTS; j++) {
            const Slot *s = &ins->slots[j];
            if (s->outVar == 0 || s->fn == 0 || s->fn == 22) continue;

            short out = 0;
            switch (s->fn) {
            case 1: {  /* vol */
                short val  = pick_short(s->val1, s->val1Value, v);
                UBYTE gain = pick_byte (s->gain, s->gainVal,   v);
                out = vol(val, gain);
                break;
            }
            case 2: {  /* osc_saw */
                short freq = pick_short(s->freq, s->freqVal, v);
                UBYTE gain = pick_byte (s->gain, s->gainVal, v);
                out = osc_saw((BYTE)j, freq, gain);
                break;
            }
            case 3: {  /* osc_tri */
                short freq = pick_short(s->freq, s->freqVal, v);
                UBYTE gain = pick_byte (s->gain, s->gainVal, v);
                out = osc_tri((BYTE)j, freq, gain);
                break;
            }
            case 4: {  /* osc_sine */
                short freq = pick_short(s->freq, s->freqVal, v);
                UBYTE gain = pick_byte (s->gain, s->gainVal, v);
                out = osc_sine((BYTE)j, freq, gain);
                break;
            }
            case 5: {  /* osc_pulse */
                short freq  = pick_short(s->freq,  s->freqVal,  v);
                UBYTE gain  = pick_byte (s->gain,  s->gainVal,  v);
                UBYTE width = pick_byte (s->width, s->widthVal, v);
                out = osc_pulse((BYTE)j, freq, gain, width);
                break;
            }
            case 6: {  /* osc_noise */
                UBYTE gain = pick_byte(s->gain, s->gainVal, v);
                out = osc_noise(smp, gain);
                break;
            }
            case 7: {  /* enva — Form1 passes literal 0 for sustain */
                BYTE  attack = (BYTE)pick_short(s->val1, s->val1Value, v);
                /* Clamp attack to decayTable's defined range. Without this
                 * `decayTable[attack]` is UB for negative attack values that
                 * arise when slot.val1 references a modulating variable.
                 * The JS engine clamps identically (see ops/enva.ts). */
                if (attack < 0) attack = 0;
                if (attack > 127) attack = 127;
                UBYTE gain   = pick_byte (s->gain, s->gainVal, v);
                out = enva(smp, attack, 0, gain);
                break;
            }
            case 8: {  /* envd */
                BYTE  decay   = (BYTE)pick_short(s->val1, s->val1Value, v);
                /* Same clamp rationale as case 7 (see ops/envd.ts). */
                if (decay < 0) decay = 0;
                if (decay > 127) decay = 127;
                BYTE  sustain = (BYTE)pick_short(s->val2, s->val2Value, v);
                UBYTE gain    = pick_byte (s->gain, s->gainVal, v);
                out = envd(smp, decay, sustain, gain);
                break;
            }
            case 9: {  /* add — val1 must be v1..v4 */
                short a = (s->val1 > 0 && s->val1 <= 4) ? v[s->val1] : 0;
                short b = pick_short(s->val2, s->val2Value, v);
                out = add(a, b);
                break;
            }
            case 10: {  /* mul — val1 must be v1..v4 */
                short a = (s->val1 > 0 && s->val1 <= 4) ? v[s->val1] : 0;
                short b = pick_short(s->val2, s->val2Value, v);
                out = mul(a, b);
                break;
            }
            case 11: {  /* dly_cyc — val1 must be v1..v4 */
                short val   = (s->val1 > 0 && s->val1 <= 4) ? v[s->val1] : 0;
                short delay = pick_short(s->freq, s->freqVal, v);
                UBYTE gain  = pick_byte (s->gain, s->gainVal, v);
                out = dly_cyc((BYTE)j, val, delay, gain);
                break;
            }
            case 12: {  /* cmb_flt_n */
                short val      = (s->val1 > 0 && s->val1 <= 4) ? v[s->val1] : 0;
                short delay    = pick_short(s->freq, s->freqVal, v);
                UBYTE feedback = pick_byte (s->val2 ? 0 : 0, (uint8_t)s->val2Value, v);
                /* note: feedback uses val2/val2Value; pick_byte signature
                 * uses uint8_t ref so we re-implement the pick here. */
                feedback = (s->val2 > 0 && s->val2 <= 4)
                        ? (UBYTE)v[s->val2] : (UBYTE)s->val2Value;
                UBYTE gain     = pick_byte(s->gain, s->gainVal, v);
                out = cmb_flt_n((BYTE)j, val, delay, feedback, gain);
                break;
            }
            case 13: {  /* reverb */
                short val      = (s->val1 > 0 && s->val1 <= 4) ? v[s->val1] : 0;
                UBYTE feedback = (s->val2 > 0 && s->val2 <= 4)
                        ? (UBYTE)v[s->val2] : (UBYTE)s->val2Value;
                UBYTE gain     = pick_byte(s->gain, s->gainVal, v);
                out = reverb(val, feedback, gain);
                break;
            }
            case 14: {  /* ctrl — returns BYTE which we store in low bits */
                short val = (s->val1 > 0 && s->val1 <= 4) ? v[s->val1] : 0;
                out = (short)(int8_t)ctrl(val);
                break;
            }
            case 15: {  /* sv_flt_n — note: `mode` is the RAW `gain` byte (NOT pick_byte) */
                short val      = (s->val1 > 0 && s->val1 <= 4) ? v[s->val1] : 0;
                short cutoff   = pick_short(s->freq, s->freqVal, v);
                UBYTE reso     = (s->val2 > 0 && s->val2 <= 4)
                        ? (UBYTE)v[s->val2] : (UBYTE)s->val2Value;
                BYTE  mode     = (BYTE)s->gain;
                out = sv_flt_n((BYTE)j, val, cutoff, reso, mode);
                break;
            }
            case 16: {  /* distortion */
                short val  = (s->val1 > 0 && s->val1 <= 4) ? v[s->val1] : 0;
                UBYTE gain = pick_byte(s->gain, s->gainVal, v);
                out = distortion((int)val, gain);
                break;
            }
            case 17: {  /* clone — inline (see dsp-reference.md §6) */
                int srcInst = s->gain;
                short transpose = pick_short(s->freq, s->freqVal, v);
                int idxRead = ((smp * ((int)transpose + 32768)) >> 15)
                              + (uint16_t)s->val2Value;
                if (srcInst < 0 || srcInst >= N_INSTRUMENTS) {
                    out = 0;
                } else if (idxRead < instrs[srcInst].sampleLength
                           && sampleBytes[srcInst] != NULL) {
                    if (s->gainVal == 0) {
                        /* forward */
                        out = (short)(((int8_t*)sampleBytes[srcInst])[idxRead]) << 8;
                    } else {
                        /* reverse: BaseAdr[src+1] - idx — reads one PAST
                         * the end of src's buffer, then walks backwards.
                         * We emulate via end-offset arithmetic. */
                        int total_src = instrs[srcInst].sampleLength + 1;
                        int r = total_src - idxRead;
                        if (r < 0 || r >= total_src) {
                            out = 0;
                        } else {
                            out = (short)(((int8_t*)sampleBytes[srcInst])[r]) << 8;
                        }
                    }
                } else {
                    out = 0;
                }
                break;
            }
            case 18: {  /* chordgen — needs BaseAdr[gain], i.e. another instrument's bytes */
                int srcInst = s->gain;
                if (srcInst < 0 || srcInst >= N_INSTRUMENTS
                        || sampleBytes[srcInst] == NULL) {
                    out = 0;
                } else {
                    out = chordgen(smp, sampleBytes[srcInst],
                                   (BYTE)s->freq, (BYTE)s->width,
                                   (BYTE)s->val1, (UBYTE)s->val2Value);
                }
                break;
            }
            case 19: {  /* sh — val1 must be v1..v4 */
                short val  = (s->val1 > 0 && s->val1 <= 4) ? v[s->val1] : 0;
                UBYTE step = pick_byte(s->gain, s->gainVal, v);
                out = sh((BYTE)j, val, step);
                break;
            }
            case 20: {  /* imported sample */
                int imp = s->gain;
                if (imp < 0 || imp >= N_IMPORTS || imports[imp].data == NULL
                        || smp >= imports[imp].length) {
                    out = 0;
                } else {
                    out = (short)(imports[imp].data[smp]) << 8;
                }
                break;
            }
            case 21: {  /* onepole_flt — mode is RAW `gain` byte */
                short val    = (s->val1 > 0 && s->val1 <= 4) ? v[s->val1] : 0;
                short cutoff = pick_short(s->freq, s->freqVal, v);
                BYTE  mode   = (BYTE)s->gain;
                out = onepole_flt((BYTE)j, val, (BYTE)cutoff, mode);
                break;
            }
            case 23: {  /* adsr — args are PRE-COMPUTED from slot fields (see Form1.cs case 23) */
                int attackTicks  = ((int)s->val2Value << 8) + 1;
                int decayTicks   = ((int)s->val1Value << 8) + 1;
                int releaseTicks = ((int)s->freqVal   << 8) + 1;
                int sustainTicks = ins->sampleLength
                                   - attackTicks - decayTicks - releaseTicks;
                UBYTE peakByte   = s->gainVal;
                short sustain16  = (short)((int)s->widthVal << 8);
                int peak         = (int)32767 * peakByte << 1;
                int sustainVal   = (int)sustain16 * peakByte << 1;
                int attackAmt    = (attackTicks  != 0) ? peak                / attackTicks  : 0;
                int decayAmt     = (decayTicks   != 0) ? (peak - sustainVal) / decayTicks   : 0;
                int releaseAmt   = (releaseTicks != 0) ? sustainVal          / releaseTicks : 0;
                out = adsr((BYTE)j, attackAmt, decayAmt, sustainVal,
                           sustainTicks, releaseAmt, peak);
                break;
            }
            case 24:
                /* vocoder — no generator support; treat as no-op. */
                out = 0;
                break;
            default:
                out = 0;
                break;
            }

            if (s->outVar > 0 && s->outVar <= 4) {
                v[s->outVar] = out;
            }
        }

        /* Cache the Amiga 8-bit sample byte for downstream clone reads. */
        int8_t byte = (int8_t)((v[1] >> 8) & 0xff);
        sampleBytes[idx][smp] = byte;

        if (writeOut) writeOut[smp] = v[1];
    }

    /* main-binary.c zeros the first two bytes after the per-instrument
     * render loop. Mirror that, since clone/chordgen reads should see
     * the same memory state. */
    if (total >= 1) sampleBytes[idx][0] = 0;
    if (total >= 2) sampleBytes[idx][1] = 0;

    renderState[idx] = 2;
    return 0;
}

/* --------------------------------------------------------------------- */

int main(int argc, char **argv)
{
    if (argc != 3) {
        fprintf(stderr, "usage: %s <patch.akp> <instr-index>\n", argv[0]);
        return 2;
    }
    int wantIdx = atoi(argv[2]);
    if (wantIdx < 0 || wantIdx >= N_INSTRUMENTS) {
        fprintf(stderr, "instrument index out of range (0..%d)\n", N_INSTRUMENTS - 1);
        return 2;
    }

    Instr  *instrs  = calloc(N_INSTRUMENTS, sizeof(Instr));
    Import *imports = calloc(N_IMPORTS,     sizeof(Import));
    if (!instrs || !imports) {
        fprintf(stderr, "out of memory\n");
        return 1;
    }

    if (load_akp(argv[1], instrs, imports) != 0) {
        return 1;
    }

    int total = instrs[wantIdx].sampleLength + 1;
    if (instrs[wantIdx].sampleLength < 0) total = 1;

    int16_t *out = calloc((size_t)total, sizeof(int16_t));
    if (!out) {
        fprintf(stderr, "out of memory for output buffer\n");
        return 1;
    }

    if (render_instrument(instrs, imports, wantIdx, 0, out) != 0) {
        return 1;
    }

    /* Write Int16 LE samples. The host is little-endian on x86/ARM so
     * a single fwrite is sufficient. (We assume LE — Amiga toolchain
     * also LE for this purpose; the byte-swap is left as a future
     * portability concern.) */
    if (fwrite(out, sizeof(int16_t), (size_t)total, stdout)
            != (size_t)total) {
        fprintf(stderr, "short write to stdout\n");
        return 1;
    }

    /* (Memory cleanup omitted — process is about to exit.) */
    (void)imports;
    return 0;
}
