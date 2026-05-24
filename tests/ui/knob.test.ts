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
  it('shift + wheel = ±10', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'g', value: 50, onChange: cb });
    k.el.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, shiftKey: true, bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(60);
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
  it('Shift+arrow = ±10', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'g', value: 50, onChange: cb });
    const bar = getBar(k);
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(60);
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(50);
  });
});

describe('makeKnob — drag', () => {
  it('coarse drag: 1px up = +2 units (default coarse 0.5 px/unit)', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'g', value: 100, onChange: cb });
    const bar = getBar(k);
    bar.dispatchEvent(new MouseEvent('mousedown', { clientY: 200, button: 0, bubbles: true, cancelable: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 190, bubbles: true, cancelable: true }));
    // dy = 200 - 190 = 10; ppu = 0.5 → delta = 10/0.5 = 20 units. 100 + 20 = 120.
    expect(k.getValue()).toBe(120);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
  });
  it('clamps at max (255 default)', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'g', value: 240, onChange: cb });
    const bar = getBar(k);
    bar.dispatchEvent(new MouseEvent('mousedown', { clientY: 500, button: 0, bubbles: true, cancelable: true }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: 0, bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(255);
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
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
  it('supports max 32767 / min -32768', () => {
    const cb = vi.fn();
    const k = makeKnob({ label: 'freq', value: 0, min: -32768, max: 32767, onChange: cb });
    k.el.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, shiftKey: true, bubbles: true, cancelable: true }));
    expect(k.getValue()).toBe(10);
  });
});
