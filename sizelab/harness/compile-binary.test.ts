import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import { compilePatchBinary, type WineRunner } from './compile';

function readySandbox(): { sandboxDir: string; winePrefix: string } {
  const root = mkdtempSync(join(tmpdir(), 'cmpbin-'));
  const sandboxDir = join(root, 'sandbox');
  mkdirSync(join(sandboxDir, 'opt', 'bin'), { recursive: true });
  writeFileSync(join(sandboxDir, 'Makefile-executable'), 'all:\n');
  const winePrefix = join(root, 'prefix');
  mkdirSync(winePrefix, { recursive: true });
  return { sandboxDir, winePrefix };
}

function patch() {
  const p = emptyPatch();
  p.instruments[0]!.sampleLength = 5000;
  p.instruments[0]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1, freqVal: 1000, gainVal: 64 }];
  return p;
}

describe('compilePatchBinary', () => {
  let sb: { sandboxDir: string; winePrefix: string };
  beforeEach(() => { sb = readySandbox(); });

  it('runs Makefile-binary and returns the a.mingw.bin size', async () => {
    const run: WineRunner = async (argv, { cwd }) => {
      expect(argv).toEqual(['gnumake.exe', '-f', 'Makefile-binary']);
      writeFileSync(join(cwd, 'a.mingw.bin'), Buffer.alloc(344));
      return { code: 0, stdout: '', stderr: '' };
    };
    const r = await compilePatchBinary(patch(), { ...sb, run });
    expect(r).toEqual({ ok: true, bytes: 344, binPath: join(sb.sandboxDir, 'a.mingw.bin') });
  });

  it('copies the bin to outPath when given', async () => {
    const out = join(sb.sandboxDir, '..', 'out.bin');
    const run: WineRunner = async (_argv, { cwd }) => {
      writeFileSync(join(cwd, 'a.mingw.bin'), Buffer.alloc(10));
      return { code: 0, stdout: '', stderr: '' };
    };
    const r = await compilePatchBinary(patch(), { ...sb, run, outPath: out });
    expect(r.binPath).toBe(out);
    expect(existsSync(out)).toBe(true);
  });

  it('writes the binary-flavor Iset before building', async () => {
    let sawBinary = false;
    const run: WineRunner = async (_argv, { cwd }) => {
      const fs = await import('node:fs');
      sawBinary = fs.readFileSync(join(cwd, 'Iset.h'), 'latin1').startsWith('#define binary');
      writeFileSync(join(cwd, 'a.mingw.bin'), Buffer.alloc(5));
      return { code: 0, stdout: '', stderr: '' };
    };
    await compilePatchBinary(patch(), { ...sb, run });
    expect(sawBinary).toBe(true);
  });

  it('returns ok:false when no bin is produced', async () => {
    const run: WineRunner = async () => ({ code: 1, stdout: 'out', stderr: 'err' });
    const r = await compilePatchBinary(patch(), { ...sb, run });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/binary.*failed/i);
  });
});
