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
): void {
  const W = options.width ?? canvas.width;
  const H = options.height ?? canvas.height;
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const color = options.color ?? '#ffb14e';
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#050507';
  ctx.fillRect(0, 0, W, H);
  // zero line
  ctx.fillStyle = '#2a2a3c';
  ctx.fillRect(0, (H / 2) | 0, W, 1);

  if (!samples || samples.length === 0) return;

  const start = Math.max(0, options.start ?? 0);
  const end = Math.min(samples.length, options.end ?? samples.length);
  const span = Math.max(1, end - start);
  const halfH = H / 2 - 1;

  // loop region overlay first (so it's under the line)
  if (options.loopRegion && options.loopRegion.end > options.loopRegion.start) {
    const sx = ((options.loopRegion.start - start) / span) * W;
    const ex = ((options.loopRegion.end - start) / span) * W;
    const lx = Math.max(0, Math.min(W, sx));
    const rx = Math.max(0, Math.min(W, ex));
    ctx.fillStyle = 'rgba(255,45,146,0.18)';
    ctx.fillRect(lx, 0, rx - lx, H);
    // edge handles
    ctx.fillStyle = 'rgba(255,45,146,0.85)';
    ctx.fillRect(lx, 0, 1, H);
    ctx.fillRect(rx - 1, 0, 1, H);
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
    const yHi = H / 2 - (hi / 32768) * halfH;
    const yLo = H / 2 - (lo / 32768) * halfH;
    if (x === 0) ctx.moveTo(x, yHi);
    else ctx.lineTo(x, yHi);
    ctx.lineTo(x, yLo);
  }
  ctx.stroke();
}
