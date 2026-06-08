// Measure real patches/*.akp .bin sizes and append them to measurements.csv,
// so the fit is anchored on real multi-instrument structure (not just the
// synthetic single-op corpus). Run under wineWow:
//   nix-shell -p wineWowPackages.stable --run 'tsx sizelab/corpus/measure-real.ts'
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { parseAkp } from '../../src/fileio/akp';
import { compilePatchBinary } from '../harness/compile';
import { parseCsv, toCsv, type MeasurementRow } from './measurements-csv';
import type { PhaseDesc } from './corpus-spec';

const PATCHES = join(import.meta.dirname, '..', '..', '..', 'patches');
const CSV = join(import.meta.dirname, 'measurements.csv');

async function main(): Promise<void> {
  const existing = parseCsv(readFileSync(CSV, 'utf8')).filter((r) => !r.id.startsWith('real:'));
  const files = readdirSync(PATCHES).filter((f) => f.endsWith('.akp')).sort();
  const rows: MeasurementRow[] = [];
  for (const f of files) {
    const patch = parseAkp(new Uint8Array(readFileSync(join(PATCHES, f))));
    const measured: PhaseDesc[] = [];
    for (const ins of patch.instruments) for (const s of ins.slots) if (s.fn !== 0) measured.push({ op: s.fn, mode: '?' });
    let importBytes = 0;
    for (const s of patch.importedSamples) importBytes += s.data.length;
    const b = await compilePatchBinary(patch);
    if (!b.ok) { console.error(`${f} FAILED: ${b.error?.slice(0, 160)}`); continue; }
    rows.push({ id: `real:${basename(f, '.akp')}`, measured, producerCount: 0, importBytes, uncompressed: 0, shrinkled: 0, binBytes: b.bytes! });
    console.log(`${f}: bin ${b.bytes} B (${measured.length} slots)`);
  }
  writeFileSync(CSV, toCsv([...existing, ...rows]));
  console.log(`appended ${rows.length} real-patch rows → measurements.csv`);
}

void main();
