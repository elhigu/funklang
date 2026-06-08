// funklang/sizelab/corpus/run-corpus.ts
//
// Compiles every corpus patch through the harness and writes measurements.csv.
// Run via: npm run corpus:run  (wraps this in `nix-shell -p wineWowPackages.stable`).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCorpus } from './corpus-spec';
import { compilePatch, compilePatchBinary } from '../harness/compile';
import { toCsv, type MeasurementRow } from './measurements-csv';

async function main(): Promise<void> {
  const corpus = buildCorpus();
  const rows: MeasurementRow[] = [];
  let i = 0;
  for (const item of corpus) {
    i += 1;
    const e = await compilePatch(item.patch);          // exe (reference)
    const b = await compilePatchBinary(item.patch);    // bin (estimator target)
    if (!e.ok || !b.ok) {
      console.error(`[${i}/${corpus.length}] ${item.id} FAILED: ${(e.error ?? b.error)?.slice(0, 200)}`);
      continue;
    }
    rows.push({
      id: item.id,
      measured: item.measured,
      producerCount: item.producerCount,
      importBytes: item.importBytes,
      uncompressed: e.uncompressed!,
      shrinkled: e.shrinkled!,
      binBytes: b.bytes!,
    });
    console.log(`[${i}/${corpus.length}] ${item.id}: bin ${b.bytes} (exe ${e.uncompressed}/${e.shrinkled})`);
  }
  const out = join(import.meta.dirname, 'measurements.csv');
  writeFileSync(out, toCsv(rows));
  console.log(`wrote ${rows.length}/${corpus.length} measurements → ${out}`);
}

void main();
