// CLI: npx tsx tests/asm/akgen/check.ts <opName>
// Builds the fixture patch for <opName>, computes oracle bytes (asmBinFromPatch)
// and mine (emitAkGenerate -> assembleM68k), prints PASS or FAIL with the first
// differing byte offset and a short asm diff. Needs mono for the oracle:
//   nix-shell -p mono --run 'npx tsx tests/asm/akgen/check.ts osc_saw'

import { emptyPatch, emptySlot, type Patch } from '../../../src/patch/types';
import { asmBinFromPatch } from '../../../sizelab/harness/asm-bin';
import { emitAkGenerate } from '../../../src/asm/akgen';
import { assembleM68k } from '../../../src/asm/vasm';

function fixture(key: string): Patch {
  const p = emptyPatch();
  const ins = p.instruments[0]!;
  ins.name = 't';
  ins.sampleLength = 4096;

  switch (key) {
    case 'empty':
      // No slots — exercises the empty-instrument framework branch.
      ins.slots = [];
      break;
    case 'osc_saw':
      // Three osc_saw across value classes:
      //  - power-of-2 gain (64 -> asr shift path)
      //  - non-power-of-2 gain (50 -> muls path)
      //  - special-case gain 128 (-> straight move)
      ins.slots = [
        { ...emptySlot(), fn: 2, outVar: 1, freqVal: 1000, gainVal: 64 },
        { ...emptySlot(), fn: 2, outVar: 2, freqVal: 1234, gainVal: 50 },
        { ...emptySlot(), fn: 2, outVar: 3, freqVal: 777, gainVal: 128 },
        // variable gain operand (gain selector -> v1 ... uses muls/var path)
        { ...emptySlot(), fn: 2, outVar: 4, freqVal: 555, gain: 1 },
      ];
      break;
    case 'osc_tri':
      // Four osc_tri across value classes (Osc_Tri 539-580):
      //  - power-of-2 gain (64 -> asr shift path)
      //  - non-power-of-2 gain (50 -> muls path)
      //  - gain 128 (-> text != "#128" guard skips scaling)
      //  - variable gain operand (-> non-# path with d4/TR1)
      ins.slots = [
        { ...emptySlot(), fn: 3, outVar: 1, freqVal: 1000, gainVal: 64 },
        { ...emptySlot(), fn: 3, outVar: 2, freqVal: 1234, gainVal: 50 },
        { ...emptySlot(), fn: 3, outVar: 3, freqVal: 777, gainVal: 128 },
        { ...emptySlot(), fn: 3, outVar: 4, freqVal: 555, gain: 1 },
      ];
      break;
    default:
      throw new Error(`unknown fixture '${key}'`);
  }
  return p;
}

function firstDiff(a: Uint8Array, b: Uint8Array): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return i;
  }
  return -1;
}

function asmDiff(oracle: string, mine: string): string {
  const ol = oracle.split('\n');
  const ml = mine.split('\n');
  const n = Math.max(ol.length, ml.length);
  const out: string[] = [];
  let shown = 0;
  for (let i = 0; i < n && shown < 30; i++) {
    if (ol[i] !== ml[i]) {
      out.push(`  L${i + 1} oracle: ${JSON.stringify(ol[i] ?? '<eof>')}`);
      out.push(`  L${i + 1} mine:   ${JSON.stringify(ml[i] ?? '<eof>')}`);
      shown++;
    }
  }
  return out.length ? out.join('\n') : '  (asm text identical)';
}

async function main() {
  const key = process.argv[2];
  if (!key) {
    console.error('usage: check.ts <empty|osc_saw>');
    process.exit(1);
  }
  const patch = fixture(key);

  const oracle = await asmBinFromPatch(patch);
  if (!oracle.ok) {
    console.log(`FAIL (${key}): oracle error: ${oracle.error}`);
    process.exit(1);
  }

  const myAsm = emitAkGenerate(patch);
  const mine = await assembleM68k(myAsm, { format: 'bin' });
  if (!mine.ok) {
    console.log(`FAIL (${key}): my asm failed to assemble: ${mine.error}`);
    console.log(asmDiff(oracle.asm!, myAsm));
    process.exit(1);
  }

  const ob = oracle.bytes!;
  const mb = mine.bytes!;
  const diff = firstDiff(ob, mb);
  if (diff === -1 && ob.length === mb.length) {
    console.log(`PASS (${key}): ${ob.length} bytes byte-identical`);
    return;
  }
  console.log(
    `FAIL (${key}): oracle=${ob.length}B mine=${mb.length}B first diff at byte ${diff}`,
  );
  console.log('asm diff:');
  console.log(asmDiff(oracle.asm!, myAsm));
  process.exit(1);
}

main();
