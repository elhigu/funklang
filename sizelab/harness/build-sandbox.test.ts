// funklang/sizelab/harness/build-sandbox.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
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
