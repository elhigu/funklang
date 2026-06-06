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
