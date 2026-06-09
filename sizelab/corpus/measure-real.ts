// Measure real patches/*.akp .bin sizes and append them to measurements.csv,
// so the fit is anchored on real multi-instrument structure (not just the
// synthetic single-op corpus). Run under wineWow:
//   nix-shell -p wineWowPackages.stable --run 'tsx sizelab/corpus/measure-real.ts'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parseAkp } from '../../src/fileio/akp';
import { compilePatchBinary } from '../harness/compile';
import { parseCsv, toCsv, type MeasurementRow } from './measurements-csv';
import { patchToMeasured } from './patch-feats';

// real patches: curated fixtures (patches/) + gathered validation set (corpus/real/).
const REAL_DIRS = [join(import.meta.dirname, '..', '..', '..', 'patches'), join(import.meta.dirname, 'real')];
const CSV = join(import.meta.dirname, 'measurements.csv');

async function main(): Promise<void> {
  const existing = parseCsv(readFileSync(CSV, 'utf8')).filter((r) => !r.id.startsWith('real:'));
  const files = REAL_DIRS.flatMap((dir) => readdirSync(dir).filter((f) => f.endsWith('.akp')).map((f) => join(dir, f))).sort();
  const rows: MeasurementRow[] = [];
  for (const path of files) {
    const f = path.split('/').pop()!;
    try {
      const patch = parseAkp(new Uint8Array(readFileSync(path)));
      const measured = patchToMeasured(patch);
      let importBytes = 0;
      for (const s of patch.importedSamples) importBytes += s.data.length;
      const b = await compilePatchBinary(patch);
      if (!b.ok) { console.error(`${f} FAILED: ${b.error?.slice(0, 160)}`); continue; }
      rows.push({ id: `real:${basename(f, '.akp')}`, measured, producerCount: 0, importBytes, uncompressed: 0, shrinkled: 0, binBytes: b.bytes! });
      console.log(`${f}: bin ${b.bytes} B (${measured.length} slots)`);
    } catch (err) {
      console.error(`${f} SKIPPED: ${(err as Error).message?.slice(0, 120)}`);
    }
  }
  writeFileSync(CSV, toCsv([...existing, ...rows]));
  console.log(`appended ${rows.length} real-patch rows → measurements.csv`);
}

void main();
