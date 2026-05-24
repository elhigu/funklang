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
// Persistent (process-global) state in C:
//   - osc_noise statics (g_x1/x2/x3): NEVER reset by clr_buf — sequence
//     continues across all instrument renders.
//   - cmb_flt_n local-static i[24]: NEVER reset by refrender's per-
//     instrument cleanup. Starts at 0 (BSS), persists thereafter.
//   - dly_cyc local-static i[16]: same as cmb_flt_n_i — persists.
//
// To match refrender, when rendering a clone/chordgen source recursively
// these statics must carry over into the parent render. We expose a
// `Persistent` carrier that the engine threads through recursive calls.
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

/** Process-global statics that persist across instrument renders in refrender. */
interface Persistent {
  noise_x1: number;
  noise_x2: number;
  noise_x3: number;
  cmb_flt_n_i: Int16Array;   // shared instance index for cmb_flt_n / reverb
  dly_cyc_i: Int16Array;     // separate instance index for dly_cyc
  /**
   * Shared cache of pre-rendered source bytes — equivalent to refrender's
   * `sampleBytes[N_INSTRUMENTS]` + `renderState[]` arrays. Each entry is
   * a clone-ready Int8Array (already zero-patched at bytes 0/1). When a
   * source is rendered for one parent, the result is reused for any
   * subsequent clone/chordgen reference in this render tree.
   */
  cloneCache: Map<number, Int8Array>;
}

function newPersistent(): Persistent {
  return {
    noise_x1: 0x67452301 | 0,
    noise_x2: 0xefcdab89 | 0,
    noise_x3: 0,
    cmb_flt_n_i: new Int16Array(24),
    dly_cyc_i: new Int16Array(20),
    cloneCache: new Map<number, Int8Array>(),
  };
}

export function renderInstrument(
  patch: Patch,
  instrIdx: number,
  _resolving: Set<number> = new Set(),
  _persistent: Persistent = newPersistent(),
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
  //
  // CRUCIAL: pass _persistent down so noise + cmb/dly indices carry over
  // exactly like refrender's process-static state.
  for (const s of ins.slots) {
    if (s.outVar === 0) continue;
    if (s.fn !== 17 && s.fn !== 18) continue;
    const src = s.gain;
    if (src < 0 || src >= patch.instruments.length) continue;
    if (src === instrIdx) continue;     // refrender skips self-clone
    let bytes = _persistent.cloneCache.get(src);
    if (!bytes) {
      const srcResult = renderInstrument(patch, src, _resolving, _persistent);
      // Truncate v1 → 8-bit (mirrors main-binary.c line 80-81 `v1 >>= 8`,
      // then refrender.c lines 567-568 zero bytes 0 and 1).
      bytes = new Int8Array(srcResult.sample.length);
      for (let i = 0; i < srcResult.sample.length; i++) {
        bytes[i] = (srcResult.sample[i]! >> 8) & 0xff;
      }
      if (bytes.length >= 1) bytes[0] = 0;
      if (bytes.length >= 2) bytes[1] = 0;
      _persistent.cloneCache.set(src, bytes);
    }
    state.cloneBuffers.set(src, bytes);
  }

  // Adopt the persistent statics into this render's OpState (after source
  // pre-renders advanced them). Op functions read & write these in place.
  state.noise_x1 = _persistent.noise_x1;
  state.noise_x2 = _persistent.noise_x2;
  state.noise_x3 = _persistent.noise_x3;
  state.cmb_flt_n_i = _persistent.cmb_flt_n_i;
  state.dly_cyc_i = _persistent.dly_cyc_i;

  // variables[0] unused; [1..4] are v1..v4. Reset ONCE per instrument
  // (matches main-binary.c lines 76-82 — see dsp-reference.md §7 #5).
  const variables = new Int16Array(5);

  // Pre-resolve the active slot list once. The inner per-tick loop runs
  // up to ~60k iterations × N slots, so hoisting the OPS[fn] lookup and
  // the outVar bounds-check out of the hot path matters. Slots that are
  // empty / disabled / fn==22 / unimplemented are dropped entirely.
  // Use parallel arrays (not array-of-objects) so the JIT can keep them
  // in monomorphic shapes for the hot loop.
  const numSlots = ins.slots.length;
  const aFns: Array<import('./types').OpFn> = [];
  const aSlots: Array<import('../patch/types').Slot> = [];
  const aJ: number[] = [];
  const aOutVar: number[] = [];
  const aTap: Int16Array[] = [];
  for (let j = 0; j < numSlots; j++) {
    const s = ins.slots[j]!;
    if (s.outVar === 0 || s.fn === 0 || s.fn === 22) continue;
    const fn = OPS[s.fn];
    if (!fn) continue;
    const outVar = (s.outVar > 0 && s.outVar <= 4) ? s.outVar : 0;
    aFns.push(fn);
    aSlots.push(s);
    aJ.push(j);
    aOutVar.push(outVar);
    aTap.push(slotTaps[j]!);
  }
  const nActive = aFns.length;

  for (let t = 0; t < total; t++) {
    for (let k = 0; k < nActive; k++) {
      const out = aFns[k]!(state, aJ[k]!, variables, aSlots[k]!, t);
      // toI16: (out << 16) >> 16 — inlined.
      const clamped = (out << 16) >> 16;
      const ov = aOutVar[k]!;
      if (ov !== 0) {
        variables[ov] = clamped;
      }
      aTap[k]![t] = clamped;
    }
    sample[t] = variables[1]!;
  }

  // Flush noise scalars back to the persistent carrier so subsequent renders
  // continue the LFSR sequence. (cmb_flt_n_i / dly_cyc_i are shared Int16Arrays
  // — already updated in place.)
  _persistent.noise_x1 = state.noise_x1;
  _persistent.noise_x2 = state.noise_x2;
  _persistent.noise_x3 = state.noise_x3;

  _resolving.delete(instrIdx);
  return { sample, slotTaps };
}
