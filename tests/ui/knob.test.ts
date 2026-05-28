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
  it('wheel = COARSE by default on a wide range (≥ 64)', () => {
    const cb = vi.fn();
    // range = 255 → coarseStep = round(255 * 0.03) = 8
    const k = makeKnob({ label: 'g', value: 100, max: 255, onChange: cb });
    k.el.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(108);
    expect(cb).toHaveBeenLastCalledWith(108);
    k.el.dispatchEvent(new WheelEvent('wheel', { deltaY: 1, bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(100);
  });
  it('Shift+wheel = 16× the wheel step', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'g', value: 50, max: 255, onChange: cb });
    k.el.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, shiftKey: true, bubbles: true, cancelable: true }));
    // coarseStep at range=255 is round(255*0.03)=8 → 16 × 8 = 128 → 50 + 128 = 178.
    expect(k.getValue()).toBe(178);
  });
  it('ranges > 1000 use LOG coarse — step = 3% of current value (not of range)', () => {
    const cb = vi.fn();
    // range = 65535, value = 1000 → coarseStep = round(1000 * 0.03) = 30
    const k = makeKnob({ label: 'freq', value: 1000, min: -32768, max: 32767, onChange: cb });
    k.el.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(1030);
    // At value = 0 the log step floor is 1 — no monster ±1966 jumps at the bottom.
    k.setValue(0);
    k.el.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(1);
  });

  it('ranges 64..1000 still use LINEAR coarse (3% of the range)', () => {
    const cb = vi.fn();
    // range = 255 → linear coarse = round(255 * 0.03) = 8
    const k = makeKnob({ label: 'g', value: 50, max: 255, onChange: cb });
    k.el.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(58);
  });
  it('ranges smaller than 64 still wheel by 1 by default (no separate coarse mode)', () => {
    const cb = vi.fn();
    // range = 3 → below threshold → wheel default IS ±step.
    const k = makeKnob({ label: 'mode', value: 0, max: 3, onChange: cb });
    k.el.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(1);
    // Shift+wheel = 16 × that, clamped to max=3.
    k.el.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, shiftKey: true, bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(3);
  });
  it('range exactly 63 is below threshold (step=1); 64 is at threshold (coarse)', () => {
    const cb1 = vi.fn();
    const k1 = makeKnob({ label: 'a', value: 0, max: 63, onChange: cb1 });
    k1.el.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, bubbles: true, cancelable: true }));
    expect(k1.getValue()).toBe(1);   // step=1 (63 < 64)
    const cb2 = vi.fn();
    const k2 = makeKnob({ label: 'b', value: 0, max: 64, onChange: cb2 });
    k2.el.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, bubbles: true, cancelable: true }));
    expect(k2.getValue()).toBe(2);   // round(64 * 0.03) = 2
  });
});

describe('makeKnob — arrow keys', () => {
  it('ArrowUp/Down (no Shift) = ± step (±1 by default)', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'g', value: 50, max: 255, onChange: cb });
    const bar = getBar(k);
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(51);
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(50);
  });
  it('Shift+ArrowUp/Down = 16× step (always)', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'g', value: 0, max: 255, onChange: cb });
    const bar = getBar(k);
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true, cancelable: true }));
    // step=1 → 16 × 1 = 16.
    expect(k.getValue()).toBe(16);
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(0);
  });
  it('Shift+ArrowUp on a step=2 knob moves by 32 (16 × step)', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'ofs', value: 0, min: 0, max: 1024, step: 2, onChange: cb });
    const bar = getBar(k);
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(32);
  });
  it('ArrowRight/Left (no Shift) = ± coarse step', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'g', value: 50, max: 255, onChange: cb });
    const bar = getBar(k);
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(58);
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(50);
  });
  it('Shift+ArrowRight = 16 × coarse step', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'g', value: 50, max: 255, onChange: cb });
    const bar = getBar(k);
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true, cancelable: true }));
    // coarse 8 → 16 × 8 = 128 → 50 + 128 = 178.
    expect(k.getValue()).toBe(178);
  });
  it('small ranges (<64): plain ArrowUp/Right do ±1', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'mode', value: 0, max: 3, onChange: cb });
    const bar = getBar(k);
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(1);
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(2);
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
    // Plain ArrowUp = ±step (1) from the clicked-to position (128 → 129).
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

describe('makeKnob — even-only (step=2)', () => {
  it('Shift+wheel moves by 16 × coarse, still snapped to a multiple of step', () => {
    const cb = vi.fn();
    // range=12286, value=100 → log coarse = round(100*0.03/2)*2 = 4 (rounded up to multiple of step).
    // 16 × 4 = 64 → 100 + 64 = 164.
    const k = makeKnob({ label: 'ofs', value: 100, min: 0, max: 12286, step: 2, onChange: cb });
    k.el.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, shiftKey: true, bubbles: true, cancelable: true }));
    const v1 = k.getValue();
    expect(v1 % 2).toBe(0);
    expect(v1).toBeGreaterThan(100);
  });

  it('coarse wheel snaps to a multiple of step', () => {
    const cb = vi.fn();
    // range=12286 → log coarse on a value of 100 = round(3 / 2) * 2 = 4
    const k = makeKnob({ label: 'ofs', value: 100, min: 0, max: 12286, step: 2, onChange: cb });
    k.el.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, bubbles: true, cancelable: true }));
    const v = k.getValue();
    expect(v % 2).toBe(0);
    expect(v).toBeGreaterThan(100);
  });

  it('numeric editor commits even values only (7 rounds to 8)', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'ofs', value: 10, min: 0, max: 100, step: 2, onChange: cb });
    const val = k.el.querySelector('.kval') as HTMLElement;
    val.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
    const input = k.el.querySelector('input.kedit') as HTMLInputElement;
    input.value = '7';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(8);
  });

  it('setValue snaps to a multiple of step', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'ofs', value: 0, min: 0, max: 100, step: 2, onChange: cb });
    k.setValue(51);
    expect(k.getValue()).toBe(52);
  });
});

describe('makeKnob — power scale (soft "log"-style taper)', () => {
  function mockRect(el: HTMLElement, w: number): void {
    el.getBoundingClientRect = () => ({
      left: 0, top: 0, right: w, bottom: 22,
      width: w, height: 22, x: 0, y: 0, toJSON: () => '',
    }) as DOMRect;
  }
  function getBarEl(k: { el: HTMLElement }): HTMLElement {
    return k.el.querySelector('.kbar') as HTMLElement;
  }

  it('clicking at the bar midpoint lands at 25% of the range (default pow=2)', () => {
    // range = 0..10000, pow=2 → midpoint = 10000 * 0.5^2 = 2500.
    const cb = vi.fn();
    const k = makeKnob({ label: 'freq', value: 0, max: 10000, scale: 'pow', onChange: cb });
    const bar = getBarEl(k);
    mockRect(bar, 200);
    bar.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, button: 0, bubbles: true, cancelable: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(2500);
  });

  it('scalePow=3 gives a harsher curve (bar midpoint = 12.5% of range)', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'freq', value: 0, max: 10000, scale: 'pow', scalePow: 3, onChange: cb });
    const bar = getBarEl(k);
    mockRect(bar, 200);
    bar.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, button: 0, bubbles: true, cancelable: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(1250);    // 10000 * 0.5^3
  });

  it('clicking at the right edge still lands at max', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'freq', value: 0, max: 10000, scale: 'pow', onChange: cb });
    const bar = getBarEl(k);
    mockRect(bar, 200);
    bar.dispatchEvent(new MouseEvent('mousedown', { clientX: 200, button: 0, bubbles: true, cancelable: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(10000);
  });

  it('clicking at the left edge lands at min (0)', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'freq', value: 5000, max: 10000, scale: 'pow', onChange: cb });
    const bar = getBarEl(k);
    mockRect(bar, 200);
    bar.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, button: 0, bubbles: true, cancelable: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(0);
  });

  it('paint sets bar fill = (value/max)^(1/pow) — value=2500 → ~50%', () => {
    // value/max = 0.25, ^(1/2) = 0.5 → ~50% fill.
    const cb = vi.fn();
    const k = makeKnob({ label: 'freq', value: 2500, max: 10000, scale: 'pow', onChange: cb });
    const bar = getBarEl(k);
    const fill = parseFloat((bar.style.getPropertyValue('--fill') || '0%').replace('%', ''));
    expect(fill).toBeGreaterThan(48);
    expect(fill).toBeLessThan(52);
  });

  it('falls back to LINEAR when min is negative (mixed-sign pow is undefined)', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'x', value: 0, min: -100, max: 100, scale: 'pow', onChange: cb });
    const bar = getBarEl(k);
    mockRect(bar, 200);
    bar.dispatchEvent(new MouseEvent('mousedown', { clientX: 100, button: 0, bubbles: true, cancelable: true }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(0);   // linear midpoint of [-100, 100]
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
