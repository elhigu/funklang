// @vitest-environment jsdom
//
// The knob bar uses pointer events: mouse/pen drag the value directly, while
// a finger (pointerType 'touch') with an onTouchTune hook opens the tuner
// instead of fighting a 22px bar. Without the hook, touch falls through to
// the normal drag (graceful default).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeKnob } from '../../src/ui/knob';

// Robust pointerdown across jsdom versions (PointerEvent may be absent).
function pointerDown(init: { pointerType: string; clientX?: number; button?: number }): Event {
  const Ctor = (globalThis as unknown as { PointerEvent?: typeof MouseEvent }).PointerEvent ?? MouseEvent;
  const e = new Ctor('pointerdown', { bubbles: true, cancelable: true, clientX: init.clientX ?? 0, button: init.button ?? 0 });
  if (!('pointerType' in e)) Object.defineProperty(e, 'pointerType', { value: init.pointerType });
  if (!('pointerId' in e)) Object.defineProperty(e, 'pointerId', { value: 1 });
  return e;
}

function mountKnob(opts: Partial<Parameters<typeof makeKnob>[0]> = {}) {
  const onChange = vi.fn();
  const onTouchTune = vi.fn();
  const knob = makeKnob({ label: '', min: 0, max: 100, value: 0, onChange, onTouchTune, ...opts });
  document.body.appendChild(knob.el);
  const bar = knob.el.querySelector('.kbar') as HTMLElement;
  // jsdom gives a zero-size rect; stub a real one so X→value maps.
  bar.getBoundingClientRect = () => ({ left: 0, width: 100, top: 0, height: 22, right: 100, bottom: 22, x: 0, y: 0, toJSON() {} });
  return { knob, bar, onChange, onTouchTune };
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('knob pointer handling', () => {
  it('a mouse press drags the value (X → value), not the tuner', () => {
    const { bar, onChange, onTouchTune } = mountKnob();
    bar.dispatchEvent(pointerDown({ pointerType: 'mouse', clientX: 50 }));
    expect(onChange).toHaveBeenCalledWith(50);
    expect(onTouchTune).not.toHaveBeenCalled();
  });

  it('a finger press opens the tuner and does NOT change the value', () => {
    const { bar, onChange, onTouchTune } = mountKnob();
    bar.dispatchEvent(pointerDown({ pointerType: 'touch', clientX: 50 }));
    expect(onTouchTune).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('without an onTouchTune hook, touch falls through to a normal drag', () => {
    const { bar, onChange } = mountKnob({ onTouchTune: undefined });
    bar.dispatchEvent(pointerDown({ pointerType: 'touch', clientX: 25 }));
    expect(onChange).toHaveBeenCalledWith(25);
  });
});
