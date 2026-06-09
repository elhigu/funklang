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

---

## Progress (2026-06-09)

**DONE — offline pipeline works end-to-end and is committed:**
- Phase 0 (oracle): `Aklang2Asm.exe` runs under **mono** (no wine). `npm run asm:bin`.
- Phase 1 (Dan-script): `emitDanScript(patch)` in `sizelab/exporter/emit-inst.ts` (tested).
- Pipeline: `sizelab/harness/asm-bin.ts` `asmBinFromPatch()` = emitDanScript → mono Aklang2Asm → vasm-WASM → `.bin`. Verified on real patches.
- vasm-WASM (`src/asm/vasm.ts`) — the asm→bin half, fully in-browser. ✓

**Findings:**
- The asm path is **deterministic (exact size)** and **~35% smaller** than the gcc-C build on real patches (e.g. loctro 10596 B vs gcc 16276 B). Tiny patches are bigger (fixed framework).
- **Limitation**: Aklang2Asm only supports **constant** enva/envd attack (it `Int32.Parse`s it); variable-attack patches (gcc compiles them) fail the asm path. Real demo patches are fine.

**AK_Generate structure (for the Phase 2 TS reimplementation — from a 1-op oracle run):**
1. Header comment (fixed) + `equ` block: `AK_USE_PROGRESS`, `AK_FINE_PROGRESS`, `AK_FINE_PROGRESS_LEN` (= total sample bytes incl. loops), `AK_SMP_LEN` (= Σ instrument sampleLengths), `AK_EXT_SMP_LEN` (= Σ imported lengths).
2. `AK_Generate:` prologue — **fixed**: `lea AK_Vars(pc),a5`; progress init; build 31 sample base addresses + 8 external base addresses from `AK_SmpLen`/`AK_SmpAddr` via the `.SmpAdrLoop`/`.ExtSmpAdrLoop`.
3. Per instrument: `; Instrument N - name`; `moveq #k,d0; bsr AK_ResetVars; moveq #0,d7`; progress (coarse); `.InstNLoop`; **one inline snippet per op slot** (parameterised immediates — e.g. osc_saw = `add.w #freq,AK_OpInstance+<2*var>(a5)` / `move.w ...,d0` / `asr.w #1,d0` + vol scaling); tail `asr.w #8,d0; move.b d0,(a0)+`; fine progress; `addq.l #1,d7; cmp.l AK_SmpLen+<4k>(a5),d7; blt .InstNLoop`. Loop-gen (slot 15) interleaves here.
4. Epilogue (**fixed**): clear first 2 bytes of each sample; `rts`.
5. `AK_ResetVars:` clears the working vars used (count depends on ops present).
6. `AK_Vars:` `rsreset` struct (AK_LPF/HPF/BPF, AK_CHORD1-3, AK_SmpLen rs.l 31, AK_ExtSmpLen rs.l 8, AK_SmpAddr rs.l 31, AK_ExtSmpAddr rs.l 8, AK_OpInstance rs.w <2·#instances>, …) + `dc.l` of the 31 instrument lengths + 8 external lengths + `ds.b AK_VarSize-AK_SmpAddr`.

Phase 2 = port §1–6 to TS (framework templates are fixed; the work is the ~20 op
snippets + the instance/var allocator), verifying each op's **assembled bytes**
(vasm-WASM) against the oracle's, op by op. Multi-session; foundation is all in place.
