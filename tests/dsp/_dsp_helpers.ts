// Helpers shared by per-op tests. Construct a Patch with one instrument,
// serialize to a tmp .akp, run both C refrender and JS engine, return both.

import { createHash } from 'node:crypto';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serializeAkp } from '../../src/fileio/akp';
import { emptyPatch } from '../../src/patch/types';
import type { Patch, Slot } from '../../src/patch/types';
import { renderInstrument } from '../../src/dsp/engine';
import { refrender } from '../_helpers/refrender';

export function sha(buf: ArrayBufferView): string {
  return createHash('sha256').update(
    Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength),
  ).digest('hex');
}

/** Build a single-instrument patch with the given sampleLength and slots. */
export function makePatch(sampleLength: number, slots: Slot[]): Patch {
  const p = emptyPatch();
  const ins = p.instruments[0]!;
  ins.sampleLength = sampleLength;
  ins.slots = slots;
  return p;
}

/** Build a patch with N instruments populated; each entry is { sampleLength, slots }. */
export function makeMultiPatch(
  ...instrs: ReadonlyArray<{ sampleLength: number; slots: Slot[] }>
): Patch {
  const p = emptyPatch();
  for (let i = 0; i < instrs.length; i++) {
    const ins = p.instruments[i]!;
    ins.sampleLength = instrs[i]!.sampleLength;
    ins.slots = instrs[i]!.slots;
  }
  return p;
}

export function runBoth(patch: Patch, idx = 0): { c: Int16Array; js: Int16Array } {
  const dir = mkdtempSync(join(tmpdir(), 'funklang-dsp-'));
  const path = join(dir, 'test.akp');
  writeFileSync(path, serializeAkp(patch));
  const c = refrender(path, idx);
  const js = renderInstrument(patch, idx).sample;
  return { c, js };
}

/** Equality fingerprint: length + sha. Cheap to diff in test output. */
export function fp(a: Int16Array): { len: number; sha: string } {
  return { len: a.length, sha: sha(a) };
}
