// Dedicated waveform viewer with zoom / pan / loop overlay.
// Sits in the instrument header area; can show either the final-output
// sample or any per-slot tap.

import { drawWaveform } from './waveform';

export interface WaveViewerOptions {
  /** Called while the user is dragging a loop band edge — fires on
   *  every mousemove. The host should treat each call as a live
   *  preview (cheap mutations only). */
  onLoopChange?: ((loopOffset: number, loopLength: number) => void) | undefined;
  /** Called ONCE when the user releases the mouse after a loop-edge
   *  drag. Use this for "now I can do the expensive structural
   *  refresh" work — emitting a structure event during onLoopChange
   *  would destroy the canvas mid-drag and break the drag handler. */
  onLoopCommit?: (() => void) | undefined;
}

export interface WaveViewer {
  /**
   * Replace the sample shown; redraw with current view + loop region.
   * Pass `showLoop: false` to suppress the loop band / drag handles —
   * the meta line still reports `loop ofs+len` when the values are set.
   */
  setSample(
    sample: Int16Array | null,
    region?:
      | {
          loopOffset: number;
          loopLength: number;
          showLoop?: boolean | undefined;
          /**
           * Klang's renderer emits `instrument.sampleLength + 1` samples
           * (one tail tick beyond the audible region, see dsp-reference
           * §7). When the caller passes the instrument's authoritative
           * length here, the meta line reports THAT instead of the raw
           * buffer length — so the user sees the same even value they
           * just typed into the sample-length field.
           */
          instrumentLength?: number | undefined;
        }
      | undefined,
  ): void;
  destroy(): void;
}

const W = 800;
const H = 140;

interface DragState {
  kind: 'pan' | 'loop-start';
  startX: number;
  startStart: number;
  startEnd: number;
  startLoopOfs: number;
  startLoopLen: number;
}

// Widened from the original 6px — at 6px the hit zone was effectively
// invisible. The viewer now also paints a thicker handle bar at the
// loop edge and shows an `ew-resize` cursor while the mouse is inside
// this zone, so the user can SEE that the edge is grabbable.
const EDGE_PX = 12;

/** Tightest zoom-in: never show fewer than this many samples. */
const MIN_SPAN = 16;
/** Vertical two-finger drag (px) per e-fold change of the visible span. */
const ZOOM_PX = 120;

export interface ViewWindow { start: number; end: number }

/** Clamp a [start, end) window into [0, total], preserving its span where
 *  possible by sliding it back in (mirrors the wheel-zoom clamp). */
export function clampView(start: number, end: number, total: number): ViewWindow {
  let s = Math.round(start);
  let e = Math.round(end);
  if (s < 0) { e -= s; s = 0; }
  if (e > total) { s -= (e - total); e = total; }
  if (s < 0) s = 0;
  return { start: s, end: e };
}

/**
 * Two-finger gesture → new view window. The centroid of the two touches drives
 * both axes at once: vertical movement zooms (drag UP shrinks the span = zoom
 * in; drag DOWN grows it = zoom out), keeping the sample under the gesture-start
 * centroid fixed; horizontal movement pans (drag RIGHT moves the view earlier).
 *
 *  - `focusFrac`  fractional x (0..1) of the gesture-start centroid in the view
 *  - `dxFrac`     horizontal centroid drag as a fraction of canvas width (+ = right)
 *  - `dyPx`       vertical centroid drag in pixels (+ = down)
 *  - `zoomPx`     pixels of vertical drag per e-fold of span
 */
export function transformTwoFinger(
  startView: ViewWindow,
  total: number,
  focusFrac: number,
  dxFrac: number,
  dyPx: number,
  zoomPx: number,
): ViewWindow {
  const startSpan = startView.end - startView.start;
  const focus = startView.start + focusFrac * startSpan;
  const maxSpan = Math.max(MIN_SPAN, total);
  const newSpan = Math.max(MIN_SPAN, Math.min(maxSpan, Math.round(startSpan * Math.exp(dyPx / zoomPx))));
  const start0 = focus - focusFrac * newSpan;     // keep the focus sample under the centroid
  const panSamples = dxFrac * newSpan;            // drag right → view shifts earlier
  return clampView(start0 - panSamples, start0 - panSamples + newSpan, total);
}

export function makeWaveViewer(root: HTMLElement, opts: WaveViewerOptions = {}): WaveViewer {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = '100%';
  canvas.style.height = `${H}px`;
  const meta = document.createElement('div');
  meta.className = 'wave-viewer-meta';
  meta.textContent = '(no sample)';
  root.innerHTML = '';
  root.appendChild(canvas);
  root.appendChild(meta);

  let sample: Int16Array | null = null;
  let loopOffset = 0;
  let loopLength = 0;
  let showLoop = true;
  // Authoritative instrument sample length for the meta line; falls back
  // to the rendered buffer's length when the caller didn't pass one.
  let instrumentLength: number | null = null;

  // View window over `sample` in source-sample indices.
  let viewStart = 0;
  let viewEnd = 0;

  const total = (): number => sample?.length ?? 0;

  const paint = (): void => {
    if (!sample || sample.length === 0) {
      drawWaveform(canvas, null, { width: W, height: H });
      meta.textContent = '(no sample)';
      return;
    }
    const stats = drawWaveform(canvas, sample, {
      width: W,
      height: H,
      start: viewStart,
      end: viewEnd,
      loopRegion: (showLoop && loopLength > 0)
        ? { start: loopOffset, end: loopOffset + loopLength }
        : undefined,
    });
    const reportedLen = instrumentLength ?? sample.length;
    meta.textContent =
      `len ${reportedLen} · view ${viewStart}–${viewEnd}` +
      (stats ? ` · min ${stats.min} max ${stats.max}` : '') +
      ((showLoop && loopLength > 0) ? ` · loop ${loopOffset}+${loopLength}` : '');
  };

  const xToSample = (clientX: number): number => {
    const rect = canvas.getBoundingClientRect();
    const x = (clientX - rect.left) / rect.width;
    return viewStart + Math.round(x * (viewEnd - viewStart));
  };
  const sampleToX = (sIdx: number): number => {
    const rect = canvas.getBoundingClientRect();
    const ratio = (sIdx - viewStart) / Math.max(1, viewEnd - viewStart);
    return ratio * rect.width;
  };

  canvas.addEventListener('wheel', (e) => {
    if (!sample) return;
    e.preventDefault();
    const focus = xToSample(e.clientX);
    const factor = e.deltaY < 0 ? 0.85 : 1.18; // zoom in / out
    const span = viewEnd - viewStart;
    const newSpan = Math.max(MIN_SPAN, Math.min(total(), Math.round(span * factor)));
    const ratio = (focus - viewStart) / Math.max(1, span);
    const start0 = focus - ratio * newSpan;
    const v = clampView(start0, start0 + newSpan, total());
    viewStart = v.start;
    viewEnd = v.end;
    paint();
  }, { passive: false });

  let drag: DragState | null = null;
  // Hover-cursor: when the mouse is within EDGE_PX of the loop edge,
  // advertise that it's grabbable with an `ew-resize` cursor. Otherwise
  // fall back to default (or `grabbing` while a pan drag is active —
  // pan styling is handled by the drag branch below).
  canvas.addEventListener('mousemove', (e) => {
    if (drag) return;            // active drag owns the cursor
    if (!sample) { canvas.style.cursor = ''; return; }
    if (showLoop && loopLength > 0) {
      const xL = sampleToX(loopOffset);
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      canvas.style.cursor = Math.abs(mouseX - xL) <= EDGE_PX ? 'ew-resize' : '';
    } else {
      canvas.style.cursor = '';
    }
  });
  canvas.addEventListener('mousedown', (e) => {
    if (!sample) return;
    e.preventDefault();
    // Edge-detect the LEFT loop handle (loopOffset). The right edge is
    // pinned to the sample end (loopLength is derived) so we don't
    // listen for drags there.
    if (showLoop && loopLength > 0) {
      const xL = sampleToX(loopOffset);
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      if (Math.abs(mouseX - xL) <= EDGE_PX) {
        drag = {
          kind: 'loop-start', startX: e.clientX,
          startStart: viewStart, startEnd: viewEnd,
          startLoopOfs: loopOffset, startLoopLen: loopLength,
        };
        return;
      }
    }
    drag = {
      kind: 'pan', startX: e.clientX,
      startStart: viewStart, startEnd: viewEnd,
      startLoopOfs: loopOffset, startLoopLen: loopLength,
    };
  });
  const onMove = (e: MouseEvent): void => {
    if (!drag || !sample) return;
    const rect = canvas.getBoundingClientRect();
    const span = drag.startEnd - drag.startStart;
    const dxSamples = ((e.clientX - drag.startX) / rect.width) * span;
    if (drag.kind === 'pan') {
      let s = Math.round(drag.startStart - dxSamples);
      let ee = s + span;
      if (s < 0) { ee -= s; s = 0; }
      if (ee > total()) { s -= (ee - total()); ee = total(); }
      if (s < 0) s = 0;
      viewStart = s;
      viewEnd = ee;
      paint();
    } else if (drag.kind === 'loop-start') {
      // Loop LENGTH isn't user-modifiable — it's always (sampleLength −
      // loopOffset). The receiver (app.ts) clamps the proposed offset
      // to the nearest valid even position via loop-rules. We just
      // forward the raw click position and let the caller snap.
      const proposedStart = Math.round(drag.startLoopOfs + dxSamples);
      // Locally show an unclamped preview so the band tracks the cursor.
      const localEnd = drag.startLoopOfs + drag.startLoopLen;
      const previewStart = Math.max(0, Math.min(localEnd - 2, proposedStart));
      loopOffset = previewStart;
      loopLength = localEnd - previewStart;
      paint();
      if (opts.onLoopChange) opts.onLoopChange(loopOffset, loopLength);
    }
    // loop-end drag intentionally removed — the loop region's right
    // edge is always pinned to the sample end (loopLength is derived).
  };
  const onUp = (): void => {
    if (drag?.kind === 'loop-start' && opts.onLoopCommit) opts.onLoopCommit();
    drag = null;
  };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);

  // ── Touch: two-finger drag zooms (vertical) / pans (horizontal). The canvas
  //    sets `touch-action: none` (styles.css) so the browser doesn't steal the
  //    gesture for page pinch-zoom. We track the centroid of the two touches
  //    relative to where the gesture started, so the math is a pure transform.
  let pinch: { startView: ViewWindow; focusFrac: number; startCx: number; startCy: number } | null = null;
  const centroid = (t: TouchList): { x: number; y: number } => ({
    x: (t[0]!.clientX + t[1]!.clientX) / 2,
    y: (t[0]!.clientY + t[1]!.clientY) / 2,
  });
  canvas.addEventListener('touchstart', (e) => {
    if (!sample || e.touches.length !== 2) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const c = centroid(e.touches);
    const focusFrac = Math.max(0, Math.min(1, (c.x - rect.left) / Math.max(1, rect.width)));
    pinch = { startView: { start: viewStart, end: viewEnd }, focusFrac, startCx: c.x, startCy: c.y };
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (!pinch || !sample || e.touches.length !== 2) return;
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const c = centroid(e.touches);
    const dxFrac = (c.x - pinch.startCx) / Math.max(1, rect.width);
    const dyPx = c.y - pinch.startCy;
    const v = transformTwoFinger(pinch.startView, total(), pinch.focusFrac, dxFrac, dyPx, ZOOM_PX);
    viewStart = v.start;
    viewEnd = v.end;
    paint();
  }, { passive: false });
  const endPinch = (e: TouchEvent): void => { if (e.touches.length < 2) pinch = null; };
  canvas.addEventListener('touchend', endPinch);
  canvas.addEventListener('touchcancel', endPinch);

  return {
    setSample(s, region) {
      const wasEmpty = sample == null;
      sample = s;
      if (region) {
        loopOffset = region.loopOffset;
        loopLength = region.loopLength;
        // Default to visible (legacy callers don't pass the flag).
        showLoop = region.showLoop !== false;
        instrumentLength = region.instrumentLength ?? null;
      } else {
        instrumentLength = null;
      }
      if (s && (wasEmpty || viewEnd <= viewStart || viewEnd > s.length)) {
        viewStart = 0;
        viewEnd = s.length;
      }
      if (!s) {
        viewStart = 0;
        viewEnd = 0;
      }
      paint();
    },
    destroy() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      root.innerHTML = '';
    },
  };
}
