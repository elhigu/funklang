// Per-op routine + connection probes (the user's "drop the last one" method, done
// systematically). For each op compile 1, 2 and 3 isolated copies (randomized
// args so they don't fold):
//   connection[op] = (bin3 - bin1) / 2      (cost of each ADDITIONAL use)
//   routine[op]    = bin1 - floor - connection[op]   (the op's shared routine, once)
// Writes probe:op<code>_<n> rows. Run inside wineWow:
//   nix-shell -p wineWowPackages.stable --run 'npx tsx sizelab/corpus/gen-routine-probes.ts'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { emptyPatch, emptySlot, type Patch } from '../../src/patch/types';
import { serializeAkp, parseAkp } from '../../src/fileio/akp';
import { opInstrument } from './op-instruments';
import { modesFor } from './modes';
import { randomizePatchArgs } from './rand-args';
import { compilePatchBinary } from '../harness/compile';
import { parseCsv, toCsv, type MeasurementRow } from './measurements-csv';
import { patchToMeasured } from './patch-feats';

const OPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 19, 21, 17, 22]; // regular + clone + loop_gen
const GEN = join(import.meta.dirname, 'generated');
const CSV = join(import.meta.dirname, 'measurements.csv');

function makeRng(seed: number): () => number { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; }; }

/** `copies` isolated instances of one op (each its own instrument). */
function probe(op: number, copies: number, rand: () => number): Patch {
  const p = emptyPatch();
  if (op === 17) p.instruments[0] = opInstrument(2, modesFor(2)[0]!, 'src').instrument; // clone needs a source
  let instr = op === 17 ? 1 : 0;
  for (let c = 0; c < copies; c++) {
    if (op === 17) p.instruments[instr] = { name: `cl${c}`, sampleLength: 4096, loopOffset: 0, loopLength: 0, slots: [{ ...emptySlot(), fn: 17, outVar: 1, gain: 1 }] };
    else if (op === 22) p.instruments[instr] = { name: `lp${c}`, sampleLength: 4096, loopOffset: 0, loopLength: 0, slots: [{ ...emptySlot(), fn: 22, outVar: 1 }] };
    else p.instruments[instr] = opInstrument(op, modesFor(op)[0]!, `p${op}c${c}`).instrument;
    instr++;
  }
  randomizePatchArgs(p.instruments, rand);
  return p;
}

async function main(): Promise<void> {
  mkdirSync(GEN, { recursive: true });
  const rand = makeRng(0x5EED01);
  const rows: MeasurementRow[] = [];
  for (const op of OPS) {
    for (const copies of [1, 2, 3]) {
      const id = `probe:op${op}_${copies}`;
      const file = join(GEN, `probe_op${op}_${copies}.akp`);
      writeFileSync(file, serializeAkp(probe(op, copies, rand)));
      try {
        const patch = parseAkp(new Uint8Array(readFileSync(file)));
        const b = await compilePatchBinary(patch);
        if (!b.ok) { console.error(`${id} FAILED: ${b.error?.slice(0, 100)}`); continue; }
        rows.push({ id, measured: patchToMeasured(patch), producerCount: 0, importBytes: 0, uncompressed: 0, shrinkled: 0, binBytes: b.bytes! });
        console.log(`${id}: ${b.bytes} B`);
      } catch (err) { console.error(`${id} SKIPPED: ${(err as Error).message?.slice(0, 100)}`); }
    }
  }
  const keep = parseCsv(readFileSync(CSV, 'utf8')).filter((r) => !r.id.startsWith('probe:'));
  writeFileSync(CSV, toCsv([...keep, ...rows]));
  console.log(`\n${rows.length} probe rows → measurements.csv`);
}
void main();
