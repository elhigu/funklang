// @vitest-environment jsdom
// tests/ui/wave-view-gesture.test.ts
//
// The two-finger waveform gesture math (pure functions, the risky part).
// Convention: vertical centroid drag zooms (drag UP = zoom in, span shrinks);
// horizontal centroid drag pans (drag RIGHT = content follows, view start
// decreases). Zoom keeps the sample under the gesture-start centroid fixed.
import { describe, it, expect, beforeEach } from 'vitest';
import { clampView, transformTwoFinger, makeWaveViewer } from '../../src/ui/wave-viewer';

const span = (v: { start: number; end: number }): number => v.end - v.start;
const mid = (v: { start: number; end: number }): number => (v.start + v.end) / 2;

describe('clampView', () => {
  it('keeps an in-bounds window unchanged', () => {
    expect(clampView(100, 300, 1000)).toEqual({ start: 100, end: 300 });
  });
  it('shifts a window that runs past 0 back in, preserving span', () => {
    expect(clampView(-50, 150, 1000)).toEqual({ start: 0, end: 200 });
  });
  it('shifts a window past the end back in, preserving span', () => {
    expect(clampView(900, 1100, 1000)).toEqual({ start: 800, end: 1000 });
  });
});

describe('transformTwoFinger', () => {
  const ZOOM = 120;

  it('no movement → unchanged window', () => {
    const v = transformTwoFinger({ start: 0, end: 1000 }, 1000, 0.5, 0, 0, ZOOM);
    expect(v).toEqual({ start: 0, end: 1000 });
  });

  it('drag up zooms IN, keeping the centroid sample fixed', () => {
    const v = transformTwoFinger({ start: 0, end: 1000 }, 1000, 0.5, 0, -ZOOM, ZOOM);
    // factor e^-1 ≈ 0.368 → span ≈ 368, centered on sample 500.
    expect(span(v)).toBeLessThan(1000);
    expect(span(v)).toBeCloseTo(Math.round(1000 * Math.exp(-1)), -1);
    expect(mid(v)).toBeCloseTo(500, -1);
  });

  it('drag down zooms OUT', () => {
    const v = transformTwoFinger({ start: 400, end: 600 }, 1000, 0.5, 0, ZOOM, ZOOM);
    expect(span(v)).toBeGreaterThan(200);
  });

  it('zooming out clamps to the whole sample', () => {
    const v = transformTwoFinger({ start: 400, end: 600 }, 1000, 0.5, 0, ZOOM * 10, ZOOM);
    expect(v).toEqual({ start: 0, end: 1000 });
  });

  it('never zooms in past the 16-sample minimum', () => {
    const v = transformTwoFinger({ start: 0, end: 1000 }, 1000, 0.5, 0, -ZOOM * 20, ZOOM);
    expect(span(v)).toBe(16);
  });

  it('drag right pans the view earlier (start decreases), span unchanged', () => {
    const v = transformTwoFinger({ start: 400, end: 600 }, 1000, 0.5, 0.25, 0, ZOOM);
    expect(span(v)).toBe(200);
    expect(v.start).toBe(350);   // 0.25 * 200 = 50 samples left
  });

  it('drag left pans the view later (start increases)', () => {
    const v = transformTwoFinger({ start: 400, end: 600 }, 1000, 0.5, -0.25, 0, ZOOM);
    expect(v.start).toBe(450);
  });

  it('panning clamps at the sample bounds', () => {
    const v = transformTwoFinger({ start: 0, end: 200 }, 1000, 0.5, 0.5, 0, ZOOM);
    expect(v).toEqual({ start: 0, end: 200 });   // can't pan before 0
  });
});

// ── Wiring: synthetic two-finger touch events drive the live viewer.
describe('wave-viewer two-finger touch wiring', () => {
  let canvas: HTMLCanvasElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.appendChild(root);
    const viewer = makeWaveViewer(root);
    const s = new Int16Array(1000);
    for (let i = 0; i < s.length; i++) s[i] = ((i * 23) & 0xff) - 128;
    viewer.setSample(s);
    canvas = root.querySelector('canvas') as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 1000, bottom: 140, width: 1000, height: 140, x: 0, y: 0, toJSON: () => '',
    });
  });

  const touch = (type: string, pts: Array<{ clientX: number; clientY: number }>): Event => {
    const e = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(e, 'touches', { value: pts });
    return e;
  };
  const view = (): { start: number; end: number } => {
    const meta = document.querySelector('.wave-viewer-meta')!.textContent!;
    const m = meta.match(/view (\d+)–(\d+)/)!;
    return { start: +m[1]!, end: +m[2]! };
  };

  it('starts at the full sample', () => {
    expect(view()).toEqual({ start: 0, end: 1000 });
  });

  it('two-finger drag UP zooms in (span shrinks, stays centered)', () => {
    canvas.dispatchEvent(touch('touchstart', [{ clientX: 400, clientY: 70 }, { clientX: 600, clientY: 70 }]));
    canvas.dispatchEvent(touch('touchmove', [{ clientX: 400, clientY: 10 }, { clientX: 600, clientY: 10 }]));
    const v = view();
    expect(v.end - v.start).toBeLessThan(1000);
    expect((v.start + v.end) / 2).toBeCloseTo(500, -1);
  });

  it('two-finger drag RIGHT pans the view earlier', () => {
    // Zoom in first so there's room to pan.
    canvas.dispatchEvent(touch('touchstart', [{ clientX: 400, clientY: 70 }, { clientX: 600, clientY: 70 }]));
    canvas.dispatchEvent(touch('touchmove', [{ clientX: 400, clientY: 10 }, { clientX: 600, clientY: 10 }]));
    canvas.dispatchEvent(touch('touchend', [{ clientX: 400, clientY: 10 }]));
    const before = view();
    // New gesture: drag both fingers right.
    canvas.dispatchEvent(touch('touchstart', [{ clientX: 400, clientY: 70 }, { clientX: 600, clientY: 70 }]));
    canvas.dispatchEvent(touch('touchmove', [{ clientX: 550, clientY: 70 }, { clientX: 750, clientY: 70 }]));
    expect(view().start).toBeLessThan(before.start);
  });
});
