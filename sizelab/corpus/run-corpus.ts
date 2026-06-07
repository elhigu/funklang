// funklang/sizelab/corpus/run-corpus.ts
//
// Compiles every corpus patch through the harness and writes measurements.csv.
// Run via: npm run corpus:run  (wraps this in `nix-shell -p wineWowPackages.stable`).
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCorpus } from './corpus-spec';
import { compilePatch } from '../harness/compile';
import { toCsv, type MeasurementRow } from './measurements-csv';

async function main(): Promise<void> {
  const corpus = buildCorpus();
  const rows: MeasurementRow[] = [];
  let i = 0;
  for (const item of corpus) {
    i += 1;
    const r = await compilePatch(item.patch);
    if (!r.ok) {
      console.error(`[${i}/${corpus.length}] ${item.id} FAILED: ${r.error?.slice(0, 200)}`);
      continue;
    }
    rows.push({
      id: item.id,
      measured: item.measured,
      producerCount: item.producerCount,
      importBytes: item.importBytes,
      uncompressed: r.uncompressed!,
      shrinkled: r.shrinkled!,
    });
    console.log(`[${i}/${corpus.length}] ${item.id}: ${r.uncompressed} / ${r.shrinkled}`);
  }
  const out = join(import.meta.dirname, 'measurements.csv');
  writeFileSync(out, toCsv(rows));
  console.log(`wrote ${rows.length}/${corpus.length} measurements → ${out}`);
}

void main();
