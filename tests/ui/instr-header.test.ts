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

describe('instr-header — length controls', () => {
  it('disables length number + slider when the instrument is untouched', () => {
    const model = new PatchModel(emptyPatch());
    renderInstrHeader(root, model, 0);
    const lenEl   = root.querySelector('[data-id=instr-len]')        as HTMLInputElement;
    const slideEl = root.querySelector('[data-id=instr-len-slider]') as HTMLInputElement;
    expect(lenEl.disabled).toBe(true);
    expect(slideEl.disabled).toBe(true);
  });

  it('enables length controls once the instrument has a slot', () => {
    const model = new PatchModel(emptyPatch());
    populate(model);
    renderInstrHeader(root, model, 0);
    const lenEl   = root.querySelector('[data-id=instr-len]')        as HTMLInputElement;
    const slideEl = root.querySelector('[data-id=instr-len-slider]') as HTMLInputElement;
    expect(lenEl.disabled).toBe(false);
    expect(slideEl.disabled).toBe(false);
  });
});
