// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PatchModel } from '../../src/patch/model';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import { renderInstrHeader } from '../../src/ui/instr-header';

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('div');
  document.body.appendChild(root);
});

function populate(model: PatchModel): void {
  const ins = model.patch.instruments[0]!;
  ins.name = 'A';
  ins.sampleLength = 1024;
  ins.slots.push({ ...emptySlot(), fn: 2, outVar: 1, freqVal: 1000, gainVal: 80 });
}

describe('instr-header — REMOVE button', () => {
  it('renders a REMOVE button next to IMPORT / EXPORT .AKI', () => {
    const model = new PatchModel(emptyPatch());
    populate(model);
    renderInstrHeader(root, model, 0, { onRemove: () => {} });
    const remove = root.querySelector('[data-id=instr-remove]') as HTMLButtonElement;
    expect(remove).not.toBeNull();
    expect(remove.disabled).toBe(false);
  });

  it('calls onRemove when clicked (host runs confirm + reset)', () => {
    const cb = vi.fn();
    const model = new PatchModel(emptyPatch());
    populate(model);
    renderInstrHeader(root, model, 0, { onRemove: cb });
    (root.querySelector('[data-id=instr-remove]') as HTMLButtonElement).click();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('disables REMOVE on an untouched instrument (nothing to remove)', () => {
    const model = new PatchModel(emptyPatch());        // ins 0 = empty
    renderInstrHeader(root, model, 0, { onRemove: () => {} });
    const remove = root.querySelector('[data-id=instr-remove]') as HTMLButtonElement;
    expect(remove.disabled).toBe(true);
  });
});

describe('instr-header — length knob', () => {
  it('shows the .length-pair host with a disabled knob on an untouched instrument', () => {
    const model = new PatchModel(emptyPatch());
    renderInstrHeader(root, model, 0);
    const lenHost = root.querySelector('.length-pair') as HTMLElement;
    expect(lenHost.classList.contains('disabled')).toBe(true);
    const knob = lenHost.querySelector('.knob') as HTMLElement;
    expect(knob).not.toBeNull();
    expect(knob.classList.contains('knob-disabled')).toBe(true);
  });

  it('renders an interactive length knob once the instrument has a slot', () => {
    const model = new PatchModel(emptyPatch());
    populate(model);
    renderInstrHeader(root, model, 0);
    const lenHost = root.querySelector('.length-pair') as HTMLElement;
    expect(lenHost.classList.contains('disabled')).toBe(false);
    const knob = lenHost.querySelector('.knob') as HTMLElement;
    expect(knob).not.toBeNull();
    expect(knob.classList.contains('knob-disabled')).toBe(false);
    // The current value is rendered in the .kval span.
    const kval = knob.querySelector('.kval') as HTMLElement;
    expect(kval.textContent).toBe('1024');
  });
});
