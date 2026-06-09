import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import { exportPatch } from './export-patch';
import { writeArtifacts } from './write-artifacts';

function patch() {
  const p = emptyPatch();
  p.instruments[0]!.name = 'lead';
  p.instruments[0]!.sampleLength = 5000;
  p.instruments[0]!.slots = Array.from({ length: 16 }, () => ({ ...emptySlot() }));
  p.instruments[0]!.slots[0] = { ...emptySlot(), fn: 2, outVar: 1, freqVal: 1000, gainVal: 64 };
  return p;
}

describe('exportPatch', () => {
  it('returns all six artifacts with expected types', () => {
    const a = exportPatch(patch());
    expect(typeof a['ilen.h']).toBe('string');
    expect(typeof a['inst.h']).toBe('string');
    expect(typeof a['Iset.h']).toBe('string');
    expect(a['support/Iswitch.h']).toBe('#define executable\r\n');
    expect(a['Isamp.raw']).toBeInstanceOf(Uint8Array);
    expect(a['empty.mod']).toBeInstanceOf(Uint8Array);
    expect(a['empty.mod'].length).toBe(2108);
    expect(a['inst.h']).toContain('v1 = osc_saw(0, 1000, 64);\r\n');
  });

  it('writeArtifacts writes every file (incl. the support/ subdir)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'groundtruth-'));
    writeArtifacts(exportPatch(patch()), dir);
    for (const f of ['ilen.h', 'inst.h', 'Iset.h', 'support/Iswitch.h', 'Isamp.raw', 'empty.mod']) {
      expect(existsSync(join(dir, f)), f).toBe(true);
    }
    expect(readFileSync(join(dir, 'Iset.h'), 'utf8')).toContain('#define numinstruments 1');
  });
});
