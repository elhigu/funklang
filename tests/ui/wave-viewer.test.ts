// @vitest-environment jsdom
//
// UX contract for the wave-viewer's loop-edge interaction:
//   * the canvas shows an `ew-resize` cursor when the mouse hovers
//     within the hit zone of the loop's left edge — invisible 6-pixel
//     zones aren't discoverable, so the hit zone is wider (≥ 12px)
//     and gives cursor feedback to advertise itself
//   * mousedown inside that zone starts a loop-edge drag (emits
//     onLoopChange); a click well away from the edge does not

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeWaveViewer } from '../../src/ui/wave-viewer';

function mountViewer(): { root: HTMLElement; canvas: HTMLCanvasElement; viewer: ReturnType<typeof makeWaveViewer> } {
  document.body.innerHTML = '';
  const root = document.createElement('div');
  document.body.appendChild(root);
  const onLoopChange = vi.fn();
  const viewer = makeWaveViewer(root, { onLoopChange });
  // 1000-sample sample, loopOffset=500 (centre), loopLength=500.
  const s = new Int16Array(1000);
  for (let i = 0; i < s.length; i++) s[i] = ((i * 23) & 0xff) - 128;
  viewer.setSample(s, { loopOffset: 500, loopLength: 500 });
  const canvas = root.querySelector('canvas') as HTMLCanvasElement;
  // jsdom returns a zero rect for canvas. The viewer reads
  // getBoundingClientRect() to map pixels↔samples, so override.
  canvas.getBoundingClientRect = () => ({
    left: 0, top: 0, right: 1000, bottom: 140,
    width: 1000, height: 140, x: 0, y: 0,
    toJSON: () => '',
  });
  return { root, canvas, viewer };
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('wave-viewer — loop edge cursor & hit zone', () => {
  it('cursor turns ew-resize when the mouse is near the loop edge (≤ 12px)', () => {
    const { canvas } = mountViewer();
    // Loop offset is at sample 500; view = [0, 1000], canvas width 1000.
    // So the edge sits at x = 500. Send a mousemove 10px to the right.
    canvas.dispatchEvent(new MouseEvent('mousemove', {
      clientX: 510, clientY: 70, bubbles: true,
    }));
    expect(canvas.style.cursor).toBe('ew-resize');
  });

  it('cursor goes back to default when mouse is far from the loop edge', () => {
    const { canvas } = mountViewer();
    canvas.dispatchEvent(new MouseEvent('mousemove', {
      clientX: 100, clientY: 70, bubbles: true,
    }));
    expect(canvas.style.cursor).not.toBe('ew-resize');
  });

  it('mousedown 10px from the edge starts a loop-edge drag', () => {
    const cb = vi.fn();
    document.body.innerHTML = '';
    const root = document.createElement('div');
    document.body.appendChild(root);
    const viewer = makeWaveViewer(root, { onLoopChange: cb });
    const s = new Int16Array(1000);
    viewer.setSample(s, { loopOffset: 500, loopLength: 500 });
    const canvas = root.querySelector('canvas') as HTMLCanvasElement;
    canvas.getBoundingClientRect = () => ({
      left: 0, top: 0, right: 1000, bottom: 140,
      width: 1000, height: 140, x: 0, y: 0, toJSON: () => '',
    });
    // 10px from the edge — comfortably inside the widened hit zone.
    canvas.dispatchEvent(new MouseEvent('mousedown', {
      clientX: 510, clientY: 70, button: 0, bubbles: true,
    }));
    // Drag a few pixels to the right and release.
    document.dispatchEvent(new MouseEvent('mousemove', {
      clientX: 540, bubbles: true,
    }));
    expect(cb).toHaveBeenCalled();
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
  });
});
