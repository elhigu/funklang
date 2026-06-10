# Shrinkler → WebAssembly

In-browser data cruncher, so the editor can show the **packed** `.bin` size (what
the blob actually costs once compressed into a demo).

- `shrinkler.mjs` + `shrinkler.wasm` — prebuilt Emscripten ES module of
  **Shrinkler** (© Aske Simon Christensen / *Blueberry*,
  https://github.com/askeksa/Shrinkler). An **unmodified** build of the upstream
  source, only retargeted to WASM. Loaded by `../shrinkler.ts`.
- Invoked in **data** mode: `shrinkle(bytes)` runs `Shrinkler -d -b` (`-d` = raw
  data not executable, `-b` = byte-oriented context). The result is the compressed
  payload only (no exe/data header) — the size you'd embed alongside one shared
  `ShrinklerDecompress` routine.

Shrinkler's license permits compiling/using/distributing it (incl. in binary
form) provided it isn't misattributed — see `../../../THIRD-PARTY-NOTICES.md`.

## Rebuild
Requires Emscripten (e.g. `nix-shell -p emscripten`). From an unpacked Shrinkler
source tree (https://github.com/askeksa/Shrinkler):

```sh
em++ -O3 -I decrunchers_bin cruncher/Shrinkler.cpp \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORTED_RUNTIME_METHODS=callMain,FS \
  -sINVOKE_RUN=0 -sALLOW_MEMORY_GROWTH=1 -sFORCE_FILESYSTEM=1 -sEXIT_RUNTIME=1 \
  -o shrinkler.mjs
```

Verify against a native build (`make`) on the same input: the compressed size
must match byte-for-byte. (A 2024-byte test `.bin` packs to 751 bytes in both.)
