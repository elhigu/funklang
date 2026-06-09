// Generate DESIGNED combination patches and compile them to .bin.
//
// The real patches are all dense "kitchen-sink" instruments — every one uses
// most ops together, so they're collinear and the fit can't separate one op's
// code cost from another's. These designed patches deliberately VARY which ops
// appear together and how many times each is used, so per-op costs become
// identifiable. Written as real .akp files (serializeAkp) into generated/ so
// they're inspectable and measured exactly like real patches.
//
// Run inside a wineWow shell:
//   nix-shell -p wineWowPackages.stable --run 'npx tsx sizelab/corpus/gen-combos.ts'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { emptyPatch, emptySlot, N_INSTRUMENTS, type Patch } from '../../src/patch/types';
import { serializeAkp, parseAkp } from '../../src/fileio/akp';
import { opInstrument } from './op-instruments';
import { modesFor } from './modes';
import { randomizePatchArgs } from './rand-args';
import { compilePatchBinary } from '../harness/compile';
import { parseCsv, toCsv, type MeasurementRow } from './measurements-csv';
import { patchToMeasured } from './patch-feats';

const REGULAR = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 19, 21];
const GEN = join(import.meta.dirname, 'generated');
const CSV = join(import.meta.dirname, 'measurements.csv');

// Seeded LCG — reproducible designs (no Math.random).
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}
const pickN = <T,>(arr: T[], n: number, rand: () => number): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a.slice(0, n);
};

/** A designed patch: a varied subset of ops, each repeated a few times, one phase per instrument. */
function buildCombo(idx: number, rand: () => number): Patch {
  const p = emptyPatch();
  const nDistinct = 2 + Math.floor(rand() * 10);          // 2..11 distinct ops
  const ops = pickN(REGULAR, nDistinct, rand);
  let instr = 0;
  for (const op of ops) {
    const reps = 1 + Math.floor(rand() * 3);              // 1..3 copies
    const modes = modesFor(op);
    for (let r = 0; r < reps && instr < N_INSTRUMENTS; r++) {
      // ~55% all-const, else a random variable-mode variant.
      const mode = rand() < 0.55 || modes.length === 1 ? modes[0]! : modes[1 + Math.floor(rand() * (modes.length - 1))]!;
      p.instruments[instr] = opInstrument(op, mode, `c${idx}i${instr}`).instrument;
      instr++;
    }
  }
  return p;
}

/** loop_gen (no params) and clone (instr-ref) so those bespoke ops are measured in context. */
function buildBespoke(idx: number, rand: () => number): Patch {
  const p = emptyPatch();
  // instrument 0: a normal source (saw) so clone has something to reference.
  p.instruments[0] = opInstrument(2, modesFor(2)[0]!, `b${idx}src`).instrument;
  let instr = 1;
  const extras = pickN(REGULAR, 1 + Math.floor(rand() * 4), rand);
  for (const op of extras) { if (instr >= N_INSTRUMENTS - 2) break; p.instruments[instr++] = opInstrument(op, modesFor(op)[0]!, `b${idx}i${instr}`).instrument; }
  // a clone of instrument 0
  const clone = emptyInstrumentSlot(17);
  clone.gain = 1; // instr-ref source = instrument #1 (1-based)
  p.instruments[instr] = { name: `b${idx}clone`, sampleLength: 4096, loopOffset: 0, loopLength: 0, slots: [clone] };
  instr++;
  // a loop_gen (no params)
  if (instr < N_INSTRUMENTS) {
    p.instruments[instr] = { name: `b${idx}loop`, sampleLength: 4096, loopOffset: 0, loopLength: 0, slots: [emptyInstrumentSlot(22)] };
  }
  return p;
}
const emptyInstrumentSlot = (fn: number) => ({ ...emptySlot(), fn, outVar: 1 });

async function main(): Promise<void> {
  mkdirSync(GEN, { recursive: true });
  const rand = makeRng(0xC0FFEE);
  const N_COMBO = 46;
  const N_BESPOKE = 6;
  const rows: MeasurementRow[] = [];
  let ok = 0, fail = 0;

  for (let i = 0; i < N_COMBO + N_BESPOKE; i++) {
    const id = String(i).padStart(3, '0');
    const built = i < N_COMBO ? buildCombo(i, rand) : buildBespoke(i, rand);
    randomizePatchArgs(built.instruments, rand); // distinct args per slot → no folding
    // round-trip through .akp so the measured .bin matches the inspectable file
    const file = join(GEN, `combo_${id}.akp`);
    writeFileSync(file, serializeAkp(built));
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

  const existing = parseCsv(readFileSync(CSV, 'utf8')).filter((r) => !r.id.startsWith('combo:'));
  writeFileSync(CSV, toCsv([...existing, ...rows]));
  console.log(`\n${ok} combos compiled, ${fail} failed → appended to measurements.csv`);
}

void main();
