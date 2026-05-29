// Pure waveform drawing helpers. No state, no events.

/**
 * Expand a Klang 8-bit Amiga byte stream to Int16 for display + audio so the
 * waveform canvas and the Web Audio buffer can share a single drawWaveform
 * implementation.
 *
 * `bytes` is the engine's `RenderResult.bytes` — the post-loopgen, signed
 * 8-bit DAC-truth output that the real Amiga would play.
 */
export function bytesToInt16(bytes: Int8Array): Int16Array {
  const out = new Int16Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) out[i] = (bytes[i]! << 8);
  return out;
}

/**
 * Same as bytesToInt16, but for samples that have a loop region (op22
 * loop_gen): the original bytes 0..end play first, then bytes
 * [loopOffset, loopOffset+loopLength] are appended `loopRepeats` times to
 * audibly demonstrate what the Amiga would do when DMA wraps onto the
 * loop region. Out-of-range / zero-length loops fall back to the
 * one-shot conversion so callers don't need to special-case.
 */
export function bytesToInt16WithLoop(
  bytes: Int8Array,
  loopOffset: number,
  loopLength: number,
  loopRepeats: number,
): Int16Array {
  if (loopLength <= 0 || loopRepeats <= 0 || loopOffset < 0
      || loopOffset >= bytes.length) {
    return bytesToInt16(bytes);
  }
  // Clamp the loop region to the actual buffer.
  const loopEnd = Math.min(bytes.length, loopOffset + loopLength);
  const safeLen = Math.max(0, loopEnd - loopOffset);
  if (safeLen === 0) return bytesToInt16(bytes);

  const total = bytes.length + safeLen * loopRepeats;
  const out = new Int16Array(total);
  // Phase 1: the original sample, as-rendered (loop_gen has already
  // crossfaded the loop region inside `bytes`).
  for (let i = 0; i < bytes.length; i++) out[i] = (bytes[i]! << 8);
  // Phase 2: repeat the loop region right after the original tail. The
  // crossfade in `bytes` makes the boundaries seamless.
  let pos = bytes.length;
  for (let r = 0; r < loopRepeats; r++) {
    for (let i = 0; i < safeLen; i++) {
      out[pos + i] = (bytes[loopOffset + i]! << 8);
    }
    pos += safeLen;
  }
  return out;
}

/**
 * Fixed vertical-scale buckets (half-height denominators). A waveform snaps
 * UP to the smallest bucket that contains its peak. Quantising to a small
 * ladder — rather than auto-fitting each cell to its own peak — keeps
 * amplitudes COMPARABLE across slots: two ~30k oscillators both land on
 * 32768, two small control signals both land on 256. Small signals still
 * become visible (a 0..127 tap fills ~half the 256-scaled cell) without a
 * 0..127 wiggle drowning on a ±32k axis.
 */
export const WAVE_SCALE_BUCKETS = [256, 4096, 32768] as const;

function bucketFor(peak: number): number {
  for (const b of WAVE_SCALE_BUCKETS) if (peak <= b) return b;
  return WAVE_SCALE_BUCKETS[WAVE_SCALE_BUCKETS.length - 1]!;
}

export interface WaveStats {
  /** Smallest sample value in the window. */
  min: number;
  /** Largest sample value in the window. */
  max: number;
  /** Raw symmetric peak = max(|min|, |max|), floored at 1. */
  peak: number;
  /** Display scale: `peak` snapped up to the nearest WAVE_SCALE_BUCKETS
   *  value. This is the half-height denominator drawWaveform divides by. */
  scale: number;
}

/**
 * Min / max / symmetric-peak / bucketed display-scale of a sample window.
 * Pure — no canvas. Returns null for an empty/absent buffer. Used both to
 * scale the waveform vertically (via `scale`) and to surface the numeric
 * min/max next to the display.
 */
export function waveStats(
  samples: Int16Array | null,
  start = 0,
  end?: number,
): WaveStats | null {
  if (!samples || samples.length === 0) return null;
  const lo = Math.max(0, start);
  const hi = Math.min(samples.length, end ?? samples.length);
  if (hi <= lo) return null;
  let min = samples[lo]!;
  let max = samples[lo]!;
  for (let i = lo + 1; i < hi; i++) {
    const v = samples[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const peak = Math.max(1, Math.abs(min), Math.abs(max));
  return { min, max, peak, scale: bucketFor(peak) };
}

export interface WaveOptions {
  width?: number | undefined;
  height?: number | undefined;
  color?: string | undefined;
  /** Start sample index (default 0). */
  start?: number | undefined;
  /** End sample index, exclusive (default samples.length). */
  end?: number | undefined;
  /** Optional translucent magenta region overlay [start, end). */
  loopRegion?: { start: number; end: number } | undefined;
}

export function drawWaveform(
  canvas: HTMLCanvasElement,
  samples: Int16Array | null,
  options: WaveOptions = {},
): WaveStats | null {
  const W = options.width ?? canvas.width;
  const H = options.height ?? canvas.height;
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const color = options.color ?? '#ffb14e';
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#050507';
  ctx.fillRect(0, 0, W, H);
  // zero line
  ctx.fillStyle = '#2a2a3c';
  ctx.fillRect(0, (H / 2) | 0, W, 1);

  if (!samples || samples.length === 0) return null;

  const start = Math.max(0, options.start ?? 0);
  const end = Math.min(samples.length, options.end ?? samples.length);
  const span = Math.max(1, end - start);
  const halfH = H / 2 - 1;

  // Scale vertically to a fixed bucket (256 / 4096 / 32768) chosen from the
  // window's peak. Quantising keeps amplitudes comparable across slots
  // while still lifting a small-range signal (control voltage, env, a
  // 0..127 ctrl tap) off the zero line. See WAVE_SCALE_BUCKETS.
  const stats = waveStats(samples, start, end);
  const peak = stats ? stats.scale : WAVE_SCALE_BUCKETS[0];

  // loop region overlay first (so it's under the line)
  if (options.loopRegion && options.loopRegion.end > options.loopRegion.start) {
    const sx = ((options.loopRegion.start - start) / span) * W;
    const ex = ((options.loopRegion.end - start) / span) * W;
    const lx = Math.max(0, Math.min(W, sx));
    const rx = Math.max(0, Math.min(W, ex));
    ctx.fillStyle = 'rgba(255,45,146,0.18)';
    ctx.fillRect(lx, 0, rx - lx, H);
    // Edge handles — 3px thick so they're actually visible. The viewer's
    // hit zone is wider still (see EDGE_PX in wave-viewer.ts), but the
    // user needs to SEE the edge in order to aim for it.
    ctx.fillStyle = 'rgba(255,45,146,0.95)';
    ctx.fillRect(lx, 0, 3, H);
    ctx.fillRect(rx - 3, 0, 3, H);
  }

  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  // Downsample by min/max per pixel column to preserve peaks.
  const samplesPerPx = span / W;
  for (let x = 0; x < W; x++) {
    const i0 = start + Math.floor(x * samplesPerPx);
    const i1 = Math.min(end, start + Math.floor((x + 1) * samplesPerPx));
    let lo = 32767, hi = -32768;
    for (let i = i0; i < i1; i++) {
      const v = samples[i]!;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    if (lo > hi) { lo = samples[i0] ?? 0; hi = lo; }
    const yHi = H / 2 - (hi / peak) * halfH;
    const yLo = H / 2 - (lo / peak) * halfH;
    if (x === 0) ctx.moveTo(x, yHi);
    else ctx.lineTo(x, yHi);
    ctx.lineTo(x, yLo);
  }
  ctx.stroke();
  return stats;
}
