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
    case 'vol':
      // Volume 465-498. inputs = [val1(source var), gain(GN)].
      //  - power-of-2 gain (64 -> asr/GS path), out!=src (move emitted)
      //  - non-power-of-2 gain (50 -> muls/TR1=#50 path), out!=src
      //  - gain 128 (-> scaling skipped; only the move)
      //  - variable gain operand (-> non-# path: move/and @GN,@TR1; TR1=d4)
      //  - out == src (val1==outVar) -> the @OR==@VAL no-move branch
      ins.slots = [
        { ...emptySlot(), fn: 1, outVar: 1, val1: 2, gainVal: 64 },
        { ...emptySlot(), fn: 1, outVar: 2, val1: 3, gainVal: 50 },
        { ...emptySlot(), fn: 1, outVar: 3, val1: 4, gainVal: 128 },
        { ...emptySlot(), fn: 1, outVar: 4, val1: 1, gain: 1 },
        { ...emptySlot(), fn: 1, outVar: 1, val1: 1, gainVal: 50 },
      ];
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
    case 'osc_sine':
      // Osc_Sine 647-693. inputs = [instance, freq, gain(GN)].
      //  - power-of-2 gain (64 -> asr/GS path)
      //  - non-power-of-2 gain (50 -> muls/TR1=#50 path)
      //  - gain 128 (-> text != "#128" guard skips scaling)
      //  - variable gain operand (-> non-# path: move/and @GN,@TR1; TR1=d4)
      ins.slots = [
        { ...emptySlot(), fn: 4, outVar: 1, freqVal: 1000, gainVal: 64 },
        { ...emptySlot(), fn: 4, outVar: 2, freqVal: 1234, gainVal: 50 },
        { ...emptySlot(), fn: 4, outVar: 3, freqVal: 777, gainVal: 128 },
        { ...emptySlot(), fn: 4, outVar: 4, freqVal: 555, gain: 1 },
      ];
      break;
    case 'osc_pulse':
      // Osc_Pulse 581-645. inputs = [instance, freq, gain(GN), width(DC)].
      // Cover gain classes x width classes:
      ins.slots = [
        // gain power-of-2 (64 -> asr/GS path); width const != 63 (cmp.w path)
        { ...emptySlot(), fn: 5, outVar: 1, freqVal: 1000, gainVal: 64, widthVal: 40 },
        // gain non-power-of-2 (50 -> muls/TR2 path); width const == 63 (no cmp emitted)
        { ...emptySlot(), fn: 5, outVar: 2, freqVal: 1234, gainVal: 50, widthVal: 63 },
        // gain 128 (-> scaling skipped); width variable, differs from gain (move @DC,@TR1)
        { ...emptySlot(), fn: 5, outVar: 3, freqVal: 777, gainVal: 128, width: 2 },
        // variable gain (no '#' -> TR2=d5 path); variable width EQUAL to gain (move @TR2,@TR1)
        { ...emptySlot(), fn: 5, outVar: 4, freqVal: 555, gain: 1, width: 1 },
      ];
      break;
    case 'osc_noise':
      // Osc_Noise 694-730. dan-script is osc_noise(smp, <gain>); the oracle's
      // inputs[0] is the `smp` token -> RemapVar -> 'd7'. The method ignores
      // the gain arg entirely, so every slot drives the SAME reachable path:
      // 'd7' has no '#', is != '#128' and not in mulRightShifts -> the
      // move/and @GN,@TR1(d4) + muls d4 / asr.l #7 branch.
      // We still vary gainVal across const/power-of-2/non-power-of-2 to prove
      // the gain has no effect on emitted bytes, plus a variable gain operand.
      ins.slots = [
        { ...emptySlot(), fn: 6, outVar: 1, gainVal: 64 },
        { ...emptySlot(), fn: 6, outVar: 2, gainVal: 50 },
        { ...emptySlot(), fn: 6, outVar: 3, gainVal: 128 },
        { ...emptySlot(), fn: 6, outVar: 4, gain: 1 },
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
