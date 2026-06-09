// funklang/groundtruth/exporter/byte-exact.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { VERIFICATION_PATCHES } from '../tools/verification-patches';
import { exportPatch, type ExportedArtifacts } from './export-patch';

const FIX = join(__dirname, '..', 'fixtures', 'reference');
const IDS = ['P01','P02','P03','P04','P05','P06','P07'];
const TEXT: Array<keyof ExportedArtifacts> = ['ilen.h','inst.h','Iset.h','support/Iswitch.h'];
const BIN: Array<keyof ExportedArtifacts> = ['Isamp.raw','empty.mod'];

describe('exportPatch byte-exact vs GUI references', () => {
  for (const id of IDS) {
    it(`${id} matches GUI output`, () => {
      const got = exportPatch(VERIFICATION_PATCHES[id]!);
      for (const f of TEXT) {
        const ref = readFileSync(join(FIX, id, f), 'latin1');
        expect(got[f], `${id}/${f}`).toBe(ref);
      }
      for (const f of BIN) {
        const ref = new Uint8Array(readFileSync(join(FIX, id, f)));
        expect(Array.from(got[f] as Uint8Array), `${id}/${f}`).toEqual(Array.from(ref));
      }
    });
  }
});
