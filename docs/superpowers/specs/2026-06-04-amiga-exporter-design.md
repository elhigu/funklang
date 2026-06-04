# Amiga Exporter — Design

**Date:** 2026-06-04
**Status:** Approved design, pre-implementation
**Sub-project 1 of 4** in the calibrated size-estimator effort (exporter → compile harness → corpus → fitter).

## Goal

A pure-TS module that turns a funklang `Patch` into the exact set of build
artifacts the original AmigaKlangGUI emits for its Amiga `.exe` export, so the
existing `exe_creator/` toolchain can compile it. This is the foundation for
calibration (it produces the inputs the wine compile harness measures) and
independently delivers the "export amiga exe" capability the user originally
asked for.

The exporter mirrors the GUI's codegen **byte-for-byte** (verified against real
GUI output), so the compiled size matches what demo coders actually ship.

## Where this fits (the 4-step arc)

The end goal is a live in-browser estimator whose numbers track real compiled
sizes. That is reached in four sub-projects; **this spec is step 1 only.**

1. **Exporter (this spec).** TS turns an `.akp` into the six build *source*
   files. *You* run the GUI export once on the generated test patches and return
   the six files as the byte-exact oracle. **No compiling in this step.**
2. **Compile harness.** You install 64-bit wine; I wrap gnumake/gcc/elf2hunk/
   Shrinkler to compile the exported files into a real shrinklered binary and
   read its size — headlessly, no GUI.
3. **Corpus.** I generate a large systematic `.akp` set and compile them all via
   step 2 → a dataset of *(patch features → real size)*. Automated; no user step.
4. **Fitter.** I fit per-feature costs from that dataset and rewrite
   `calibration-data.ts` → the live estimator now matches compiled sizes.

The only manual GUI step in the whole arc is step 1's reference capture.

## Scope

**In:** emit the six artifacts from a `Patch`, in memory, byte-identical to the
GUI; synthesize a minimal silent mod; a thin disk-writer; byte-exact tests
against captured GUI reference output.

**Out (later sub-projects):** invoking wine/gcc/Shrinkler (sub-project 2), the
systematic calibration corpus (3), the fitter (4), and the user-facing
"use my own `.mod`/song" input (a thin later layer — the song is irrelevant to
instrument-set size).

## Isolation (hard constraint)

All exporter code lives in a new **Node-only `funklang/sizelab/`** area, never
imported by the Vite app:

- It may import core types/serializers *from* `src/` (read-only): `Patch`
  (`src/patch/types.ts`), `opByCode` (`src/schema/op-metadata.ts`),
  `serializeAkp` (`src/fileio/akp.ts:156`, for generating test patches).
- **`src/` never imports `sizelab/`.** Enforced by a unit test asserting no
  file under `src/` references `sizelab/`, plus Vite naturally excluding it.
- The exporter never writes into the tracked `exe_creator/`. The compile
  harness (sub-project 2) will copy `exe_creator/` into a scratch dir and emit
  there; sub-project 1 only returns artifacts in memory + an explicit
  write-to-dir helper the tests point at a temp dir.

## Inputs

- A `Patch` (instruments with `sampleLength`, `loopOffset`, `loopLength`,
  `slots`; `importedSamples[8]`).
- No external `.mod` required: the exporter **synthesizes a minimal canonical
  mod** (see below). The same synthesized mod is fed to the GUI when capturing
  reference output, so `empty.mod`/`mod_length_empty` also match byte-exact.

## The six output artifacts

File names exactly as the GUI writes them (note the lowercase `ilen.h`/`inst.h`
vs capitalized `Iset.h`). Source: Form1.cs
`exportGeneratorFilesToolStripMenuItem_Click`, lines 4801–5670 (reference copy
at `/home/elhigu/projects/AMIGA/reference/AmigaKlangGUI-decompiled/Form1.cs`).

### 1. `ilen.h` (text) — Form1.cs 4821–4835
Loops `i` over `0 .. getnumberofhighestinstrument()-1` (highest instrument with
`sampleLength > 2`, +1). Per instrument, with a `// <name>` comment line:
```
SmpLength[i] = 0x<HEX>;
repeat_offset[i] = 0x<HEX>;
repeat_length[i] = 0x<HEX>;
samplename_flag[i] = '<c>';
```
`<HEX>` is C#-style uppercase hex, no leading zeros (`ToString("X")`), e.g.
`0x3000`. `<c>` is `l` iff slot 15's `fn == 22` (loop_gen), else a space `' '`.
A blank line follows each instrument. Then for `j` 0..7:
`ImpLength[j] = 0x<HEX>;` each followed by a blank line. Line endings `\r\n`.

### 2. `inst.h` (text) — Form1.cs 4837–5534
Loops `k` 0..30, **skipping instruments with `sampleLength <= 2`**. Per emitted
instrument:
```
// <name>
if (instrument == <k>) {
<per-slot lines>
}
```
Per slot `l` 0..15, **skipped if `outVar == 0` OR `fn == 22`**, emit:
`<outVarName> = <opName>(<args>);` where `outVarName` ∈ `{v1,v2,v3,v4}`
(`arrayvartext`), `opName` from the 25-entry `arrayfunctiontext` table (op codes;
17 and 22 are blank — handled specially / skipped). The `<args>` are produced by
a **per-op `switch` (cases 1–24)**; the implementer transcribes each case
verbatim from Form1.cs lines 4853–5532. The recurring rule, per parameter:
> `if (array<Param>[k,l] > 0)` emit the **variable** name
> `arrayvartext[array<Param>[k,l]]`; **else** emit the **literal**
> `array<Param>val[k,l]`.
applied to frequency/gain/width/val1/val2 and the fixed `l` (instance) / `smp`
args as each op requires. This literal-vs-variable branch is the per-slot cost
variation the calibration model later keys on.

### 3. `Iset.h` (text) — Form1.cs 5589–5614
```
#define executable
#define numinstruments <getnumberofhighestinstrument()>
const void * protrackermod;
INCBIN(protrackermod, "empty.mod");
const void * importedsamples;
INCBIN(importedsamples, "Isamp.raw");
int mod_length_empty = <1084 + nPatterns*1024>;
int imp_length = <Σ importedlength[0..7]>;
long gen_length = <Σ sampleLength over instruments>;
```
`nPatterns` = (max byte in the mod's pattern table, +1). `gen_length` is the
total-size figure the GUI shows in `labelTotalSize` (sum of sample lengths).

### 4. `support/Iswitch.h` (text) — Form1.cs 5620–5626
Exactly: `#define executable\r\n`.

### 5. `Isamp.raw` (binary) — Form1.cs 5628–5644
The 8 imported samples concatenated in order (each `importedlength[j]` bytes),
then **delta-encoded in place** (Form1.cs `delta_encode`, line 8180):
`out[i] = buf[i] - prev; prev = buf[i]` (prev starts 0). Matches the runtime
delta-*decode* in `main-executable.c:510-515`.

### 6. `empty.mod` (binary) — Form1.cs 5646–5666
The synthesized minimal mod (below), with each instrument's sample-length word
patched into the mod sample headers, truncated to `mod_length_empty` bytes:
- For instrument `n` 0..30: write `sampleLength[n] >> 1` as a **big-endian**
  u16 at mod offset `42 + 30*n` (hi byte) / `43 + 30*n` (lo).
- If `fn[n,15] == 22` (loop_gen): also write `loopOffset[n] >> 1` BE-u16 at
  `46/47 + 30*n` and `loopLength[n] >> 1` BE-u16 at `48/49 + 30*n`.

### Minimal canonical mod (synthesized)
The smallest valid ProTracker `M.K.` module: 1084-byte header (20-byte title,
31×30-byte sample headers, songlength=1, restart byte, 128-byte order table
pointing at pattern 0, `"M.K."` at offset 1080) + **one** empty 1024-byte
pattern = **2108 bytes**, all silence. `nPatterns = 1`, so
`mod_length_empty = 1084 + 1024 = 2108`. Committed as a fixture and also fed to
the GUI for reference captures so both sides match.

## Module layout

```
funklang/sizelab/
  exporter/
    emit-ilen.ts        # ilen.h text
    emit-inst.ts        # inst.h text (the 24-case per-op codegen)
    emit-iset.ts        # Iset.h + Iswitch.h text
    emit-isamp.ts       # Isamp.raw bytes (concat + delta-encode)
    minimal-mod.ts      # synthesize the 2108-byte canonical mod
    emit-mod.ts         # patch sample-length/loop words into a mod
    export-patch.ts     # orchestrator → { 'ilen.h': string, ..., 'empty.mod': Uint8Array }
    hex.ts              # C#-style ToString("X") uppercase-no-leading-zero hex
    write-artifacts.ts  # write the map to a target dir (tests use a temp dir)
  fixtures/
    minimal.mod                     # the synthesized canonical mod
    reference/<patch>/{ilen.h,...}  # GUI-captured byte-exact oracles
  tools/
    gen-verification-patches.ts     # writes the .akp set for GUI capture
```

`export-patch.ts` exposes one pure function:
```ts
export interface ExportedArtifacts {
  'ilen.h': string;
  'inst.h': string;
  'Iset.h': string;
  'support/Iswitch.h': string;
  'Isamp.raw': Uint8Array;
  'empty.mod': Uint8Array;
}
export function exportPatch(patch: Patch): ExportedArtifacts;
```
Pure (no I/O); `write-artifacts.ts` does the disk write separately.

## Error handling

- Mirror the GUI's guards: instruments with `sampleLength <= 2` contribute no
  `inst.h`/`ilen.h` body (and aren't counted by `numinstruments`); slots with
  `outVar == 0` or `fn == 22` emit nothing.
- An unknown `fn` (no switch case) → throw with the offending instrument/slot —
  the corpus must only use real ops; silent emission would corrupt the build.
- Imported-sample total exceeding the GUI's buffer is not a concern at our
  sizes; assert non-negative lengths and move on.

## Verification (byte-exact oracle)

1. `gen-verification-patches.ts` writes this explicit `.akp` set (via
   `serializeAkp`), each targeting a distinct slice of the codegen. The same
   synthesized `minimal.mod` ships alongside for the GUI export.

   | id | patch | exercises |
   |----|-------|-----------|
   | P01 | one instrument, single `osc_saw`, all params literal, short length | baseline `inst.h`/`ilen.h`/`Iset.h` shape |
   | P02 | instruments each using a distinct `fn` 1–24, params literal | every per-op `switch` case (cases 1–24) |
   | P03 | `osc_saw`, `osc_pulse`, `sv_flt_n` with freq/gain/width/val params in **variable** mode (vN) and a sibling copy in **literal** mode | the literal-vs-`arrayvartext` branch on each param field |
   | P04 | instrument with slot 15 `fn==22` (loop_gen), non-zero `loopOffset`/`loopLength` | `samplename_flag='l'`, `ilen.h` repeat fields, `empty.mod` loop-word patch |
   | P05 | several non-zero `importedSamples`, an `imported` op (`fn 20`) reading them | `ImpLength`, `Isamp.raw` concat + delta-encode |
   | P06 | a `clone` (`fn 17`) and `chordgen` (`fn 18`) referencing earlier instruments | the special-emit ops (blank in `arrayfunctiontext`) + source refs |
   | P07 | several populated instruments with one `sampleLength <= 2` gap between them | instrument-skip + `numinstruments`/`getnumberofhighestinstrument` |
2. **User step (manual, once):** load each `.akp` in the original GUI, run the
   Amiga exe-export feeding `minimal.mod`, and return the six produced files
   into `fixtures/reference/<patch>/`.
3. Tests run `exportPatch` on each patch and assert each artifact is
   byte-identical to its captured reference (string compare for text, byte
   compare for `Isamp.raw`/`empty.mod`).

Until references exist, the suite uses a couple of hand-derived small cases as a
smoke test (clearly marked provisional) so development isn't blocked; the
byte-exact fixtures are the real gate.

## Testing strategy

- Unit: `hex.ts` (uppercase, no leading zero, matches `ToString("X")`),
  `minimal-mod.ts` (2108 bytes, valid `M.K.`, nPatterns=1), `emit-isamp.ts`
  (delta round-trips against the runtime decode), `emit-mod.ts` (BE-u16 patch
  offsets, loop words only when `fn[15]==22`).
- Per-emitter: feed crafted instruments, assert exact text including `\r\n` and
  `0x` hex.
- Integration: `exportPatch` byte-exact vs every captured GUI reference.
- Isolation: a test asserting nothing under `src/` imports `sizelab/`.

## Out of scope (restated)

Compilation/wine, the calibration corpus and fitter, and user-supplied songs —
all later sub-projects. This one ends at "produces byte-exact build inputs,
proven against the real tool."
