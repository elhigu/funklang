// Node-side helper that invokes the C reference render harness and
// returns the resulting Int16 samples. The harness binary lives at
// funklang/tools/refrender/refrender — build it first with
//   nix-shell -p gcc --run 'make -C funklang/tools/refrender'
// (or just `make -C funklang/tools/refrender` when gcc is on PATH).
//
// See funklang/docs/dsp-reference.md for what the harness computes.

import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(HERE, '../../tools/refrender/refrender');

export function refrender(patchPath: string, instrIdx: number): Int16Array {
  const buf = execFileSync(BIN, [patchPath, String(instrIdx)], {
    maxBuffer: 64 * 1024 * 1024,
  });
  // Copy into a fresh ArrayBuffer so the Int16Array doesn't alias the
  // Node Buffer's pool. .slice() ensures we own the memory.
  const i16 = new Int16Array(buf.buffer, buf.byteOffset, buf.length >> 1);
  return i16.slice();
}
