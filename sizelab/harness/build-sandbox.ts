// funklang/sizelab/harness/build-sandbox.ts
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';

export interface Sandbox { dir: string; winePrefix: string; }

// Scratch lives OUTSIDE the project tree: the wine prefix contains a
// `dosdevices/z: -> /` symlink, and any tool that globs the repo (vitest, vite)
// would follow it into `/` and crash on EACCES. The repo-parent reference area
// is out-of-git and outside every project scanner's root.
const SCRATCH = resolve(import.meta.dirname, '..', '..', '..', '..', 'reference', 'sizelab-scratch');
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

/** Init a fresh win64 wine prefix (real default). Needs `wineboot` on PATH. */
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
