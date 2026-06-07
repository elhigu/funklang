// funklang/sizelab/harness/export-bin.ts
//
// Build a raw Amiga binary (the relocatable sample-generation blob, no player)
// from a .akp patch. Needs wine on PATH, so run inside a wineWow shell:
//   nix-shell -p wineWowPackages.stable --run 'npm run export:bin -- mypatch.akp [out.bin]'
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseAkp } from '../../src/fileio/akp';
import { compilePatchBinary } from './compile';

async function main(): Promise<void> {
  const inArg = process.argv[2];
  if (!inArg) {
    console.error('usage: export:bin -- <patch.akp> [out.bin]');
    process.exit(2);
    return;
  }
  const inPath = resolve(inArg);
  const outPath = resolve(process.argv[3] ?? inPath.replace(/\.akp$/i, '') + '.bin');
  const patch = parseAkp(new Uint8Array(readFileSync(inPath)));
  const r = await compilePatchBinary(patch, { outPath });
  if (!r.ok) {
    console.error('FAILED:\n' + (r.error ?? ''));
    process.exit(1);
    return;
  }
  console.log(`wrote ${r.bytes} bytes → ${r.binPath}`);
}

void main();
