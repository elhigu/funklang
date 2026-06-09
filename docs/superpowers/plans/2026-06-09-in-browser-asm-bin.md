# In-Browser m68k `.bin` Generation (Patch → asm → bin), fully client-side

**Goal:** Produce the real Amiga `.bin` (and exact size) from a funklang patch entirely in the browser — no wine, no server.

**Status of the pipeline (proven):**
- `Patch → C` — byte-exact, TS (`sizelab/exporter/`). ✓ (reference / engine reuse)
- `asm → .bin` — **vasm 2.0e compiled to WASM** (`src/asm/vasm.ts`, `src/asm/vasm/`). ✓ Verified: assembled the author's real `exemusic.asm` (4982 lines) → 10642-byte `.bin`, exit 0.
- `Patch → asm` — **the missing piece.** Today only the author's closed tool does it: `Aklang2Asm.exe V1.1 (Dan/Lemon)`, which reads a `script.txt` and emits Motorola-syntax asm (`AK_Generate`).

**Architecture:** Reimplement `Aklang2Asm` in TypeScript, verified byte-for-byte against the real tool (the oracle), exactly as the C exporter was verified against the original GUI. Then: `Patch → TS asm-gen → vasm-WASM → .bin`.

**Tech:** TypeScript; vasm-WASM (built, committed); oracle = `exe_creator/aklang2asm.exe` (32-bit .NET) + its output `exemusic.asm`.

---

## Key references (decompiled original + tool)
- **Dan-script (`script.txt`) format** — `reference/AmigaKlangGUI-decompiled/Form1.cs` lines **6477–6700** build `TextBoxTranslateDan.Text`, written to `script.txt` (line 7128), then `aklang2asm.bat` runs `aklang2asm script.txt exemusic.asm -pf`. Format:
  - Line 1: 8 imported-sample lengths, `len0, len1, …, len7\r\n`.
  - Per instrument (0..highest): `$ <name>, <sampleLength>, <loopOffset>, <loopLength>, <Y|N>\r\n#\r\n` where Y = slot 15 is a loop_gen (fn 22).
  - Then each op slot (skip `outVar==0` or `fn==22`): `<outVarText> = <funcName>(<args>);` — same op-arg encoding as the C exporter (`sizelab/exporter/op-args.ts`), with osc instance = slot index `j`.
- **Asm structure (oracle output)** — `exe_creator/exemusic.asm`: `AK_*` equ block (AK_SMP_LEN, AK_EXT_SMP_LEN, progress flags), `AK_Generate:` routine, per-instrument inline asm (`; Instrument N - name`), `AK_ResetVars`, `AK_Vars`, loop-generator interleave. Motorola syntax, vasm `ifne/ifeq/else/endif`.
- **Op semantics** — `exe_creator/synthnodes.h` (C reference) and the TS DSP engine (`src/dsp/`, bit-exact tested) define each op's exact math.

## Phases

### Phase 0 — Oracle harness
- [ ] Get `aklang2asm.exe` running (32-bit .NET; needs wineWow + wine-mono, or the user runs it on Windows). Verify `aklang2asm script.txt out.asm -pf` reproduces `exemusic.asm` for a known script.
- [ ] Script: funklang Patch → `script.txt` (see Phase 1) → run oracle → `out.asm` → assemble with the existing m68k toolchain AND vasm-WASM; confirm identical `.bin`. This makes the oracle a programmatic checker.

### Phase 1 — Dan-script generator (TS)
- [ ] `sizelab/exporter/emit-dan-script.ts`: `emitDanScript(patch): string` mirroring Form1.cs 6477–6700. Reuse `op-args.ts` arg encoding; add the imports line + `$`-instrument headers + the loop_gen Y/N flag + the `#` separators.
- [ ] Test: byte-compare against the original GUI's `script.txt` for several patches (or against the oracle's acceptance — it must assemble).

### Phase 2 — asm generator (TS), op by op (verified vs oracle)
- [ ] `src/asm/emit-akgen.ts`: `emitAkGenerate(patch): string` producing the `AK_Generate` asm. Build incrementally: framework/prologue + `AK_ResetVars` + `AK_Vars` first, then one op at a time.
- [ ] Per op: generate its inline asm, run the oracle on a patch using only that op, and **diff the asm** (normalize whitespace/labels). Lock each op with a fixture test before moving on. Order by frequency: osc_sine/saw/tri/pulse/noise, vol/add/mul, enva/envd, filters, cmb_flt_n/reverb, dly_cyc, sample_hold, ctrl, distortion, then cross-instrument (clone/chordgen/imported/adsr) and loop_gen interleave.
- [ ] Whole-patch check: for each real patch in `sizelab/corpus/real/`, TS-asm vs oracle-asm must assemble (vasm-WASM) to **identical bytes**.

### Phase 3 — wire it up
- [ ] `assembleBin(patch): { bytes, size }` = `emitAkGenerate` → `assembleM68k(..., {format:'hunk'|'bin'})`. Exact size = `bytes.length` (deterministic — no LTO folding).
- [ ] Replace the calibrated estimator's headline with this **exact** size when the asm build is selected; keep the estimator as the fast/no-wasm fallback.
- [ ] `</>` export panel: show generated C (engine reuse) + asm + downloadable `.bin`/hunk.

## Risks / notes
- Oracle is closed .NET; if it can't run in this sandbox, the user runs it on Windows to produce reference asm per fixture — verification still works, just not automated here.
- Bit-exactness of asm is per-op and testable; whole-patch byte-identity of the assembled `.bin` is the acceptance gate.
- The asm build is *deterministic* (fixed inline fragments) → exact sizes; it may differ from the current gcc `-flto` `.bin` sizes (that's expected — it's a different, ship-quality build the author designed).
