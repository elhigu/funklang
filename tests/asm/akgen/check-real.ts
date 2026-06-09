// CLI: nix-shell -p mono --run 'npx tsx tests/asm/akgen/check-real.ts'
// For every real corpus .akp, run the oracle (asmBinFromPatch). If the oracle
// accepts it, compare emitAkGenerate->assembleM68k bytes vs oracle bytes.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseAkp } from '../../../src/fileio/akp';
import { asmBinFromPatch } from '../../../groundtruth/harness/asm-bin';
import { emitAkGenerate } from '../../../src/asm/akgen';
import { assembleM68k } from '../../../src/asm/vasm';

const REAL = join(import.meta.dirname, '..', '..', '..', 'groundtruth', 'corpus', 'real');

function firstDiff(a: Uint8Array, b: Uint8Array): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return -1;
}

async function main() {
  const files = readdirSync(REAL).filter((f) => f.endsWith('.akp')).sort();
  let accepted = 0, matched = 0;
  const skipped: string[] = [];
  const mismatched: string[] = [];
  for (const f of files) {
    let patch;
    try {
      patch = parseAkp(new Uint8Array(readFileSync(join(REAL, f))));
    } catch (e) {
      skipped.push(`${f} (parse: ${(e as Error).message})`);
      continue;
    }
    let oracle;
    try {
      oracle = await asmBinFromPatch(patch);
    } catch (e) {
      skipped.push(`${f} (exception: ${(e as Error).message})`);
      continue;
    }
    if (!oracle.ok) {
      skipped.push(`${f} (oracle: ${oracle.error})`);
      continue;
    }
    accepted++;
    const myAsm = emitAkGenerate(patch);
    const mine = await assembleM68k(myAsm, { format: 'bin' });
    if (!mine.ok) {
      mismatched.push(`${f} (my asm failed: ${mine.error})`);
      continue;
    }
    const ob = oracle.bytes!, mb = mine.bytes!;
    const d = firstDiff(ob, mb);
    if (d === -1 && ob.length === mb.length) {
      matched++;
      console.log(`MATCH ${f} (${ob.length}B)`);
    } else {
      mismatched.push(`${f} (oracle=${ob.length}B mine=${mb.length}B firstdiff@${d})`);
      console.log(`MISMATCH ${f} oracle=${ob.length}B mine=${mb.length}B firstdiff@${d}`);
    }
  }
  console.log('\n=== SUMMARY ===');
  console.log(`accepted by oracle: ${accepted}/${files.length}`);
  console.log(`byte-identical:     ${matched}/${accepted}`);
  if (skipped.length) console.log('skipped:\n  ' + skipped.join('\n  '));
  if (mismatched.length) console.log('MISMATCHED:\n  ' + mismatched.join('\n  '));
}
main();
