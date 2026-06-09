// Patch → m68k .bin via the ASM path: emitDanScript → Aklang2Asm (the author's
// generator, run under mono) → vasm-WASM. Deterministic and much smaller than the
// gcc-C build (hand-optimised asm), so its byte count is the EXACT ship size.
//
// Needs `mono` on PATH (Aklang2Asm is a .NET assembly). vasm runs as WASM (no host
// tool). Run e.g.:
//   nix-shell -p mono --run 'npx tsx groundtruth/harness/asm-bin.ts <patch.akp>'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Patch } from '../../src/patch/types';
import { emitDanScript } from '../../src/codegen/emit-inst';
import { assembleM68k } from '../../src/asm/vasm';

const AKLANG2ASM = join(import.meta.dirname, '..', '..', '..', 'exe_creator', 'aklang2asm.exe');

export interface AsmBinResult {
  ok: boolean;
  /** The generated m68k assembly (Aklang2Asm output). */
  asm?: string;
  /** Assembled relocatable .bin bytes. */
  bytes?: Uint8Array;
  error?: string;
}

/** Patch → Dan-script → Aklang2Asm (mono) → asm → vasm-WASM → .bin. */
export async function asmBinFromPatch(patch: Patch): Promise<AsmBinResult> {
  const dir = mkdtempSync(join(tmpdir(), 'akasm-'));
  const scriptPath = join(dir, 'script.txt');
  const asmPath = join(dir, 'out.asm');
  writeFileSync(scriptPath, emitDanScript(patch));
  try {
    execFileSync('mono', [AKLANG2ASM, scriptPath, asmPath, '-pf'], { stdio: 'pipe' });
  } catch (e) {
    return { ok: false, error: `Aklang2Asm failed: ${(e as Error).message?.slice(0, 200)}` };
  }
  const asm = readFileSync(asmPath, 'utf8');
  const r = await assembleM68k(asm, { format: 'bin' });
  if (!r.ok) return { ok: false, asm, error: r.error ?? 'vasm failed' };
  return { ok: true, asm, bytes: r.bytes! };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) { console.error('usage: asm-bin.ts <patch.akp>'); process.exit(1); }
  const { parseAkp } = await import('../../src/fileio/akp');
  const patch = parseAkp(new Uint8Array(readFileSync(file)));
  const r = await asmBinFromPatch(patch);
  if (!r.ok) { console.error(r.error); process.exit(1); }
  console.log(`${file}: asm .bin = ${r.bytes!.length} bytes (${r.asm!.split('\n').length} asm lines)`);
}
