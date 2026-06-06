# Compile Harness — Design

**Date:** 2026-06-06
**Status:** Approved design, pre-implementation
**Sub-project 2 of 4** (exporter → **compile harness** → corpus → fitter). Depends on sub-project 1 (exporter, merged). Enables sub-project 3 (corpus) + 4 (fitter).

## Goal

A Node-only function `compilePatch(patch) → { uncompressed, shrinkled }` that compiles a funklang `Patch` through the real Amiga toolchain and returns the two byte sizes the fitter calibrates against. **Calibration-internal only** — no shipped output, never imported by the app. (Feasibility already proven by a manual spike: P01 → 13176 uncompressed / 4388 shrinkled.)

## Proven recipe (from the spike)

- `nix-shell -p wineWowPackages.stable` provides a WoW64 `wine`/`wine64` (10.0) that runs the x86-64 toolchain. No permanent system change.
- A fresh **win64** `WINEPREFIX` (`WINEARCH=win64`).
- `WINEPATH` set to the sandbox's `opt/bin` (so `gnumake` finds `m68k-amiga-elf-gcc`/`objdump`/`vasm`); `gnumake.exe`/`elf2hunk.exe`/`Shrinkler.exe` live in the sandbox root (cwd).
- Build: `wine gnumake.exe -f Makefile-executable` → `a.mingw.elf` → (elf2hunk) → `a.mingw.exe` (uncompressed hunk exe).
- Compress: `wine Shrinkler.exe -3 -f DFF182 -p a.mingw.exe exemusic.exe` → `exemusic.exe` (shrinklered).
- `uncompressed` = byte size of `a.mingw.exe`; `shrinkled` = byte size of `exemusic.exe`.
- `main-executable.c` includes `"Iset.h"`/`"Ilen.h"`/`"Inst.h"`; wine resolves these case-insensitively to our lowercase `ilen.h`/`inst.h`, so no extra files needed.

## Isolation & scratch

`exe_creator/` is entirely gitignored (`/exe_creator/`, 70 MB) — building in/around it never touches git. To keep the user's real `exe_creator/` (and the GUI) untouched and the corpus run independent, the harness builds in a **sandbox**:

- Sandbox dir + win64 prefix live under `funklang/sizelab/.scratch/` (added to `.gitignore`): `sizelab/.scratch/sandbox/` and `sizelab/.scratch/wineprefix/`.
- `ensureSandbox()` copies `../exe_creator` → the sandbox **once** (reused across builds); inits the win64 prefix once (`wineboot -i`) if missing.
- All harness code under `funklang/sizelab/harness/`, Node-only; `src/` never imports it (existing isolation test already guards this).

## Module layout

```
funklang/sizelab/harness/
  build-sandbox.ts   # ensureSandbox(): one-time exe_creator copy + win64 prefix; returns paths
  wine-env.ts        # wineEnv(prefix, sandboxDir), toWinePath(linuxPath) → "Z:\..."; the gnumake/Shrinkler argv
  compile.ts         # compilePatch(patch, opts) → CompileResult; orchestrates with an injected runner
  compile.smoke.test.ts  # real end-to-end test, guarded on wine present
  *.test.ts          # pure unit tests (no wine)
```

## API

```ts
export interface CompileResult {
  ok: boolean;
  uncompressed?: number;  // a.mingw.exe bytes
  shrinkled?: number;     // exemusic.exe bytes
  error?: string;         // stderr/stdout tail when ok === false
}

export type WineRunner = (
  argv: string[], opts: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
) => Promise<{ code: number; stdout: string; stderr: string }>;

export interface CompileOpts {
  sandboxDir?: string;   // default sizelab/.scratch/sandbox
  winePrefix?: string;   // default sizelab/.scratch/wineprefix
  timeoutMs?: number;    // default 120_000 per tool invocation
  run?: WineRunner;      // default: child_process spawn of `wine`; tests inject a fake
}

export function compilePatch(patch: Patch, opts?: CompileOpts): Promise<CompileResult>;
```

The default `run` shells out to `wine` **assuming it is on `PATH`** — the caller (corpus runner / smoke test) wraps the whole run in ONE `nix-shell -p wineWowPackages.stable` rather than paying nix-shell startup per build.

## Data flow (per `compilePatch`)

1. `ensureSandbox()` (idempotent).
2. Clean prior outputs in the sandbox: remove `obj/`, `a.mingw.*`, `exemusic.exe`, and the six generated files (forces a clean, deterministic rebuild).
3. `writeArtifacts(exportPatch(patch), sandboxDir)` — drops the six files in.
4. `run(['gnumake.exe','-f','Makefile-executable'], {cwd: sandbox, env, timeout})`. If `a.mingw.exe` is absent afterward → `{ ok:false, error: <stdout+stderr tail> }`.
5. `run(['Shrinkler.exe','-3','-f','DFF182','-p','a.mingw.exe','exemusic.exe'], …)`. If `exemusic.exe` absent → `{ ok:false, … }`.
6. `{ ok:true, uncompressed: size(a.mingw.exe), shrinkled: size(exemusic.exe) }`.

(`-j` is dropped from gnumake for deterministic, simpler runs.)

## Error handling

- Never throws on a compile/link/compress failure — returns `{ ok:false, error }` so the corpus records the failure and continues. (A patch using an op that fails to compile is data, not a crash.)
- Per-invocation timeout (`timeoutMs`, default 120 s); on timeout → `{ ok:false, error:'timeout' }`.
- `ensureSandbox` failures (missing `exe_creator`, prefix init failure) DO throw — they're environment misconfig, not per-patch data.

## Determinism & caching

gcc/Shrinkler are deterministic given fixed toolchain+flags, so one compile per patch suffices (no averaging). Optional content-hash cache (skip recompiling an identical patch) is **out of scope** — the corpus runs once; note it as a future optimization.

## Testing

- **Unit (no wine, run in normal `vitest`):**
  - `wine-env`: `toWinePath('/home/x') === 'Z:\\home\\x'`; `wineEnv` sets `WINEARCH=win64`, `WINEPREFIX`, `WINEPATH` to `<sandbox>\opt\bin`; argv for gnumake/Shrinkler exact.
  - `build-sandbox`: copies source once, is idempotent, computes correct paths (tested against a tiny fake source tree).
  - `compile.ts` orchestration with an **injected fake runner** that simulates writing `a.mingw.exe` (N bytes) and `exemusic.exe` (M bytes) → asserts `{ok:true, uncompressed:N, shrinkled:M}`; and a runner that writes nothing → `{ok:false, error}`; and a non-zero exit → `{ok:false}`.
- **Real smoke (needs wine):** `compile.smoke.test.ts`, `it.runIf(<wine on PATH>)`, compiles `VERIFICATION_PATCHES.P01` and asserts **uncompressed === 13176 && shrinkled === 4388** (deterministic spike anchor). Skips cleanly when wine absent.
- **npm script:** `"compile:smoke": "nix-shell -p wineWowPackages.stable --run 'vitest run sizelab/harness/compile.smoke.test.ts'"` so the real test can actually compile. (The default `vitest run` skips it — keeps the normal suite wine-free and green.)

## Out of scope

- The corpus generator (sub-project 3) and fitter (4) — they *consume* `compilePatch`.
- Any shipped/user-facing export (ASM/exe/source) — explicitly dropped; only the size estimate matters.
- Parallel builds, caching — serial is fine (~100 builds × seconds = minutes).
