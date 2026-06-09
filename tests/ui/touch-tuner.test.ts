// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openTouchTuner, PX_PER_NOTCH, SWIPE_PX_PER_PARAM } from '../../src/ui/touch-tuner';
import type { TunableParam } from '../../src/ui/param-list';

function param(over: Partial<TunableParam> = {}): TunableParam {
  return { slotIdx: 0, field: 'gainVal', label: 'gain', min: 0, max: 255, step: 1, scale: 'linear', value: 50, ...over };
}

// touch-type pointer event with a clientY (rollers + swipe are vertical).
function pe(type: string, clientY: number, target?: HTMLElement, pointerId = 1): Event {
  const Ctor = (globalThis as unknown as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
  const e = new Ctor(type, { clientY, bubbles: true, cancelable: true } as MouseEventInit);
  if (!('pointerType' in e)) Object.defineProperty(e, 'pointerType', { value: 'touch' });
  if (!('pointerId' in e)) Object.defineProperty(e, 'pointerId', { value: pointerId });
  if (target) Object.defineProperty(e, 'target', { value: target });
  return e;
}

let root: HTMLElement;
beforeEach(() => { document.body.innerHTML = ''; root = document.body; });

describe('touch value tuner', () => {
  it('renders three rollers (±1 first, no ±1000) and the value', () => {
    openTouchTuner(root, { title: 'T', params: [param()], activeIndex: 0, apply: () => {}, sealUndo: () => {} });
    expect(root.querySelector('#touch-tuner-overlay')).not.toBeNull();
    expect((root.querySelector('[data-tt-value]') as HTMLElement).textContent).toBe('50');
    const steps = [...root.querySelectorAll('.tt-roller')].map((r) => (r as HTMLElement).dataset['step']);
    expect(steps).toEqual(['1', '10', '100']);              // ±1 first, ±1000 gone
  });

  it('lists the active slot\'s params as a phase, the selected one emphasised', () => {
    const freq = param({ slotIdx: 0, field: 'freqVal', label: 'freq', value: 1000, max: 10000 });
    const gain = param({ slotIdx: 0, field: 'gainVal', label: 'gain', value: 80, max: 128 });
    const cut = param({ slotIdx: 1, field: 'val1', label: 'cutoff', value: 16 });   // a different slot
    openTouchTuner(root, { title: 'T', params: [freq, gain, cut], activeIndex: 0, apply: () => {}, sealUndo: () => {} });
    const rows = [...root.querySelectorAll('.tt-prow')];
    expect(rows.map((r) => r.querySelector('.tt-prow-name')!.textContent)).toEqual(['freq', 'gain']); // slot 0 only
    expect(rows[0]!.classList.contains('active')).toBe(true);
  });

  it('dragging the ±10 roller up steps by notches × 10 and seals one undo', () => {
    const apply = vi.fn();
    const sealUndo = vi.fn();
    const t = openTouchTuner(root, { title: 'T', params: [param({ value: 50 })], activeIndex: 0, apply, sealUndo });
    const roller = root.querySelector('.tt-roller[data-step="10"]') as HTMLElement;

    roller.dispatchEvent(pe('pointerdown', 100));
    roller.dispatchEvent(pe('pointermove', 100 - (PX_PER_NOTCH * 2 + 6)));   // 2 notches
    expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({ field: 'gainVal' }), 70);
    expect(t.value()).toBe(70);
    expect(sealUndo).not.toHaveBeenCalled();
    roller.dispatchEvent(pe('pointerup', 100 - (PX_PER_NOTCH * 2 + 6)));
    expect(sealUndo).toHaveBeenCalledTimes(1);
  });

  it('clamps at max, reading the value absolutely from the drag start', () => {
    const t = openTouchTuner(root, { title: 'T', params: [param({ value: 250 })], activeIndex: 0, apply: () => {}, sealUndo: () => {} });
    const roller = root.querySelector('.tt-roller[data-step="10"]') as HTMLElement;
    roller.dispatchEvent(pe('pointerdown', 200));
    roller.dispatchEvent(pe('pointermove', 200 - PX_PER_NOTCH * 5));
    expect(t.value()).toBe(255);
  });

  it('swiping the phase up moves to the next param; crossing slots fires onActiveChange', () => {
    const freq = param({ slotIdx: 0, field: 'freqVal', label: 'freq', value: 1000, max: 10000 });
    const cut = param({ slotIdx: 1, field: 'val1', label: 'cutoff', value: 16 });
    const onActiveChange = vi.fn();
    const t = openTouchTuner(root, { title: 'T', params: [freq, cut], activeIndex: 0, apply: () => {}, sealUndo: () => {}, onActiveChange });
    expect(onActiveChange).toHaveBeenLastCalledWith(0);       // initial sync to slot 0

    const phase = root.querySelector('[data-tt-phase]') as HTMLElement;
    phase.dispatchEvent(pe('pointerdown', 200));
    phase.dispatchEvent(pe('pointerup', 200 - (SWIPE_PX_PER_PARAM + 6)));   // up one param → slot 1
    expect(t.index()).toBe(1);
    expect(onActiveChange).toHaveBeenLastCalledWith(1);       // selected phase followed
  });

  it('tapping a phase row selects that param', () => {
    const freq = param({ slotIdx: 0, field: 'freqVal', label: 'freq', value: 1000, max: 10000 });
    const gain = param({ slotIdx: 0, field: 'gainVal', label: 'gain', value: 80, max: 128 });
    const t = openTouchTuner(root, { title: 'T', params: [freq, gain], activeIndex: 0, apply: () => {}, sealUndo: () => {} });
    const phase = root.querySelector('[data-tt-phase]') as HTMLElement;
    const gainRow = root.querySelectorAll('.tt-prow')[1] as HTMLElement;
    phase.dispatchEvent(pe('pointerdown', 100));
    phase.dispatchEvent(pe('pointerup', 100, gainRow));      // no movement → tap on the gain row
    expect(t.index()).toBe(1);
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
