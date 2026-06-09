// CLI: nix-shell -p mono --run 'npx tsx tests/asm/akgen/freeze.ts'
// Captures the ORACLE .bin bytes for the CI fixtures into fixtures/*.json
// (base64). Run once with mono; the committed vitest then verifies
// emitAkGenerate->assembleM68k === these frozen bytes WITHOUT mono.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './check';
import { parseAkp } from '../../../src/fileio/akp';
import { asmBinFromPatch } from '../../../groundtruth/harness/asm-bin';
import { emitAkGenerate } from '../../../src/asm/akgen';
import { assembleM68k } from '../../../src/asm/vasm';
import type { Patch } from '../../../src/patch/types';

const DIR = join(import.meta.dirname, 'fixtures');
const REAL = join(import.meta.dirname, '..', '..', '..', 'groundtruth', 'corpus', 'real');

function realPatch(file: string): Patch {
  return parseAkp(new Uint8Array(readFileSync(join(REAL, file))));
}

// name -> patch. These are the CI fixtures: empty framework, one oscillator,
// one filter, one whole real patch.
const FIXTURES: Record<string, Patch> = {
  empty: fixture('empty'),
  osc_saw: fixture('osc_saw'),
  sv_flt_n: fixture('sv_flt_n'),
  real_ext_patch: realPatch('ext_patch.akp'),
};

async function main() {
  mkdirSync(DIR, { recursive: true });
  for (const [name, patch] of Object.entries(FIXTURES)) {
    const oracle = await asmBinFromPatch(patch);
    if (!oracle.ok) throw new Error(`oracle rejected ${name}: ${oracle.error}`);
    // sanity: our emitter must already match before we freeze.
    const mine = await assembleM68k(emitAkGenerate(patch), { format: 'bin' });
    if (!mine.ok) throw new Error(`mine failed to assemble ${name}: ${mine.error}`);
    const ob = oracle.bytes!, mb = mine.bytes!;
    if (ob.length !== mb.length || ob.some((v, i) => v !== mb[i]))
      throw new Error(`mine != oracle for ${name} (refusing to freeze a mismatch)`);
    const b64 = Buffer.from(ob).toString('base64');
    writeFileSync(join(DIR, `${name}.json`), JSON.stringify({ name, length: ob.length, base64: b64 }, null, 0) + '\n');
    console.log(`froze ${name}: ${ob.length} bytes`);
  }
}
main();
