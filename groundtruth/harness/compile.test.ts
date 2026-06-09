// funklang/groundtruth/harness/compile.test.ts
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
      return { code: 0, stdout: '', stderr: '' };
    };
    const r = await compilePatch(patch(), { ...sb, run });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Shrinkler failed/);
  });
});
