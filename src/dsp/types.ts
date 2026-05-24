// DSP engine types. See funklang/docs/dsp-reference.md for the ground-truth
// semantics this engine reproduces bit-exact against the C refrender.

import type { Slot } from '../patch/types';

export interface RenderResult {
  /** Pre-truncation v1 per tick, length = sampleLength + 1 (inclusive loop). */
  sample: Int16Array;
  /** One Int16Array per slot, same length as sample; the output written by each slot per tick. */
  slotTaps: Int16Array[];
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
}

export type OpFn = (
  state: OpState,
  slotIdx: number,            // j — slot index within the instrument
  variables: Int16Array,       // [0]=unused, [1..4]=v1..v4
  slot: Slot,                  // raw slot fields
  tickIdx: number,             // current sample tick t (== `smp` in C)
) => number;                   // returns the Int16 output value (engine clamps)
