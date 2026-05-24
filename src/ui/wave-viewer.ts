// Dedicated waveform viewer with zoom / pan / loop overlay.
// Sits in the instrument header area; can show either the final-output
// sample or any per-slot tap.

import { drawWaveform } from './waveform';

export interface WaveViewerOptions {
  /** Called when the user drags a loop band edge. */
  onLoopChange?: ((loopOffset: number, loopLength: number) => void) | undefined;
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
      | { loopOffset: number; loopLength: number; showLoop?: boolean | undefined }
      | undefined,
  ): void;
  destroy(): void;
}

const W = 640;
const H = 120;

interface DragState {
  kind: 'pan' | 'loop-start' | 'loop-end';
  startX: number;
  startStart: number;
  startEnd: number;
  startLoopOfs: number;
  startLoopLen: number;
}

const EDGE_PX = 6;

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
    drawWaveform(canvas, sample, {
      width: W,
      height: H,
      start: viewStart,
      end: viewEnd,
      loopRegion: (showLoop && loopLength > 0)
        ? { start: loopOffset, end: loopOffset + loopLength }
        : undefined,
    });
    meta.textContent =
      `len ${sample.length} · view ${viewStart}–${viewEnd}` +
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
    const newSpan = Math.max(16, Math.min(total(), Math.round(span * factor)));
    const ratio = (focus - viewStart) / Math.max(1, span);
    let newStart = Math.round(focus - ratio * newSpan);
    let newEnd = newStart + newSpan;
    if (newStart < 0) { newEnd -= newStart; newStart = 0; }
    if (newEnd > total()) { newStart -= (newEnd - total()); newEnd = total(); }
    if (newStart < 0) newStart = 0;
    viewStart = newStart;
    viewEnd = newEnd;
    paint();
  }, { passive: false });

  let drag: DragState | null = null;
  canvas.addEventListener('mousedown', (e) => {
    if (!sample) return;
    e.preventDefault();
    // Edge-detect loop handles first (only when the loop band is visible).
    if (showLoop && loopLength > 0) {
      const xL = sampleToX(loopOffset);
      const xR = sampleToX(loopOffset + loopLength);
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
      if (Math.abs(mouseX - xR) <= EDGE_PX) {
        drag = {
          kind: 'loop-end', startX: e.clientX,
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
      const newStart = Math.max(0, Math.min(drag.startLoopOfs + drag.startLoopLen - 1,
        Math.round(drag.startLoopOfs + dxSamples)));
      const newLen = drag.startLoopOfs + drag.startLoopLen - newStart;
      loopOffset = newStart;
      loopLength = newLen;
      paint();
      if (opts.onLoopChange) opts.onLoopChange(loopOffset, loopLength);
    } else if (drag.kind === 'loop-end') {
      const newEnd = Math.max(drag.startLoopOfs + 1, Math.min(total(),
        Math.round(drag.startLoopOfs + drag.startLoopLen + dxSamples)));
      const newLen = newEnd - drag.startLoopOfs;
      loopLength = newLen;
      paint();
      if (opts.onLoopChange) opts.onLoopChange(loopOffset, loopLength);
    }
  };
  const onUp = (): void => { drag = null; };
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);

  return {
    setSample(s, region) {
      const wasEmpty = sample == null;
      sample = s;
      if (region) {
        loopOffset = region.loopOffset;
        loopLength = region.loopLength;
        // Default to visible (legacy callers don't pass the flag).
        showLoop = region.showLoop !== false;
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
