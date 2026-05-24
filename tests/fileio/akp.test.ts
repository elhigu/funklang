import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseAkp, serializeAkp } from '../../src/fileio/akp';
import { AKP_MAGIC, N_INSTRUMENTS, N_IMPORTS } from '../../src/patch/types';

const ROOT = new URL('../../..', import.meta.url).pathname;
const LOCTRO5 = join(ROOT, 'loctro5 3 chippisamplea.akp');
const PATCHES_DIR = join(ROOT, 'patches');

function diff(a: Uint8Array, b: Uint8Array): string {
  if (a.length !== b.length) {
    return `length mismatch: got ${a.length} expected ${b.length}`;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      const ctxStart = Math.max(0, i - 4);
      const ctxEnd = Math.min(a.length, i + 4);
      const gotCtx = Array.from(a.slice(ctxStart, ctxEnd))
        .map((x) => x.toString(16).padStart(2, '0'))
        .join(' ');
      const expCtx = Array.from(b.slice(ctxStart, ctxEnd))
        .map((x) => x.toString(16).padStart(2, '0'))
        .join(' ');
      return `byte mismatch at offset ${i}: got 0x${a[i]!.toString(16)} expected 0x${b[i]!.toString(
        16,
      )}\n  got [${ctxStart}..${ctxEnd}]:      ${gotCtx}\n  expected [${ctxStart}..${ctxEnd}]: ${expCtx}`;
    }
  }
  return 'identical';
}

describe('parseAkp / serializeAkp', () => {
  it('parses the loctro5 fixture', () => {
    const bytes = new Uint8Array(readFileSync(LOCTRO5));
    const patch = parseAkp(bytes);
    expect(patch.instruments.length).toBe(N_INSTRUMENTS);
    expect(patch.importedSamples.length).toBe(N_IMPORTS);
    expect(patch.instruments[0]!.name.length).toBeGreaterThan(0);
  });

  it('round-trips loctro5 byte-for-byte', () => {
    const bytes = new Uint8Array(readFileSync(LOCTRO5));
    const patch = parseAkp(bytes);
    const out = serializeAkp(patch);
    const d = diff(out, bytes);
    if (d !== 'identical') throw new Error(d);
  });

  it('rejects wrong magic', () => {
    const bytes = new Uint8Array(8);
    // magic = 0
    expect(() => parseAkp(bytes)).toThrow(/magic/i);
  });

  // Generate one test per .akp in patches/
  const patchFiles = readdirSync(PATCHES_DIR).filter((f) => f.toLowerCase().endsWith('.akp'));
  for (const f of patchFiles) {
    it(`round-trips ${f} byte-for-byte`, () => {
      const path = join(PATCHES_DIR, f);
      const bytes = new Uint8Array(readFileSync(path));
      const patch = parseAkp(bytes);
      const out = serializeAkp(patch);
      const d = diff(out, bytes);
      if (d !== 'identical') throw new Error(d);
    });
  }

  it(`AKP_MAGIC sanity: ${AKP_MAGIC.toString(16)}`, () => {
    expect(AKP_MAGIC).toBe(0x02ceda9f);
  });
});
