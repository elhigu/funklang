// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { makeKnob } from '../../src/ui/knob';

function getBar(k: { el: HTMLElement }): HTMLElement {
  return k.el.querySelector('.kbar') as HTMLElement;
}
function getVal(k: { el: HTMLElement }): HTMLElement {
  return k.el.querySelector('.kval') as HTMLElement;
}

describe('makeKnob — wheel', () => {
  it('wheel up = +1, wheel down = -1', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'g', value: 100, onChange: cb });
    const wheelUp = new WheelEvent('wheel', { deltaY: -1, bubbles: true, cancelable: true });
    k.el.dispatchEvent(wheelUp);
    expect(k.getValue()).toBe(101);
    expect(cb).toHaveBeenCalledWith(101);

    const wheelDown = new WheelEvent('wheel', { deltaY: 1, bubbles: true, cancelable: true });
    k.el.dispatchEvent(wheelDown);
    expect(k.getValue()).toBe(100);
    expect(cb).toHaveBeenLastCalledWith(100);
  });
  it('shift + wheel uses range-aware coarse step (~3% of range)', () => {
    const cb = vi.fn();
    // range = 255 → coarseStep = round(255 * 0.03) = 8
    const k = makeKnob({ label: 'g', value: 50, max: 255, onChange: cb });
    k.el.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, shiftKey: true, bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(58);
  });
  it('coarse step scales with a wide range (i16)', () => {
    const cb = vi.fn();
    // range = 65535 → coarseStep = round(65535 * 0.03) = 1966
    const k = makeKnob({ label: 'freq', value: 0, min: -32768, max: 32767, onChange: cb });
    k.el.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, shiftKey: true, bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(1966);
  });
  it('coarse step floors at 1 for tiny ranges', () => {
    const cb = vi.fn();
    // range = 3 → 3% = 0.09 → clamped to 1
    const k = makeKnob({ label: 'mode', value: 0, max: 3, onChange: cb });
    k.el.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, shiftKey: true, bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(1);
  });
});

describe('makeKnob — arrow keys', () => {
  it('ArrowUp/Down = ±1', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'g', value: 10, onChange: cb });
    const bar = getBar(k);
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(11);
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(10);
  });
  it('Shift+arrow uses range-aware coarse step (~3% of range)', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'g', value: 50, max: 255, onChange: cb });
    const bar = getBar(k);
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(58);  // 50 + 8 (3% of 255)
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(50);
  });

  it('ArrowRight/Left = coarse step (always, no Shift needed)', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'g', value: 50, max: 255, onChange: cb });
    const bar = getBar(k);
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(58);   // +coarse 8
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(50);
  });
});

describe('makeKnob — position-based drag', () => {
  // Force a stable bounding rect on the bar since jsdom returns 0×0 by default.
  function mockRect(el: HTMLElement, rect: Partial<DOMRect>): void {
    const def = { left: 0, top: 0, right: 200, bottom: 22, width: 200, height: 22, x: 0, y: 0, toJSON: () => '' };
    el.getBoundingClientRect = () => ({ ...def, ...rect }) as DOMRect;
  }

  it('clicking at 50% of the bar sets value to mid-range', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'g', value: 0, max: 255, onChange: cb });
    const bar = getBar(k);
    mockRect(bar, { left: 0, width: 200, right: 200 });
    bar.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, button: 0, bubbles: true, cancelable: true }));
    // ratio = 100/200 = 0.5 → 128 (round of 127.5)
    expect(k.getValue()).toBe(128);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  });

  it('dragging from one X to another updates the value continuously', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'g', value: 0, max: 255, onChange: cb });
    const bar = getBar(k);
    mockRect(bar, { left: 0, width: 200, right: 200 });
    bar.dispatchEvent(new MouseEvent('mousedown', { clientX: 20, button: 0, bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(26);     // round(20/200 * 255) = 26
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 150, bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(191);    // round(150/200 * 255) = 191
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  });

  it('clamps at the right edge', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'g', value: 0, max: 255, onChange: cb });
    const bar = getBar(k);
    mockRect(bar, { left: 0, width: 200, right: 200 });
    // Click far past the right edge — should clamp to max (255).
    bar.dispatchEvent(new MouseEvent('mousedown', { clientX: 9999, button: 0, bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(255);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  });

  it('mousedown focuses the bar so ArrowUp fine-tunes from there', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'g', value: 0, max: 255, onChange: cb });
    // jsdom .focus() only succeeds on attached elements.
    document.body.appendChild(k.el);
    const bar = getBar(k);
    mockRect(bar, { left: 0, width: 200, right: 200 });
    bar.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, button: 0, bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(bar);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(129);    // 128 + 1
    k.el.remove();
  });
});

describe('makeKnob — double-click editor', () => {
  it('opens an input on dblclick and commits on Enter', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'g', value: 100, onChange: cb });
    const val = getVal(k);
    val.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    const input = k.el.querySelector('input.kedit') as HTMLInputElement;
    expect(input).not.toBeNull();
    input.value = '77';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(77);
    expect(cb).toHaveBeenCalledWith(77);
  });
  it('Escape cancels', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'g', value: 100, onChange: cb });
    const val = getVal(k);
    val.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    const input = k.el.querySelector('input.kedit') as HTMLInputElement;
    input.value = '999';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(100);
    expect(cb).not.toHaveBeenCalled();
  });
});

describe('makeKnob — out of range', () => {
  it('setValue clamps internally; out-of-range visual on display only', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'g', value: 100, max: 255, onChange: cb });
    k.setValue(999);
    expect(k.getValue()).toBe(255);
  });
});

describe('makeKnob — i16 max', () => {
  it('clamps within min/max bounds when using fine arrows', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'freq', value: 32766, min: -32768, max: 32767, onChange: cb });
    const bar = getBar(k);
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(32767);
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(32767);   // clamped
  });
});
