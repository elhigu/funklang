import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseAkp } from '../../src/fileio/akp';
import { renderInstrument } from '../../src/dsp/engine';
import { refrender } from '../_helpers/refrender';

const ROOT = resolve(fileURLToPath(import.meta.url), '../../../..');
const sha = (b: ArrayBufferView) =>
  createHash('sha256').update(Buffer.from(b.buffer, b.byteOffset, b.byteLength)).digest('hex');

const fixtures: string[] = [];
const patchDir = join(ROOT, 'patches');
for (const f of readdirSync(patchDir)) if (f.endsWith('.akp')) fixtures.push(join(patchDir, f));
fixtures.push(join(ROOT, 'loctro5 3 chippisamplea.akp'));

describe('bit-exact: every patch × every non-empty instrument matches C', () => {
  for (const path of fixtures) {
    const name = path.split('/').pop()!;
    const patch = parseAkp(new Uint8Array(readFileSync(path)));
    for (let i = 0; i < patch.instruments.length; i++) {
      const ins = patch.instruments[i]!;
      if (ins.slots.length === 0 || ins.sampleLength === 0) continue;
      it(`${name} · instr ${i} (${ins.name || '<unnamed>'})`, () => {
        const js = renderInstrument(patch, i).sample;
        const c = refrender(path, i);
        expect({ len: js.length, sha: sha(js) }).toEqual({ len: c.length, sha: sha(c) });
      });
    }
  }
});
