// DSP engine types. See funklang/docs/dsp-reference.md for the ground-truth
// semantics this engine reproduces bit-exact against the C refrender.

import type { Slot } from '../patch/types';

export interface RenderResult {
  /** Pre-truncation v1 per tick, length = sampleLength + 1 (inclusive loop). */
  sample: Int16Array;
  /** One Int16Array per slot, same length as sample; the output written by each slot per tick. */
  slotTaps: Int16Array[];
  /**
   * 8-bit Amiga sample bytes (v1 >> 8, bytes [0,1] zeroed). When the
   * instrument has op22 in slot[15] the bytes also reflect the loop-
   * generator crossfade applied to the tail. This is what clone (op 17)
   * and chordgen (op 18) read when this instrument is a source.
   * Length matches `sample.length`.
   */
  bytes: Int8Array;
}

export interface OpState {
  // per-op state arrays — extend as ops are added.
  // Sized N_SLOTS_MAX; ops keyed by either slot index (j) or slot.instance.
  counter_saw: Int16Array;
  counter_tri: Int16Array;
  counter_sine: Int16Array;
  counter_pulse: Int16Array;
  counter_sh: Int16Array;
  buffer_sh: Int16Array;

  // osc_noise has process-global state in C (static int inside the function).
  // In JS we keep it on the per-render OpState so single-instrument renders
  // start from the canonical initial constants — same as a fresh process.
  noise_x1: number;
  noise_x2: number;
  noise_x3: number;

  // adsr: per-slot envelope segment / accumulator / sustain counter.
  // ADSR_Mode is short[] in C; ADSR_Value and ADSR_SustainCounter are int[].
  ADSR_Mode: Int16Array;
  ADSR_Value: Int32Array;
  ADSR_SustainCounter: Int32Array;

  // sv_flt_n / onepole_flt scratch: 4 shorts per instance (lpf, hpf, bpf, pole).
  // Indexed as filterBuffer[(instance << 2) + k] with k ∈ {0..3}.
  filterBuffer: Int16Array;

  // cmb_flt_n / dly_cyc / reverb delay lines (24 channels × 2048 shorts).
  // Indexed as buffern[instance * 2048 + i]. We use a single flat Int16Array
  // to mirror C's `short buffern[24][2048]` row-major layout.
  // - cmb_flt_n uses rows 0..15 (instance == slot j)
  // - dly_cyc   uses rows 0..15 (instance == slot j)
  // - reverb internally calls cmb_flt_n with instances 16..23 (shares
  //   `buffern` AND the same cmb_flt_n_i[] index array)
  buffern: Int16Array;
  // cmb_flt_n local-static index `i[24]` — NOT cleared by clr_buf in C
  // (process-static), but for per-instrument renders we treat it as
  // per-OpState to match refrender's per-instrument reset behavior.
  cmb_flt_n_i: Int16Array;
  // dly_cyc local-static index `i[16]` — separate from cmb_flt_n's i[].
  dly_cyc_i: Int16Array;

  // adsr needs the enclosing instrument's sampleLength for its sustain-
  // segment comparison. Engine sets this before the per-tick loop.
  sampleLength: number;

  // Pre-rendered source-instrument sample BYTES (8-bit Amiga truncation
  // of v1, after the post-render two-zero patch). Used by clone (op 17)
  // and chordgen (op 18). Keyed by source instrument index. Populated by
  // the engine BEFORE the per-tick loop runs, by recursively rendering
  // each referenced source instrument (Option A in the porting plan).
  cloneBuffers: Map<number, Int8Array>;

  // Imported-sample data, indexed 0..7. Engine copies a reference from
  // the enclosing patch before the per-tick loop so imported_sample (op
  // 20) can read without needing access to the full Patch object.
  importedSamples: ReadonlyArray<{ data: Int8Array } | undefined>;
}

export type OpFn = (
  state: OpState,
  slotIdx: number,            // j — slot index within the instrument
  variables: Int16Array,       // [0]=unused, [1..4]=v1..v4
  slot: Slot,                  // raw slot fields
  tickIdx: number,             // current sample tick t (== `smp` in C)
) => number;                   // returns the Int16 output value (engine clamps)
