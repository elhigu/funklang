# vasm (m68k) → WebAssembly

In-browser m68k assembler. Lets the app assemble m68k source to raw binary or
Amiga hunk client-side, with no toolchain or server.

- `vasm-m68k.mjs` + `vasm-m68k.wasm` — prebuilt Emscripten ES module (vasm 2.0e,
  `vasmm68k_mot`: m68k CPU, Motorola syntax). Loaded by `../vasm.ts`.
- vasm is © Volker Barthelmann and Frank Wille (http://sun.hasenbraten.de/vasm/).
  **Source-available freeware** (not OSI open source): non-commercial redistribution
  of the unmodified work is permitted with attribution. This is an **unmodified**
  build of the upstream source, only retargeted to WASM (no source changes). See
  `../../../THIRD-PARTY-NOTICES.md` for the full terms.

## Syntax note
vasm uses **Motorola** syntax. The native `m68k-amiga-elf-gcc` emits **GAS**
syntax — so gcc `-S` output is *not* directly assemblable here. To go C → vasm,
either convert the gas asm to Motorola syntax, or hand-write the op routines in
Motorola syntax (verified against gcc's bytes via the native toolchain).

## Rebuild
Requires Emscripten (e.g. `nix-shell -p emscripten`). From an unpacked vasm
source tree (http://sun.hasenbraten.de/vasm/release/vasm.tar.gz):

```sh
emmake make CPU=m68k SYNTAX=mot CC=emcc HOSTCC=emcc
emcc obj/m68k_mot_*.o -lm \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORTED_RUNTIME_METHODS=callMain,FS \
  -sINVOKE_RUN=0 -sALLOW_MEMORY_GROWTH=1 -sFORCE_FILESYSTEM=1 -sEXIT_RUNTIME=1 \
  -O2 -o vasm-m68k.mjs
```

Smoke test (Node): `assembleM68k("\tmoveq #1,d0\n\trts\n")` → `70 01 4e 75`.
