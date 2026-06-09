# The funklang `.bin` — format & how it's built

The **CODE** export panel produces a raw m68k binary (the ~2 KB file, e.g.
`testing-patch.bin` = 2024 bytes). This is the **asm path**: the byte-exact
reimplementation of *Aklang2Asm V1.1 by Dan/Lemon*, assembled with vasm. It is
**not** the same artifact as the original GUI's "Export Amiga Binary" (that one
is the gcc-compiled C blob, ~2× larger — see "Two routes" below).

## What the bytes are

A single position-independent routine, **`AK_Generate`**, followed by its data
tables (`AK_Vars`, sample-length table, decay/chord tables, work offsets, etc.).
There is **no header, no relocation table, no hunk** — it is the literal machine
code+data, ready to `incbin` and call. Position independence comes from the very
first instruction:

```
AK_Generate:
        lea     AK_Vars(pc),a5      ; all state addressed PC-relative via a5
```

So you may place the blob at any address and `jsr` to its first byte.

### Calling convention (from the Aklang2Asm header)

Set these registers, then `jsr AK_Generate` (offset 0 of the blob):

| Reg | Meaning |
|-----|---------|
| `a0` | Sample Buffer start address (output; the rendered samples land here) |
| `a1` | 36864-byte temporary work buffer (freeable after rendering) |
| `a2` | External samples address (need not be chip RAM; freeable after rendering) |
| `a3` | Rendering-progress address (see modes below) |

Progress reporting is controlled by two `equ`s emitted into the asm:

- `AK_USE_PROGRESS equ 1` — enable writing progress to `(a3)`
- `AK_FINE_PROGRESS equ 0` — progress is a **byte** = current instrument number
- `AK_FINE_PROGRESS equ 1` — progress is a **long** = current sample byte

Also emitted as `equ`s for buffer sizing: `AK_FINE_PROGRESS_LEN`, `AK_SMP_LEN`
(total bytes of all 31 internal samples), `AK_EXT_SMP_LEN` (external samples).
External samples are stored as deltas and decoded in-place at the start of
`AK_Generate`.

## How it's compiled (toolchain)

```
patch (.akp)
  │  emitAkGenerate()          src/asm/akgen/  — byte-exact TS port of Aklang2Asm V1.1
  ▼
m68k assembly (Motorola syntax, the AK_Generate routine + data)
  │  vasm  (vasmm68k_mot, vasm 2.0e)  -Fbin
  ▼
raw .bin
```

- **`emitAkGenerate`** (`src/asm/akgen/`) reproduces Aklang2Asm's output
  byte-for-byte. Verified: all 24 ops and 14/14 oracle-accepted real patches
  assemble to **identical bytes** vs the real `aklang2asm.exe` (re-checked under
  `mono`). CI freezes the oracle bytes (`tests/asm/akgen/`) so this holds without
  needing mono in CI.
- **vasm** runs in the browser as WebAssembly (`src/asm/vasm/vasm-m68k.{mjs,wasm}`,
  vasm 2.0e Emscripten build). `assembleM68k(src, {format:'bin'})` →
  raw bytes. The same pipeline is wrapped by `assembleBin(patch)` in
  `src/asm/assemble-bin.ts`.
- Output format is vasm **`-Fbin`** (raw binary). vasm can also emit Amiga hunk
  with `-Fhunk` if a linkable object is ever needed; the export uses raw.

### Native equivalent (no browser)

Identical result outside the browser:

```sh
# 1. patch → Dan-script → asm  (the author's tool, .NET, run under mono)
mono exe_creator/aklang2asm.exe script.txt exemusic.asm -pf
# 2. asm → raw bin
vasmm68k_mot -Fbin -o exemusic.bin exemusic.asm
```

`emitDanScript(patch)` (`src/codegen/emit-inst.ts`) produces `script.txt`. The
harness `groundtruth/harness/asm-bin.ts` (`npm run asm:bin`) automates exactly this
as the live oracle.

## Two routes (don't confuse them)

The original Alcatraz AmigaKlangGUI has separate menu items:

| GUI menu | Tool | Output | Size (testing-patch) |
|----------|------|--------|----------------------|
| **Export Amiga Binary** | `bin_creator.bat` → m68k-gcc `-flto` on the C, `Makefile-binary`, `elf2hunk` → `exemusic.bin` | gcc-compiled relocatable blob, C entry/ABI | **4464 B** |
| **Export ASM** + assemble | `aklang2asm.exe` → asm, then vasm `-Fbin` | this document's `AK_Generate` blob | **2024 B** |

The funklang **CODE** button = the **asm route** (the 2024 B file). It is ~half
the size (hand-written asm vs gcc-compiled C), deterministic, and the size shown
is exact. The two blobs render identical audio but have **different entry
conventions** and are **not drop-in interchangeable**.
