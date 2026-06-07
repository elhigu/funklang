// funklang/sizelab/harness/compile.ts
import { statSync, existsSync, rmSync, cpSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import type { Patch } from '../../src/patch/types';
import { exportPatch, exportPatchBinary } from '../exporter/export-patch';
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
  const { dir, winePrefix } = ensureSandbox({
    ...(opts.sandboxDir !== undefined && { sandboxDir: opts.sandboxDir }),
    ...(opts.winePrefix !== undefined && { winePrefix: opts.winePrefix }),
  });
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

// ── Binary target (Makefile-binary → a.mingw.bin) ──────────────────────────

export interface CompileBinaryResult {
  ok: boolean;
  bytes?: number;    // a.mingw.bin size — the relocatable generation blob
  binPath?: string;  // where the .bin ended up (sandbox, or opts.outPath if given)
  error?: string;
}

export interface CompileBinaryOpts extends CompileOpts {
  /** If set, the produced .bin is copied here (e.g. an exemusic.bin path). */
  outPath?: string;
}

const GNUMAKE_BIN_ARGV = ['gnumake.exe', '-f', 'Makefile-binary'];
const STALE_BIN = ['a.mingw.bin', 'a.mingw.elf', 'a.mingw.s', 'a.mingw.map', 'exemusic.bin',
  'ilen.h', 'inst.h', 'Iset.h', 'Isamp.raw'];

/** Compile a patch to a raw relocatable Amiga binary (no player/mod) and
 *  return its size. Mirrors the GUI's "Export Amiga Binary" pipeline. */
export async function compilePatchBinary(patch: Patch, opts: CompileBinaryOpts = {}): Promise<CompileBinaryResult> {
  const run = opts.run ?? defaultRunner;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const { dir, winePrefix } = ensureSandbox({
    ...(opts.sandboxDir !== undefined && { sandboxDir: opts.sandboxDir }),
    ...(opts.winePrefix !== undefined && { winePrefix: opts.winePrefix }),
  });
  const env = wineEnv(winePrefix, dir);

  rmSync(join(dir, 'obj'), { recursive: true, force: true });
  for (const f of STALE_BIN) rmSync(join(dir, f), { force: true });

  writeArtifacts(exportPatchBinary(patch), dir);

  const make = await run([...GNUMAKE_BIN_ARGV], { cwd: dir, env, timeoutMs });
  const sandboxBin = join(dir, 'a.mingw.bin');
  if (!existsSync(sandboxBin)) {
    return { ok: false, error: `gnumake (binary) failed (code ${make.code}):\n${tail(make.stdout + make.stderr)}` };
  }
  let binPath = sandboxBin;
  if (opts.outPath) { cpSync(sandboxBin, opts.outPath); binPath = opts.outPath; }
  return { ok: true, bytes: statSync(sandboxBin).size, binPath };
}
