# Aklang2Asm → TypeScript port (`emitAkGenerate`) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A TypeScript function `emitAkGenerate(patch): string` that produces m68k assembly **byte-identical** (after assembly) to the synth author's `Aklang2Asm.exe`, so a funklang patch compiles to the real Amiga `.bin` **fully in the browser** (`Patch → emitAkGenerate → vasm-WASM → .bin`).

**Architecture:** Faithful port of the decompiled C# (the oracle), method-for-method, optimization-for-optimization — the same approach used for the byte-exact C exporter (ported from `Form1.cs`). Each op is locked with a byte-identity test before moving on.

**Tech Stack:** TypeScript (no deps); `vasm-WASM` (`src/asm/vasm.ts`, shipped) for assembly; `mono` + `aklang2asm.exe` as the oracle during development; the decompiled C# as the line-by-line reference.

## Reference material (all present)
- **Oracle (decompiled C#):** `../reference/Aklang2Asm-decompiled/Program.cs` (1842 lines). One method per op with exact line numbers:
  `Volume` 465, `Osc_Saw` 500, `Osc_Tri` 539, `Osc_Pulse` 581, `Osc_Sine` 647, `Osc_Noise` 694, `Sample_And_Hold` 732, `Env_Decay` 770, `Env_Attack` 820, `Mul` 865, `Add` 891, `Control` 920, `Delay` 936, `CombFilter` 1021, `Reverb` 1140, `SVFilter` 1259, `OnePoleFilter` 1353, `Distortion` 1431, `ADSR` 1482, `ChordGen` 1508, `Clone` 1581, `CloneReverse` 1605, `ImportedSample` 1630, `LoopGenerator` 1637.
  Helpers: `GetInstanceOffset` 1689, `RemapVarToRegisterOrImmediate` 1699 (v1→d0,v2→d1,v3→d2,v4→d3,smp→d7,else `#value`), `GetDecayValue` (128-entry table), `GetChordValue` (13-entry), `VarsCode`. State: `currentWordInstance`/`maxWordInstance`, `currentLargeBufferInstance`/`max`, `currentEnvDInstance`/`max`, `usedNoise`, `useProgress`/`useFineProgress`, `mulRightShifts`/`mulLeftShifts` (the multiply→shift tables — set up in `Main`).
- **Live oracle:** `npm run asm:bin` and `sizelab/harness/asm-bin.ts::asmBinFromPatch` (Patch → mono Aklang2Asm → asm; reuse for capturing reference bytes).
- **Input format:** `emitDanScript(patch)` (done) — Aklang2Asm reads this.
- **Op semantics cross-check:** `exe_creator/synthnodes.h` + the bit-exact TS DSP (`src/dsp/`).

## File structure
- `src/asm/akgen/types.ts` — `AkGenState` (instance counters, flags, mul tables) + small value types.
- `src/asm/akgen/helpers.ts` — `remapVar`, `getInstanceOffset`, `getDecayValue`, `getChordValue`, the `mulRightShifts`/`mulLeftShifts` maps.
- `src/asm/akgen/framework.ts` — header/equ block, `AK_Generate` prologue, per-instrument loop scaffold + tail, epilogue, `AK_ResetVars`, `VarsCode` (`AK_Vars`).
- `src/asm/akgen/ops.ts` — one function per op (`oscSaw`, `oscSine`, …), each a port of the matching C# method; dispatched by op code.
- `src/asm/akgen/index.ts` — `emitAkGenerate(patch): string` (mirrors `Main`: parse-equivalent from Patch, drive instruments + ops + loop-gen interleave).
- `tests/asm/akgen/oracle.ts` — dev harness (needs mono): `oracleBin(patch)` and `tsBin(patch)` → assemble both via vasm → `Uint8Array`; `assertSameBin(patch)` diffs bytes (+ asm text on mismatch).
- `tests/asm/akgen/fixtures/*.json` — frozen oracle `.bin` bytes per fixture patch (captured once with mono), so CI verifies `tsBin == fixtureBytes` **without** mono.

## VERIFICATION (the gate for every step)
Two layers, both required before a task is "done":
1. **Dev (needs mono):** `assertSameBin(patch)` — `emitAkGenerate`→vasm bytes **===** `aklang2asm`→vasm bytes. Run for a patch exercising the op just ported.
2. **CI (no mono):** capture the oracle bytes once into `fixtures/<op>.json`; a vitest asserts `tsBin(fixturePatch) === fixtureBytes`. This is what proves it "stays complete and functional".

A task is complete only when both pass and the fixture test is committed.

---

### Task 0: Verification harness + framework skeleton
**Files:** Create `tests/asm/akgen/oracle.ts`, `src/asm/akgen/{types,helpers,framework,index,ops}.ts`.

- [ ] **Step 1 — harness.** `oracle.ts`: `oracleBin(patch)` = `asmBinFromPatch(patch)` (already returns assembled bytes); `tsBin(patch)` = `assembleM68k(emitAkGenerate(patch),{format:'bin'})`; `assertSameBin(patch)` throws with a unified asm diff + first differing byte offset on mismatch.
- [ ] **Step 2 — framework.** Port `Main`'s fixed scaffolding (`../reference/.../Program.cs` ~76–465 minus per-op dispatch) into `framework.ts` + `index.ts`. Confirmed pieces to reproduce exactly:
  - `DividerCode()` (the `;---` rule), header comment, equ block with `%LARGEBUFFSIZE%`/`%FINEPROGRESSLEN%`/`%SAMPLESIZE%`/`%MAXLARGEBUFFERINSTANCES%`/`%MAXWORDINSTANCES%`/`%MAXENVDINSTANCES%` placeholders, substituted at the very end (`AK_SMP_LEN`=Σ sampleLengths, `AK_EXT_SMP_LEN`=Σ imports, `fineProgressLength`=Σ lengths, `%LARGEBUFFSIZE%`=maxLargeBufferInstance·4096).
  - prologue: `lea AK_Vars(pc),a5`; progress init; `.SmpAdrLoop`(31)/`.ExtSmpAdrLoop`(8) base-address build; **delta-decode loop only when `externalSampleTotalLength>0`**.
  - per instrument: **empty-instrument branch** (no ops → `addq/lea/add.l` advance a0 by length + progress, by size bracket ≤8 / ≤32767 / larger); else divider+comment+`moveq #<largeBufInst|%MAXLARGEBUFFERINSTANCES% for j==0>,d0`+`bsr AK_ResetVars`+`moveq #0,d7`+coarse-progress+`.Inst<j+1>Loop`; reset `currentWordInstance/currentLargeBufferInstance/currentEnvDInstance=0`; dispatch ops by substring match (`vol(`,`osc_saw(`,…); per-slot `; <stmt>` comment.
  - instrument tail: `asr.w #8,d0; move.b d0,(a0)+`; fine progress; `addq.l #1,d7; cmp.l AK_SmpLen+<j<<2>(a5),d7; blt .Inst<j+1>Loop`; update `max*Instance`; **loop-gen interleave** when `instrumentLoop[j]=='Y'` (movem stash → `LoopGenerator` → movem restore).
  - after all instruments: round `maxWordInstance` up to even; epilogue (clear-first-2-bytes loop + `rts`); `ClearVarsCode()` (`AK_ResetVars`); `VarsCode()` (`AK_Vars`, includes `AK_NoiseSeeds` iff `usedNoise`). Use `useProgress=useFineProgress=true` (the `-pf` default).
- [ ] **Step 3 — verify on the empty/no-op case.** Build a patch with a single instrument whose only op is one already-trivial path **or** an empty instrument; run `assertSameBin`. Expected: identical bytes (framework only). Iterate `framework.ts` until it matches.
- [ ] **Step 4 — commit** `git add src/asm/akgen tests/asm/akgen && git commit -m "feat(akgen): verification harness + framework skeleton (byte-matches oracle)"`.

### Tasks 1..N: one op per task (frequency order)
Order: `osc_saw`(2), `osc_sine`(4), `osc_tri`(3), `osc_pulse`(5), `osc_noise`(6), `vol`(1), `add`(9), `mul`(10), `ctrl`(14), `enva`(7), `envd`(8), `sv_flt_n`(15), `onepole_flt`(21), `cmb_flt_n`(12), `reverb`(13), `dly_cyc`(11), `sample_hold`(19), `distortion`(16), then cross-instrument `clone`(17)/`chordgen`(18)/`imported`(20)/`adsr`(23) and `loop_gen`(22) interleave.

Each op task (template):
- [ ] **Step 1 — port** the matching C# method into `ops.ts` (e.g. `Osc_Saw` 500–538 → `oscSaw`). Preserve every branch: the `mulRightShifts` power-of-2 path, the `#128` special-case, the general `muls` path, `@FR/@IN/@OR/@GN/@GS/@TR1` substitutions, and the `currentWordInstance++` (or large/envd instance) bookkeeping.
- [ ] **Step 2 — fixture patch** exercising the op across its modes/value classes (const + power-of-2 gain + non-power-of-2 + variable operand) in `tests/asm/akgen/oracle.ts` builders.
- [ ] **Step 3 — dev verify:** `nix-shell -p mono --run 'npx tsx tests/asm/akgen/check.ts <op>'` → `assertSameBin` passes (identical bytes) for each fixture. Fix the port until it does.
- [ ] **Step 4 — freeze + CI test:** capture `tsBin`/oracle bytes to `fixtures/<op>.json`; add a vitest asserting `tsBin(fixture)===fixtureBytes`. Run `npx vitest run tests/asm/akgen`.
- [ ] **Step 5 — commit** `feat(akgen): <op> op (byte-identical to oracle)`.

### Task N+1: whole-patch acceptance
- [ ] For every patch in `sizelab/corpus/real/*.akp` that the oracle accepts (skip variable-enva-attack patches — documented limitation), assert `tsBin === oracleBin` (dev, mono) and freeze a few as CI fixtures.
- [ ] Run the full `npm run typecheck && npx vitest run`.

### Task N+2: wire-up (Phase 3)
- [ ] `assembleBinInBrowser(patch): {bytes, size}` = `emitAkGenerate` → `assembleM68k(...,{format:'hunk'})`.
- [ ] Footer: when "asm build" is selected, show the **exact** size (`bytes.length`) instead of the estimate; keep the estimator as the no-wasm fallback.
- [ ] `</>` panel: generated C (engine reuse) + asm + downloadable `.bin`/hunk. Update the help modal (UX-change rule).

## Notes / risks
- **Byte-identity is the gate**, not asm text — assemble both and compare bytes (whitespace/labels/comments are free to differ, though porting verbatim minimises surprises).
- The instance allocators (`currentWordInstance`, `currentLargeBufferInstance` for reverb's 8 comb buffers, `currentEnvDInstance`) and `VarsCode` sizing are the subtle parts — port their counter logic exactly; the whole-patch test catches allocation drift.
- `usedNoise` adds `AK_NoiseSeeds` to `VarsCode` — set it when an `osc_noise` is emitted, like the C#.
- If mono is unavailable in CI, fixtures (frozen bytes) keep the tests functional; regenerate them with mono when the port changes.
