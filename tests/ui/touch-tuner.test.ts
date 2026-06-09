// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openTouchTuner, PX_PER_NOTCH, SWIPE_PX_PER_PARAM } from '../../src/ui/touch-tuner';
import type { TunableParam } from '../../src/ui/param-list';

function param(over: Partial<TunableParam> = {}): TunableParam {
  return { slotIdx: 0, field: 'gainVal', label: 'gain', min: 0, max: 255, step: 1, scale: 'linear', value: 50, ...over };
}

// touch-type pointer event with a clientY (rollers are vertical).
function pe(type: string, clientY: number, pointerId = 1): Event {
  const Ctor = (globalThis as unknown as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
  const e = new Ctor(type, { clientY, bubbles: true, cancelable: true } as MouseEventInit);
  if (!('pointerType' in e)) Object.defineProperty(e, 'pointerType', { value: 'touch' });
  if (!('pointerId' in e)) Object.defineProperty(e, 'pointerId', { value: pointerId });
  return e;
}

let root: HTMLElement;
beforeEach(() => { document.body.innerHTML = ''; root = document.body; });

describe('touch value tuner', () => {
  it('renders the active param with its value and four rollers', () => {
    openTouchTuner(root, { title: 'T', params: [param()], activeIndex: 0, apply: () => {}, sealUndo: () => {} });
    expect(root.querySelector('#touch-tuner-overlay')).not.toBeNull();
    expect((root.querySelector('[data-tt-value]') as HTMLElement).textContent).toBe('50');
    expect(root.querySelectorAll('.tt-roller').length).toBe(4);
    expect(root.querySelector('.tt-roller[data-step="1000"]')).not.toBeNull();
  });

  it('dragging the ±10 roller up steps the value by notches × 10 and seals one undo', () => {
    const apply = vi.fn();
    const sealUndo = vi.fn();
    const t = openTouchTuner(root, { title: 'T', params: [param({ value: 50 })], activeIndex: 0, apply, sealUndo });
    const roller = root.querySelector('.tt-roller[data-step="10"]') as HTMLElement;

    roller.dispatchEvent(pe('pointerdown', 100));
    // Move up 50px → floor(50/PX_PER_NOTCH) notches.
    roller.dispatchEvent(pe('pointermove', 100 - (PX_PER_NOTCH * 2 + 6)));   // 2 notches
    const expected = 50 + 2 * 10;
    expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({ field: 'gainVal' }), expected);
    expect(t.value()).toBe(expected);
    expect(sealUndo).not.toHaveBeenCalled();               // still dragging

    roller.dispatchEvent(pe('pointerup', 100 - (PX_PER_NOTCH * 2 + 6)));
    expect(sealUndo).toHaveBeenCalledTimes(1);             // one drag = one seal
  });

  it('clamps at the max and reads the value absolutely from the drag start', () => {
    const apply = vi.fn();
    const t = openTouchTuner(root, { title: 'T', params: [param({ value: 250 })], activeIndex: 0, apply, sealUndo: () => {} });
    const roller = root.querySelector('.tt-roller[data-step="10"]') as HTMLElement;
    roller.dispatchEvent(pe('pointerdown', 200));
    roller.dispatchEvent(pe('pointermove', 200 - PX_PER_NOTCH * 5));   // +50 → clamps to 255
    expect(t.value()).toBe(255);
  });

  it('swiping the nav up moves to the next param; neighbours are shown', () => {
    const freq = param({ slotIdx: 0, field: 'freqVal', label: 'freq', value: 1000, max: 10000 });
    const gain = param({ slotIdx: 0, field: 'gainVal', label: 'gain', value: 80, max: 128 });
    const t = openTouchTuner(root, { title: 'T', params: [freq, gain], activeIndex: 0, apply: () => {}, sealUndo: () => {} });

    expect((root.querySelector('[data-tt-pname]') as HTMLElement).textContent).toBe('freq');
    expect((root.querySelector('[data-tt-next]') as HTMLElement).textContent).toBe('gain');

    const nav = root.querySelector('[data-tt-nav]') as HTMLElement;
    nav.dispatchEvent(pe('pointerdown', 200));
    nav.dispatchEvent(pe('pointerup', 200 - (SWIPE_PX_PER_PARAM + 6)));   // swipe up one param
    expect(t.index()).toBe(1);
    expect((root.querySelector('[data-tt-pname]') as HTMLElement).textContent).toBe('gain');
    expect(t.value()).toBe(80);
  });

  it('Done button and Escape both close the overlay', () => {
    const onClose = vi.fn();
    openTouchTuner(root, { title: 'T', params: [param()], activeIndex: 0, apply: () => {}, sealUndo: () => {}, onClose });
    (root.querySelector('#touch-tuner-close') as HTMLButtonElement).click();
    expect(root.querySelector('#touch-tuner-overlay')).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);

    openTouchTuner(root, { title: 'T', params: [param()], activeIndex: 0, apply: () => {}, sealUndo: () => {} });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(root.querySelector('#touch-tuner-overlay')).toBeNull();
  });
});
