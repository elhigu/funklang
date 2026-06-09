// funklang/groundtruth/harness/wine-env.ts
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
