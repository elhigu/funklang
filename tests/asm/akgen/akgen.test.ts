// CI verification (NO mono required): for each frozen fixture, assert that
// emitAkGenerate(patch) -> assembleM68k(...,'bin') reproduces the ORACLE bytes
// captured by tests/asm/akgen/freeze.ts. Regenerate fixtures with:
//   nix-shell -p mono --run 'npx tsx tests/asm/akgen/freeze.ts'
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixture } from './check';
import { parseAkp } from '../../../src/fileio/akp';
import { emitAkGenerate } from '../../../src/asm/akgen';
import { assembleM68k } from '../../../src/asm/vasm';
import type { Patch } from '../../../src/patch/types';

const DIR = join(__dirname, 'fixtures');
const REAL = join(__dirname, '..', '..', '..', 'groundtruth', 'corpus', 'real');

function frozen(name: string): Uint8Array {
  const j = JSON.parse(readFileSync(join(DIR, `${name}.json`), 'utf8')) as { base64: string };
  return new Uint8Array(Buffer.from(j.base64, 'base64'));
}

function realPatch(file: string): Patch {
  return parseAkp(new Uint8Array(readFileSync(join(REAL, file))));
}

const cases: { name: string; patch: () => Patch }[] = [
  { name: 'empty', patch: () => fixture('empty') },
  { name: 'osc_saw', patch: () => fixture('osc_saw') },
  { name: 'sv_flt_n', patch: () => fixture('sv_flt_n') },
  { name: 'real_ext_patch', patch: () => realPatch('ext_patch.akp') },
];

describe('emitAkGenerate is byte-identical to the oracle (frozen)', () => {
  for (const c of cases) {
    it(`${c.name} assembles to the frozen oracle bytes`, async () => {
      const expected = frozen(c.name);
      const asm = emitAkGenerate(c.patch());
      const res = await assembleM68k(asm, { format: 'bin' });
      expect(res.ok, res.error).toBe(true);
      const got = res.bytes!;
      expect(got.length).toBe(expected.length);
      const diff = got.findIndex((v, i) => v !== expected[i]);
      expect(diff, `first differing byte at offset ${diff}`).toBe(-1);
    });
  }
});
