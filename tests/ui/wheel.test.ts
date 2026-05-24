/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { attachWheelStep } from '../../src/ui/wheel';

function makeSelect(values: string[], selected = 0): HTMLSelectElement {
  const sel = document.createElement('select');
  for (const v of values) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = v;
    sel.appendChild(o);
  }
  sel.selectedIndex = selected;
  return sel;
}

describe('attachWheelStep', () => {
  it('advances to the next option on wheel down (positive deltaY)', () => {
    const sel = makeSelect(['a', 'b', 'c'], 0);
    const onChange = vi.fn();
    sel.addEventListener('change', onChange);
    attachWheelStep(sel);
    sel.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
    expect(sel.selectedIndex).toBe(1);
    expect(sel.value).toBe('b');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('moves to the previous option on wheel up (negative deltaY)', () => {
    const sel = makeSelect(['a', 'b', 'c'], 2);
    attachWheelStep(sel);
    sel.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }));
    expect(sel.selectedIndex).toBe(1);
  });

  it('clamps at the first option', () => {
    const sel = makeSelect(['a', 'b'], 0);
    const onChange = vi.fn();
    sel.addEventListener('change', onChange);
    attachWheelStep(sel);
    sel.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }));
    expect(sel.selectedIndex).toBe(0);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('clamps at the last option', () => {
    const sel = makeSelect(['a', 'b'], 1);
    const onChange = vi.fn();
    sel.addEventListener('change', onChange);
    attachWheelStep(sel);
    sel.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
    expect(sel.selectedIndex).toBe(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('does nothing when the select is disabled', () => {
    const sel = makeSelect(['a', 'b', 'c'], 0);
    sel.disabled = true;
    attachWheelStep(sel);
    sel.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
    expect(sel.selectedIndex).toBe(0);
  });

  it('prevents the default page scroll', () => {
    const sel = makeSelect(['a', 'b'], 0);
    attachWheelStep(sel);
    const evt = new WheelEvent('wheel', { deltaY: 100, cancelable: true });
    sel.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
  });
});
