# Compile Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Node-only `compilePatch(patch) → { ok, uncompressed, shrinkled }` that compiles a funklang `Patch` through the real Amiga toolchain (under wineWow) and returns the two byte sizes the fitter calibrates against.

**Architecture:** Three small files under `funklang/sizelab/harness/`: `wine-env` (env/argv construction, pure), `build-sandbox` (one-time `exe_creator` copy + win64 prefix), `compile` (orchestration with an injected wine runner so unit tests need no wine). One guarded real smoke test compiles P01 and asserts the spike anchors (13176 / 4388). Caller wraps runs in one `nix-shell -p wineWowPackages.stable`.

**Tech Stack:** TypeScript, Vitest (Node), `node:child_process`/`node:fs`, the existing exporter (`sizelab/exporter/`) and `sizelab/tools/verification-patches`.

**Spec:** `funklang/docs/superpowers/specs/2026-06-06-compile-harness-design.md`
**Proven recipe (spike):** P01 → `a.mingw.exe` 13176 bytes, `exemusic.exe` 4388 bytes.

---

## File Structure
- Create `funklang/sizelab/harness/wine-env.ts` — `toWinePath`, `wineEnv`, `GNUMAKE_ARGV`, `SHRINKLER_ARGV`.
- Create `funklang/sizelab/harness/build-sandbox.ts` — `ensureSandbox()`.
- Create `funklang/sizelab/harness/compile.ts` — `compilePatch()`, `CompileResult`, `WineRunner`, default runner.
- Create `funklang/sizelab/harness/compile.smoke.test.ts` — real end-to-end, wine-guarded.
- Modify root `.gitignore` — ignore `funklang/sizelab/.scratch/`.
- Modify `funklang/package.json` — add `compile:smoke` script.

Path facts: `sizelab/harness/*.ts` has `import.meta.dirname = …/funklang/sizelab/harness`; `exe_creator` is `resolve(dirname,'..','..','..','exe_creator')`; scratch is `resolve(dirname,'..','.scratch')` = `funklang/sizelab/.scratch`.

---

## Task 1: gitignore scratch + wine-env

**Files:**
- Modify: `.gitignore` (repo root)
- Create: `funklang/sizelab/harness/wine-env.ts`
- Test: `funklang/sizelab/harness/wine-env.test.ts`

- [ ] **Step 1: Ignore the scratch dir**

Append to the repo-root `.gitignore`:
```
funklang/sizelab/.scratch/
```

- [ ] **Step 2: Write the failing test**

```typescript
// funklang/sizelab/harness/wine-env.test.ts
import { describe, it, expect } from 'vitest';
import { toWinePath, wineEnv, GNUMAKE_ARGV, SHRINKLER_ARGV } from './wine-env';

describe('toWinePath', () => {
  it('maps a linux abs path onto the wine Z: drive with backslashes', () => {
    expect(toWinePath('/home/x/exe_creator/opt/bin')).toBe('Z:\\home\\x\\exe_creator\\opt\\bin');
  });
});

describe('wineEnv', () => {
  it('sets win64 arch, prefix, debug, and WINEPATH = sandbox\\opt\\bin', () => {
    const env = wineEnv('/p/prefix', '/p/sandbox', {});
    expect(env.WINEARCH).toBe('win64');
    expect(env.WINEPREFIX).toBe('/p/prefix');
    expect(env.WINEDEBUG).toBe('-all');
    expect(env.WINEPATH).toBe('Z:\\p\\sandbox\\opt\\bin');
  });
  it('preserves the base environment', () => {
    expect(wineEnv('/p', '/s', { FOO: 'bar' }).FOO).toBe('bar');
  });
});

describe('argv', () => {
  it('gnumake + shrinkler argv match the proven recipe', () => {
    expect(GNUMAKE_ARGV).toEqual(['gnumake.exe', '-f', 'Makefile-executable']);
    expect(SHRINKLER_ARGV).toEqual(['Shrinkler.exe', '-3', '-f', 'DFF182', '-p', 'a.mingw.exe', 'exemusic.exe']);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd funklang && npx vitest run sizelab/harness/wine-env.test.ts`
Expected: FAIL — cannot resolve `./wine-env`.

- [ ] **Step 4: Write the implementation**

```typescript
// funklang/sizelab/harness/wine-env.ts
import { join } from 'node:path';

/** Linux absolute path → wine Z: drive Windows path. */
export function toWinePath(linuxPath: string): string {
  return 'Z:' + linuxPath.replace(/\//g, '\\');
}

/** Env for invoking the win64 toolchain under wine in `sandboxDir`. */
export function wineEnv(
  winePrefix: string,
  sandboxDir: string,
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  return {
    ...base,
    WINEPREFIX: winePrefix,
    WINEARCH: 'win64',
    WINEDEBUG: '-all',
    WINEPATH: toWinePath(join(sandboxDir, 'opt', 'bin')),
  };
}

export const GNUMAKE_ARGV = ['gnumake.exe', '-f', 'Makefile-executable'];
export const SHRINKLER_ARGV = ['Shrinkler.exe', '-3', '-f', 'DFF182', '-p', 'a.mingw.exe', 'exemusic.exe'];
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd funklang && npx vitest run sizelab/harness/wine-env.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .gitignore funklang/sizelab/harness/wine-env.ts funklang/sizelab/harness/wine-env.test.ts
git commit -m "feat(sizelab): wine env/argv construction + ignore scratch dir"
```

---

## Task 2: build sandbox

**Files:**
- Create: `funklang/sizelab/harness/build-sandbox.ts`
- Test: `funklang/sizelab/harness/build-sandbox.test.ts`

`ensureSandbox()` copies `exe_creator` into the scratch sandbox once (detected by presence of `Makefile-executable`) and initializes the win64 prefix once. Both `source`, `sandboxDir`, `winePrefix`, and `initPrefix` are injectable for tests.

- [ ] **Step 1: Write the failing test**

```typescript
// funklang/sizelab/harness/build-sandbox.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ensureSandbox } from './build-sandbox';

function fakeSource(): string {
  const src = mkdtempSync(join(tmpdir(), 'exesrc-'));
  writeFileSync(join(src, 'Makefile-executable'), 'all:\n');
  mkdirSync(join(src, 'opt', 'bin'), { recursive: true });
  writeFileSync(join(src, 'opt', 'bin', 'm68k-amiga-elf-gcc.exe'), 'x');
  return src;
}

describe('ensureSandbox', () => {
  let root: string;
  beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'sbx-')); });

  it('copies the source into the sandbox and inits the prefix once', () => {
    const source = fakeSource();
    let inits = 0;
    const dir = join(root, 'sandbox');
    const winePrefix = join(root, 'prefix');
    const sb = ensureSandbox({ source, sandboxDir: dir, winePrefix, initPrefix: () => { inits++; } });
    expect(sb.dir).toBe(dir);
    expect(sb.winePrefix).toBe(winePrefix);
    expect(existsSync(join(dir, 'Makefile-executable'))).toBe(true);
    expect(existsSync(join(dir, 'opt', 'bin', 'm68k-amiga-elf-gcc.exe'))).toBe(true);
    expect(inits).toBe(1);
  });

  it('is idempotent — second call does not re-copy or re-init', () => {
    const source = fakeSource();
    let inits = 0;
    const dir = join(root, 'sandbox');
    const winePrefix = join(root, 'prefix');
    const opts = { source, sandboxDir: dir, winePrefix, initPrefix: () => { inits++; } };
    ensureSandbox(opts);
    // mutate the sandbox copy; a re-copy would overwrite it
    writeFileSync(join(dir, 'Makefile-executable'), 'TOUCHED\n');
    ensureSandbox(opts);
    expect(readFileSync(join(dir, 'Makefile-executable'), 'utf8')).toBe('TOUCHED\n');
    expect(inits).toBe(1);
  });

  it('throws if the source does not exist', () => {
    expect(() => ensureSandbox({ source: join(root, 'nope'), sandboxDir: join(root, 's'), winePrefix: join(root, 'p'), initPrefix: () => {} }))
      .toThrow(/source not found/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd funklang && npx vitest run sizelab/harness/build-sandbox.test.ts`
Expected: FAIL — cannot resolve `./build-sandbox`.

- [ ] **Step 3: Write the implementation**

```typescript
// funklang/sizelab/harness/build-sandbox.ts
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

export interface Sandbox { dir: string; winePrefix: string; }

const SCRATCH = resolve(import.meta.dirname, '..', '.scratch');
const DEFAULT_SANDBOX = join(SCRATCH, 'sandbox');
const DEFAULT_PREFIX = join(SCRATCH, 'wineprefix');
const EXE_CREATOR = resolve(import.meta.dirname, '..', '..', '..', 'exe_creator');

export interface EnsureSandboxOpts {
  source?: string;
  sandboxDir?: string;
  winePrefix?: string;
  /** Injected for tests; default runs `wineboot -i` against the prefix. */
  initPrefix?: (winePrefix: string) => void;
}

/** Init a fresh win64 wine prefix (real default). Needs `wine`/`wineboot` on PATH. */
function realInitPrefix(winePrefix: string): void {
  spawnSync('wineboot', ['-i'], {
    env: { ...process.env, WINEPREFIX: winePrefix, WINEARCH: 'win64', WINEDEBUG: '-all' },
    timeout: 300_000,
    stdio: 'ignore',
  });
}

/** Copy exe_creator into the scratch sandbox once and init the prefix once. */
export function ensureSandbox(opts: EnsureSandboxOpts = {}): Sandbox {
  const source = opts.source ?? EXE_CREATOR;
  const dir = opts.sandboxDir ?? DEFAULT_SANDBOX;
  const winePrefix = opts.winePrefix ?? DEFAULT_PREFIX;
  const initPrefix = opts.initPrefix ?? realInitPrefix;

  if (!existsSync(source)) throw new Error(`exe_creator source not found: ${source}`);
  if (!existsSync(join(dir, 'Makefile-executable'))) {
    mkdirSync(dir, { recursive: true });
    cpSync(source, dir, { recursive: true });
  }
  if (!existsSync(winePrefix)) {
    mkdirSync(winePrefix, { recursive: true });
    initPrefix(winePrefix);
  }
  return { dir, winePrefix };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd funklang && npx vitest run sizelab/harness/build-sandbox.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add funklang/sizelab/harness/build-sandbox.ts funklang/sizelab/harness/build-sandbox.test.ts
git commit -m "feat(sizelab): build sandbox (one-time exe_creator copy + win64 prefix)"
```

---

## Task 3: compilePatch orchestration

**Files:**
- Create: `funklang/sizelab/harness/compile.ts`
- Test: `funklang/sizelab/harness/compile.test.ts`

Orchestrates: ensureSandbox → clean → writeArtifacts → gnumake → Shrinkler → sizes. The wine call is an injected `WineRunner`; unit tests pass a fake runner + a pre-made sandbox/prefix (so no copy, no wine).

- [ ] **Step 1: Write the failing test**

```typescript
// funklang/sizelab/harness/compile.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import { compilePatch, type WineRunner } from './compile';

function readySandbox(): { sandboxDir: string; winePrefix: string } {
  const root = mkdtempSync(join(tmpdir(), 'cmp-'));
  const sandboxDir = join(root, 'sandbox');
  mkdirSync(join(sandboxDir, 'opt', 'bin'), { recursive: true });
  writeFileSync(join(sandboxDir, 'Makefile-executable'), 'all:\n'); // ensureSandbox sees it as ready
  const winePrefix = join(root, 'prefix');
  mkdirSync(winePrefix, { recursive: true });                       // ensureSandbox skips init
  return { sandboxDir, winePrefix };
}

function patch() {
  const p = emptyPatch();
  p.instruments[0]!.sampleLength = 5000;
  p.instruments[0]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1, freqVal: 1000, gainVal: 64 }];
  return p;
}

describe('compilePatch', () => {
  let sb: { sandboxDir: string; winePrefix: string };
  beforeEach(() => { sb = readySandbox(); });

  it('returns sizes from the produced exe files on success', async () => {
    // fake runner: gnumake writes a 100-byte a.mingw.exe; shrinkler writes a 40-byte exemusic.exe
    const run: WineRunner = async (argv, { cwd }) => {
      if (argv[0] === 'gnumake.exe') writeFileSync(join(cwd, 'a.mingw.exe'), Buffer.alloc(100));
      else writeFileSync(join(cwd, 'exemusic.exe'), Buffer.alloc(40));
      return { code: 0, stdout: '', stderr: '' };
    };
    const r = await compilePatch(patch(), { ...sb, run });
    expect(r).toEqual({ ok: true, uncompressed: 100, shrinkled: 40 });
  });

  it('writes the six exporter files into the sandbox before building', async () => {
    let sawInst = false;
    const run: WineRunner = async (argv, { cwd }) => {
      const fs = await import('node:fs');
      if (argv[0] === 'gnumake.exe') {
        sawInst = fs.existsSync(join(cwd, 'inst.h')) && fs.existsSync(join(cwd, 'Iset.h'));
        writeFileSync(join(cwd, 'a.mingw.exe'), Buffer.alloc(10));
      } else writeFileSync(join(cwd, 'exemusic.exe'), Buffer.alloc(5));
      return { code: 0, stdout: '', stderr: '' };
    };
    await compilePatch(patch(), { ...sb, run });
    expect(sawInst).toBe(true);
  });

  it('returns ok:false with error when gnumake produces no exe', async () => {
    const run: WineRunner = async () => ({ code: 1, stdout: 'boom-out', stderr: 'boom-err' });
    const r = await compilePatch(patch(), { ...sb, run });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/gnumake failed/);
    expect(r.error).toMatch(/boom/);
  });

  it('returns ok:false when Shrinkler produces no compressed file', async () => {
    const run: WineRunner = async (argv, { cwd }) => {
      if (argv[0] === 'gnumake.exe') writeFileSync(join(cwd, 'a.mingw.exe'), Buffer.alloc(10));
      return { code: 0, stdout: '', stderr: '' }; // shrinkler writes nothing
    };
    const r = await compilePatch(patch(), { ...sb, run });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Shrinkler failed/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd funklang && npx vitest run sizelab/harness/compile.test.ts`
Expected: FAIL — cannot resolve `./compile`.

- [ ] **Step 3: Write the implementation**

```typescript
// funklang/sizelab/harness/compile.ts
import { statSync, existsSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import type { Patch } from '../../src/patch/types';
import { exportPatch } from '../exporter/export-patch';
import { writeArtifacts } from '../exporter/write-artifacts';
import { ensureSandbox } from './build-sandbox';
import { wineEnv, GNUMAKE_ARGV, SHRINKLER_ARGV } from './wine-env';

export interface CompileResult {
  ok: boolean;
  uncompressed?: number;  // a.mingw.exe bytes
  shrinkled?: number;     // exemusic.exe bytes
  error?: string;
}

export type WineRunner = (
  argv: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number },
) => Promise<{ code: number; stdout: string; stderr: string }>;

export interface CompileOpts {
  sandboxDir?: string;
  winePrefix?: string;
  timeoutMs?: number;
  run?: WineRunner;
}

const defaultRunner: WineRunner = async (argv, { cwd, env, timeoutMs }) => {
  const r = spawnSync('wine', argv, { cwd, env, timeout: timeoutMs, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return {
    code: r.status ?? 1,
    stdout: r.stdout ?? '',
    stderr: (r.stderr ?? '') + (r.error ? `\n${String(r.error)}` : ''),
  };
};

const tail = (s: string, n = 2000): string => (s.length > n ? s.slice(-n) : s);

const STALE = ['a.mingw.exe', 'a.mingw.elf', 'a.mingw.s', 'a.mingw.map', 'exemusic.exe',
  'ilen.h', 'inst.h', 'Iset.h', 'Isamp.raw', 'empty.mod'];

export async function compilePatch(patch: Patch, opts: CompileOpts = {}): Promise<CompileResult> {
  const run = opts.run ?? defaultRunner;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const { dir, winePrefix } = ensureSandbox({ sandboxDir: opts.sandboxDir, winePrefix: opts.winePrefix });
  const env = wineEnv(winePrefix, dir);

  // Clean prior outputs for a deterministic rebuild.
  rmSync(join(dir, 'obj'), { recursive: true, force: true });
  for (const f of STALE) rmSync(join(dir, f), { force: true });

  writeArtifacts(exportPatch(patch), dir);

  const make = await run([...GNUMAKE_ARGV], { cwd: dir, env, timeoutMs });
  const uncompressedPath = join(dir, 'a.mingw.exe');
  if (!existsSync(uncompressedPath)) {
    return { ok: false, error: `gnumake failed (code ${make.code}):\n${tail(make.stdout + make.stderr)}` };
  }

  const shrink = await run([...SHRINKLER_ARGV], { cwd: dir, env, timeoutMs });
  const shrinkledPath = join(dir, 'exemusic.exe');
  if (!existsSync(shrinkledPath)) {
    return { ok: false, error: `Shrinkler failed (code ${shrink.code}):\n${tail(shrink.stdout + shrink.stderr)}` };
  }

  return { ok: true, uncompressed: statSync(uncompressedPath).size, shrinkled: statSync(shrinkledPath).size };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd funklang && npx vitest run sizelab/harness/compile.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add funklang/sizelab/harness/compile.ts funklang/sizelab/harness/compile.test.ts
git commit -m "feat(sizelab): compilePatch orchestration (injected wine runner)"
```

---

## Task 4: real smoke test + npm script + gate

**Files:**
- Create: `funklang/sizelab/harness/compile.smoke.test.ts`
- Modify: `funklang/package.json`

The smoke test does a real compile under wine; it self-skips when `wine` is absent so the normal suite stays wine-free.

- [ ] **Step 1: Write the smoke test**

```typescript
// funklang/sizelab/harness/compile.smoke.test.ts
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { VERIFICATION_PATCHES } from '../tools/verification-patches';
import { compilePatch } from './compile';

function hasWine(): boolean {
  try { return spawnSync('wine', ['--version'], { stdio: 'ignore' }).status === 0; }
  catch { return false; }
}

// Real end-to-end compile; only runs when wine is on PATH (i.e. inside
// `nix-shell -p wineWowPackages.stable`). Run via: npm run compile:smoke
describe('compilePatch (real toolchain)', () => {
  it.runIf(hasWine())('compiles P01 to the spike anchor sizes', async () => {
    const r = await compilePatch(VERIFICATION_PATCHES['P01']!);
    expect(r.ok, r.error).toBe(true);
    expect(r.uncompressed).toBe(13176);
    expect(r.shrinkled).toBe(4388);
  }, 600_000);
});
```

- [ ] **Step 2: Add the npm script**

In `funklang/package.json` `"scripts"`, add:
```json
    "compile:smoke": "nix-shell -p wineWowPackages.stable --run 'vitest run sizelab/harness/compile.smoke.test.ts'",
```

- [ ] **Step 3: Verify it skips cleanly without wine**

Run: `cd funklang && npx vitest run sizelab/harness/compile.smoke.test.ts`
Expected: the suite passes with the test reported **skipped** (no `wine` on the bare PATH).

- [ ] **Step 4: Run the real smoke test (the actual proof)**

Run: `cd funklang && npm run compile:smoke`
Expected: first run provisions wineWow + copies the sandbox + inits the prefix (slow, minutes), then PASS — `uncompressed === 13176`, `shrinkled === 4388`. If sizes differ, the toolchain/flags differ from the spike — STOP and report (do not change the assertion).

- [ ] **Step 5: Typecheck + full unit gate (wine-free)**

Run: `cd funklang && npm run typecheck && npx vitest run`
Expected: typecheck clean; all tests pass (smoke test skipped without wine). The pre-existing `tests/dsp/perf.test.ts` may flap on timing under load — not a regression.

- [ ] **Step 6: Commit**

```bash
git add funklang/sizelab/harness/compile.smoke.test.ts funklang/package.json
git commit -m "test(sizelab): real compile smoke test (P01 -> 13176/4388) + compile:smoke script"
```

---

## Self-Review

**Spec coverage:**
- `compilePatch → {ok, uncompressed, shrinkled, error}` → Task 3. ✓
- Proven recipe (gnumake → a.mingw.exe; Shrinkler → exemusic.exe; sizes by statSync) → Task 1 (argv) + Task 3. ✓
- Sandbox: one-time exe_creator copy + win64 prefix, scratch under `sizelab/.scratch` (gitignored) → Task 1 (ignore) + Task 2. ✓
- Caller wraps in one nix-shell; `wine` assumed on PATH; default runner spawns `wine` → Task 3 (`defaultRunner`) + Task 4 (`compile:smoke`). ✓
- Injected runner for wine-free unit tests → Task 3. ✓
- Error handling returns `{ok:false}` (no throw) on gnumake/Shrinkler failure → Task 3. ✓
- Real smoke anchored to spike sizes, guarded on wine → Task 4. ✓
- Isolation (sizelab Node-only; existing guard) — no `src/` import added; nothing to do. ✓
- Out of scope (corpus, fitter, export) — not present. ✓

**Placeholder scan:** none — every step has complete code/commands.

**Type consistency:** `Sandbox`/`ensureSandbox` (Task 2) consumed by `compilePatch` (Task 3). `CompileResult`/`WineRunner`/`CompileOpts` defined once (Task 3), used in Tasks 3/4. `wineEnv`/`GNUMAKE_ARGV`/`SHRINKLER_ARGV` (Task 1) used in Task 3. `VERIFICATION_PATCHES` (existing) used in Task 4. `exportPatch`/`writeArtifacts` (existing exporter) used in Task 3. Field names `uncompressed`/`shrinkled` consistent throughout.

**Note:** the win64 prefix init (`wineboot -i`) and the 70 MB sandbox copy happen on the FIRST real `compilePatch`/smoke run only (idempotent thereafter) — that's why Task 4 Step 4 is slow once, fast after.
