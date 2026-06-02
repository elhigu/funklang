// Pure sample-selection for audition playback + waveform display. Given a
// render result and an output target, pick the Int16 buffer to feed the
// Web Audio player (or draw). No DOM, no model, no player — extracted from
// app.ts so the trickiest "which buffer plays?" logic is unit-testable.

import { bytesToInt16, bytesToInt16WithLoop } from './waveform';
import { isPostRenderOp } from '../schema/op-metadata';
import type { Instrument } from '../patch/types';
import type { RenderResult } from '../dsp/types';

/**
 * How many times the loop region is appended after the one-shot tail when
 * auditioning a loop_gen instrument, so the user hears the loop behaviour
 * the Amiga would produce rather than a single pass.
 */
export const FINAL_LOOP_REPEATS = 1;

/** Does this instrument carry a post-render (loop_gen) op? */
export function instrumentHasPostRender(ins: Instrument): boolean {
  return ins.slots.some((s) => isPostRenderOp(s.fn));
}

/**
 * The final audible buffer for an instrument: the one-shot bytes, with the
 * loop region appended `FINAL_LOOP_REPEATS` times when loop_gen is present
 * and a loop length is set.
 */
export function buildFinalAudible(ins: Instrument, render: RenderResult): Int16Array {
  if (instrumentHasPostRender(ins) && ins.loopLength > 0) {
    return bytesToInt16WithLoop(render.bytes, ins.loopOffset, ins.loopLength, FINAL_LOOP_REPEATS);
  }
  return bytesToInt16(render.bytes);
}

/**
 * A specific slot's display / audition tap. loop_gen produces no per-tick
 * output, so its tap shows the post-loopgen bytes (the crossfaded loop);
 * every other slot uses its own per-tick tap.
 */
export function slotDisplayTap(ins: Instrument, render: RenderResult, slotIdx: number): Int16Array {
  const slot = ins.slots[slotIdx];
  if (slot && isPostRenderOp(slot.fn) && render.bytes.length > 0) {
    return bytesToInt16(render.bytes);
  }
  return render.slotTaps[slotIdx] ?? new Int16Array(0);
}

/**
 * Choose the buffer to play for an output target:
 *   - `slotIdx == null`  → the instrument's final audible output
 *   - a loop_gen slot    → final audible (looped), not the silent per-tick tap
 *   - any other slot     → that slot's one-shot per-tick tap
 */
export function audibleForTarget(
  ins: Instrument, render: RenderResult, slotIdx: number | null,
): Int16Array {
  if (slotIdx == null) return buildFinalAudible(ins, render);
  const slot = ins.slots[slotIdx];
  if (slot && isPostRenderOp(slot.fn)) return buildFinalAudible(ins, render);
  return slotDisplayTap(ins, render, slotIdx);
}
