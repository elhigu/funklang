// Ablation: compile a patch, then remove each op slot one at a time, recompile,
// and report the .bin delta — the TRUE marginal code of that phase in context.
// Removing the LAST use of an op drops its whole routine + connection; removing a
// repeated use drops only the connection. This verifies the size model and the
// routine-vs-connection split, exactly as the user suggested.
//
//   nix-shell -p wineWowPackages.stable --run 'npx tsx sizelab/corpus/ablate.ts <path-to.akp>'
import { readFileSync } from 'node:fs';
import { parseAkp } from '../../src/fileio/akp';
import { opByCode } from '../../src/schema/op-metadata';
import { compilePatchBinary } from '../harness/compile';
import type { Patch } from '../../src/patch/types';

function clone(p: Patch): Patch { return JSON.parse(JSON.stringify(p, (_k, v) => (v instanceof Int8Array ? Array.from(v) : v))); }

async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path) { console.error('usage: ablate.ts <patch.akp>'); process.exit(1); }
  const base = parseAkp(new Uint8Array(readFileSync(path)));
  const full = await compilePatchBinary(base);
  if (!full.ok) { console.error('baseline FAILED:', full.error?.slice(0, 200)); return; }
  console.log(`baseline: ${full.bytes} B\n`);

  // count uses of each op so we can mark "last use"
  const useCount = new Map<number, number>();
  for (const ins of base.instruments) for (const s of ins.slots) if (s.fn) useCount.set(s.fn, (useCount.get(s.fn) ?? 0) + 1);
  const seenSoFar = new Map<number, number>();
  const byOp = new Map<number, { drops: number[]; lastDrop: number | null }>();

  let n = 0;
  for (let ii = 0; ii < base.instruments.length; ii++) {
    for (let si = 0; si < base.instruments[ii]!.slots.length; si++) {
      const fn = base.instruments[ii]!.slots[si]!.fn;
      if (!fn) continue;
      const ablated = clone(base);
      ablated.instruments[ii]!.slots.splice(si, 1);
      const r = await compilePatchBinary(ablated);
      const seen = (seenSoFar.get(fn) ?? 0) + 1; seenSoFar.set(fn, seen);
      const isLast = seen === useCount.get(fn);
      if (!r.ok) { console.log(`  ${opByCode(fn)?.name ?? fn} #${seen}: recompile failed (skip)`); continue; }
      const drop = full.bytes! - r.bytes!;
      const rec = byOp.get(fn) ?? { drops: [], lastDrop: null };
      if (isLast) rec.lastDrop = drop; else rec.drops.push(drop);
      byOp.set(fn, rec);
      n++;
      process.stdout.write(`  ${(opByCode(fn)?.name ?? String(fn)).padEnd(12)} #${seen}${isLast ? '(last)' : '      '} drop ${drop} B\n`);
    }
  }

  console.log(`\n=== per-op summary (${n} ablations) ===`);
  console.log('op            uses  routine(last-use drop)  connection(avg repeated drop)');
  for (const [fn, rec] of [...byOp.entries()].sort((a, b) => (b[1].lastDrop ?? 0) - (a[1].lastDrop ?? 0))) {
    const conn = rec.drops.length ? Math.round(rec.drops.reduce((s, x) => s + x, 0) / rec.drops.length) : null;
    console.log(`  ${(opByCode(fn)?.name ?? String(fn)).padEnd(12)} ${String(useCount.get(fn)).padStart(3)}    ${String(rec.lastDrop ?? '—').padStart(8)}                 ${conn ?? '—'}`);
  }
}
void main();
