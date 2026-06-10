# Third-party notices

funklang is a reimplementation of AmigaKlang and bundles/derives from work by
others. This file records those dependencies, their authors, and their terms.
funklang is distributed for **non-commercial** use.

If you spot an attribution error or want a usage clarified, please open an issue
— the intent here is to credit and comply, not to claim anyone else's work.

---

## Code bundled in the shipped app

### vasm (m68k assembler) — compiled to WebAssembly
- **Author/Copyright:** © Volker Barthelmann and Frank Wille.
  Home: http://sun.hasenbraten.de/vasm/
- **Where:** `src/asm/vasm/vasm-m68k.wasm` + `vasm-m68k.mjs` (also bundled into the
  deployed site). This is **vasm 2.0e** (`vasmm68k_mot`: m68k CPU, Motorola syntax).
- **Provenance:** an **unmodified** build of the upstream vasm source, recompiled to
  WebAssembly with the Emscripten toolchain (`emmake make CPU=m68k SYNTAX=mot
  CC=emcc HOSTCC=emcc`, then linked with `emcc`). No source code was changed — only
  the compiler/target. Rebuild steps are in `src/asm/vasm/README.md`.
- **License (verbatim core terms):**
  > "The archive may be redistributed without modifications and used for
  > non-commercial purposes. An exception for commercial usage is granted, provided
  > that the target CPU is M68k and the target OS is AmigaOS, and resulting binaries
  > may be distributed commercially without further licensing. In all other cases
  > you need my written consent. Certain modules may fall under additional
  > copyrights."

  vasm is **source-available freeware**, not OSI/free-software open source.
  funklang's use is **non-commercial** and the build is **unmodified upstream
  source**; this notice provides the required attribution. For the complete,
  authoritative license text see the `COPYRIGHT`/manual in the upstream vasm
  distribution (http://sun.hasenbraten.de/vasm/).

### Shrinkler (data cruncher) — compiled to WebAssembly
- **Author/Copyright:** © Aske Simon Christensen (*Blueberry*).
  Home: https://github.com/askeksa/Shrinkler
- **Where:** `src/asm/shrinkler/shrinkler.{wasm,mjs}` (also bundled into the
  deployed site). Used in data mode (`-d -b`) to report the patch's **packed**
  `.bin` size.
- **Provenance:** an **unmodified** build of the upstream Shrinkler C++ source,
  recompiled to WebAssembly with Emscripten (`em++ … cruncher/Shrinkler.cpp`).
- **License:** Shrinkler may be compiled, used, copied, modified, merged and
  distributed (in whole or part), incl. in **binary form**, provided binary
  distributions are **not misattributed** (you must not claim you wrote it). This
  notice provides that attribution. (doshunks.h within Shrinkler is © 1989–1993
  Commodore-Amiga, Inc.) Full terms: the `LICENSE.txt` in the upstream repo.

### Emscripten runtime
- **Where:** the generated `vasm-m68k.mjs` and `shrinkler.mjs` embed
  Emscripten-generated runtime/glue code.
- **License:** Emscripten is licensed under the **MIT License** (and the University
  of Illinois/NCSA Open Source License), © the Emscripten authors.
  Home: https://emscripten.org/ — full text: https://github.com/emscripten-core/emscripten/blob/main/LICENSE

---

## Reimplemented / derived work (no third-party code or binaries redistributed)

funklang reimplements the following closed-source tools. Their **binaries and source
are NOT included** in this repository or the deployed site (they are gitignored /
kept out of the tree). All synthesis design, the `.bin` format, and the
code-generation approach are the original authors' work.

### AmigaKlang & AmigaKlang GUI
- **Author:** Jochen **"Virgill" Feldkötter** (Alcatraz / Haujobb / Maniacs of Noise).
- **Use in funklang:** the audio engine (`src/dsp/`) reimplements AmigaKlang's
  rendering core (verified sample-for-sample), the editor reimplements its UI, and
  the exported `.bin` follows its format. funklang is an independent reimplementation
  offered as a tribute; it is not endorsed by or affiliated with the author.
- GitHub (Archimedes-family port reference): https://github.com/kieranhj/archieklang
- Pouët: https://www.pouet.net/prod.php?which=85351

### Aklang2Asm
- **Author:** **Dan / Lemon.**
- **Use in funklang:** `src/asm/akgen/` reproduces Aklang2Asm's `AK_Generate` m68k
  output **byte-for-byte** (a clean TypeScript reimplementation; none of the original
  .NET tool's code or binary is included).

### 4Klang (lineage)
- **Author:** **Gopher / Alcatraz.** The modular-synth approach AmigaKlang follows.
  Acknowledged as influence; no code used.

---

## Build / development tooling (not shipped)

Dev-only dependencies, all under permissive (MIT/Apache-2.0-class) licenses; their
code is **not** distributed with the app: **Vite**, **Vitest**, **TypeScript**,
**Playwright**, **jsdom**, **tsx**. See each package's `LICENSE` in `node_modules/`.

The original Windows tool's runtime libraries (e.g. **NAudio**, MS-PL/MIT) and the
Amiga toolchain used only for offline cross-checks (**m68k-amiga-elf-gcc**, the
original `aklang2asm.exe`) live outside this repo (gitignored) and are **not**
redistributed. (Shrinkler IS now shipped as WASM — see the bundled section above.)

---

## funklang itself
funklang's own code is © Mikael Lepistö (elhigu / funktion) and released under the
**MIT License** (see `LICENSE`). The vasm and AmigaKlang-derived portions remain
under their respective terms above and are **not** relicensed by funklang.
