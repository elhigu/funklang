// Generate LARGE designed patches (60–210 op slots) with heavy repetition, to
// train the size model in the regime real demos actually occupy. The small
// combos (gen-combos.ts) top out ~45 slots, so the fit had to extrapolate to
// 200-slot patches and failed. These deliberately repeat a few op types many
// times (slot-folding regime) and vary the mix.
//
//   nix-shell -p wineWowPackages.stable --run 'npx tsx sizelab/corpus/gen-large.ts'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { emptyPatch, emptySlot, N_INSTRUMENTS, type Patch, type Slot } from '../../src/patch/types';
import { serializeAkp, parseAkp } from '../../src/fileio/akp';
import { opInstrument } from './op-instruments';
import { modesFor } from './modes';
import { varSourceParams } from './modes';
import { randomizePatchArgs } from './rand-args';
import { compilePatchBinary } from '../harness/compile';
import { parseCsv, toCsv, type MeasurementRow } from './measurements-csv';
import { patchToMeasured } from './patch-feats';

const REGULAR = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 19, 21];
// ops that need no variable input (can be packed as bare const slots)
const STANDALONE = REGULAR.filter((op) => varSourceParams(op).length === 0);
const GEN = join(import.meta.dirname, 'generated');
const CSV = join(import.meta.dirname, 'measurements.csv');

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}
const pickN = <T,>(arr: T[], n: number, rand: () => number): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a.slice(0, n);
};

/** Large patch: a few op types repeated heavily; standalone ops packed densely
 *  into instruments, var-input ops each get their own instrument via opInstrument. */
function buildLarge(idx: number, rand: () => number): Patch {
  const p = emptyPatch();
  const target = 60 + Math.floor(rand() * 150);                 // 60..210 slots
  // weighting: a couple of ops dominate, others sprinkled
  const heavy = pickN(STANDALONE, 1 + Math.floor(rand() * 3), rand);
  const light = pickN(REGULAR, 2 + Math.floor(rand() * 11), rand); // up to ~12 distinct light ops
  let total = 0;
  let instr = 0;

  // 1) light ops: one phase per instrument (valid producers/inputs), a few each
  for (const op of light) {
    const reps = 1 + Math.floor(rand() * 2);
    const modes = modesFor(op);
    for (let r = 0; r < reps && instr < N_INSTRUMENTS - 4; r++) {
      const ins = opInstrument(op, modes[0]!, `L${idx}i${instr}`).instrument;
      p.instruments[instr++] = ins;
      total += ins.slots.filter((s) => s.fn !== 0).length;
    }
  }
  // 2) heavy ops: pack bare const slots into the remaining instruments to hit target
  while (total < target && instr < N_INSTRUMENTS) {
    const perInstr = 8 + Math.floor(rand() * 16);              // 8..23 slots/instr
    const slots: Slot[] = [];
    for (let k = 0; k < perInstr && total < target; k++) {
      const op = heavy[Math.floor(rand() * heavy.length)]!;
      slots.push({ ...emptySlot(), fn: op, outVar: 1 });
      total++;
    }
    p.instruments[instr++] = { name: `L${idx}h${instr}`, sampleLength: 4096, loopOffset: 0, loopLength: 0, slots };
  }
  randomizePatchArgs(p.instruments, rand); // distinct args per slot → no folding
  return p;
}

async function main(): Promise<void> {
  mkdirSync(GEN, { recursive: true });
  const rand = makeRng(0xBEEF42);
  const N = 25;
  const rows: MeasurementRow[] = [];
  let ok = 0, fail = 0;
  for (let i = 0; i < N; i++) {
    const id = String(100 + i);
    const file = join(GEN, `combo_${id}.akp`);
    writeFileSync(file, serializeAkp(buildLarge(i, rand)));
    try {
      const patch = parseAkp(new Uint8Array(readFileSync(file)));
      const nslots = patch.instruments.reduce((n, ins) => n + ins.slots.filter((s) => s.fn !== 0).length, 0);
      const b = await compilePatchBinary(patch);
      if (!b.ok) { console.error(`combo_${id} FAILED: ${b.error?.slice(0, 120)}`); fail++; continue; }
      rows.push({ id: `combo:${id}`, measured: patchToMeasured(patch), producerCount: 0, importBytes: 0, uncompressed: 0, shrinkled: 0, binBytes: b.bytes! });
      console.log(`combo_${id}: bin ${b.bytes} B (${nslots} slots)`);
      ok++;
    } catch (err) {
      console.error(`combo_${id} SKIPPED: ${(err as Error).message?.slice(0, 120)}`); fail++;
    }
  }
  const keep = parseCsv(readFileSync(CSV, 'utf8')).filter((r) => !rows.some((n) => n.id === r.id));
  writeFileSync(CSV, toCsv([...keep, ...rows]));
  console.log(`\n${ok} large combos compiled, ${fail} failed → measurements.csv`);
}

void main();
