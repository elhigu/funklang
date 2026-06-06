// funklang/sizelab/tools/gen-verification-patches.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { serializeAkp } from '../../src/fileio/akp';
import { minimalMod } from '../exporter/minimal-mod';
import { VERIFICATION_PATCHES } from './verification-patches';

const OUT = join(import.meta.dirname, '..', 'fixtures');

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'minimal.mod'), minimalMod());
for (const [id, p] of Object.entries(VERIFICATION_PATCHES)) {
  writeFileSync(join(OUT, `${id}.akp`), serializeAkp(p));
}
console.log(`wrote minimal.mod + ${Object.keys(VERIFICATION_PATCHES).length} patches to ${OUT}`);
