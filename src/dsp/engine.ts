// JS DSP render engine. Bit-exact against the C refrender harness.
//
// Driver semantics (paraphrase of main-binary.c::synth, verified via
// refrender.c):
//   - For each instrument: v1=v2=v3=v4=0 ONCE (outside the sample loop),
//     then for smp in 0..sampleLength INCLUSIVE, iterate all slots.
//   - Skip a slot if outVar == 0 OR fn == 0 OR fn == 22 (loop config).
//   - Each op returns an Int16 value; we truncate to Int16 on store to
//     variables[outVar] (mirrors `short out` → `v[outVar] = out`).
//   - Final per-tick output is v1 (pre-truncation; we store full Int16).
//
// See funklang/docs/dsp-reference.md §7 for citations.

import type { Patch } from '../patch/types';
import { OPS } from './ops/index';
import { newOpState } from './state';
import { toI16 } from './ops/_helpers';
import type { RenderResult } from './types';

export class CyclicCloneError extends Error {
  constructor(public chain: number[]) {
    super(`cyclic clone through instruments ${chain.join('→')}`);
  }
}

export function renderInstrument(
  patch: Patch,
  instrIdx: number,
  _resolving: Set<number> = new Set(),
): RenderResult {
  if (_resolving.has(instrIdx)) {
    throw new CyclicCloneError([..._resolving, instrIdx]);
  }
  const ins = patch.instruments[instrIdx];
  if (!ins) {
    throw new RangeError(`instrument ${instrIdx} does not exist`);
  }
  _resolving.add(instrIdx);

  // INCLUSIVE loop: main-binary.c uses `smp <= SmpLength`, so we render
  // sampleLength+1 ticks. dsp-reference.md §7 observation #2.
  // Guard for negative sampleLength → at least 1 sample like refrender.c.
  const total = ins.sampleLength < 0 ? 1 : ins.sampleLength + 1;
  const sample = new Int16Array(total);
  const slotTaps = ins.slots.map(() => new Int16Array(total));
  const state = newOpState();
  // adsr op needs sampleLength to compute its sustain-segment threshold;
  // we expose the raw value (not the inclusive-loop adjusted `total`) per
  // refrender.c case 23 which uses `ins->sampleLength`.
  state.sampleLength = ins.sampleLength;
  state.importedSamples = patch.importedSamples;

  // Pre-render source instruments referenced by clone (op 17) or chordgen
  // (op 18). Mirrors refrender.c lines 317-330: render source-before-clone
  // with depth-first cycle detection through `_resolving`. We cache the
  // 8-bit Amiga-truncated sample bytes (`v1 >> 8`) plus the post-render
  // two-zero patch on bytes 0/1 — that's what BaseAdr[src] points at.
  for (const s of ins.slots) {
    if (s.outVar === 0) continue;
    if (s.fn !== 17 && s.fn !== 18) continue;
    const src = s.gain;
    if (src < 0 || src >= patch.instruments.length) continue;
    if (src === instrIdx) continue;     // refrender skips self-clone
    if (state.cloneBuffers.has(src)) continue;
    const srcResult = renderInstrument(patch, src, _resolving);
    // Truncate v1 → 8-bit (mirrors main-binary.c line 80-81 `v1 >>= 8`,
    // then refrender.c lines 567-568 zero bytes 0 and 1).
    const bytes = new Int8Array(srcResult.sample.length);
    for (let i = 0; i < srcResult.sample.length; i++) {
      bytes[i] = (srcResult.sample[i]! >> 8) & 0xff;
    }
    if (bytes.length >= 1) bytes[0] = 0;
    if (bytes.length >= 2) bytes[1] = 0;
    state.cloneBuffers.set(src, bytes);
  }

  // variables[0] unused; [1..4] are v1..v4. Reset ONCE per instrument
  // (matches main-binary.c lines 76-82 — see dsp-reference.md §7 #5).
  const variables = new Int16Array(5);

  for (let t = 0; t < total; t++) {
    for (let j = 0; j < ins.slots.length; j++) {
      const s = ins.slots[j]!;
      // Skip empty / disabled / loop-config slots.
      if (s.outVar === 0 || s.fn === 0 || s.fn === 22) continue;

      const fn = OPS[s.fn];
      if (!fn) continue;       // op not yet implemented; tap stays 0.

      const out = fn(state, j, variables, s, t);
      const clamped = toI16(out);
      if (s.outVar > 0 && s.outVar <= 4) {
        variables[s.outVar] = clamped;
      }
      slotTaps[j]![t] = clamped;
    }
    sample[t] = variables[1]!;
  }

  _resolving.delete(instrIdx);
  return { sample, slotTaps };
}
