// @vitest-environment jsdom
//
// Unit coverage for the sidebar's drag-and-drop drop-target index math —
// the one piece of reorder logic that lives in the sidebar (not the
// model) and that the instrument-reorder E2E bypasses by calling
// moveInstrument directly. We drive synthetic drop events with a stubbed
// dataTransfer + clientY so we can assert the exact (from, to) the
// handler computes.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import type { Patch } from '../../src/patch/types';
import { renderSidebar } from '../../src/ui/sidebar';

let root: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  root = document.createElement('ul');
  document.body.appendChild(root);
  // jsdom doesn't implement scrollIntoView; renderSidebar calls it to keep
  // the active row visible.
  Element.prototype.scrollIntoView = (): void => {};
});

function patch3(): Patch {
  const p = emptyPatch();
  for (let i = 0; i < 3; i++) {
    p.instruments[i]!.name = `I${i}`;
    p.instruments[i]!.slots.push({ ...emptySlot(), fn: 2, outVar: 1 });
  }
  return p;
}

/** Stub a fixed 20px-tall rect at y=0 so the Y-midpoint maths is predictable. */
function mockRect(row: Element): void {
  (row as HTMLElement).getBoundingClientRect = () => ({
    left: 0, top: 0, right: 200, bottom: 20, width: 200, height: 20, x: 0, y: 0, toJSON: () => '',
  }) as DOMRect;
}

/** Dispatch a synthetic `drop` on `row` carrying `fromIdx`, dropping in the
 *  top or bottom half (controls the above/below decision). */
function drop(row: Element, fromIdx: number, half: 'top' | 'bottom'): void {
  mockRect(row);
  const evt = new Event('drop', { bubbles: true, cancelable: true });
  (evt as unknown as { dataTransfer: { getData: (t: string) => string } }).dataTransfer = {
    getData: () => String(fromIdx),
  };
  // top half → clientY 5 (< height/2=10 → above); bottom half → clientY 15.
  (evt as unknown as { clientY: number }).clientY = half === 'top' ? 5 : 15;
  row.dispatchEvent(evt);
}

describe('sidebar drag-and-drop reorder', () => {
  it('only populated rows are drag sources; empty rows are not draggable', () => {
    renderSidebar(root, patch3(), 0, { onPick: () => {}, onMove: () => {} });
    const rows = root.querySelectorAll('.instr-row');
    expect((rows[0] as HTMLElement).draggable).toBe(true);   // populated
    expect((rows[2] as HTMLElement).draggable).toBe(true);   // populated
    expect((rows[3] as HTMLElement).draggable).toBe(false);  // empty
  });

  it('drop onto the BOTTOM half of a later row moves there (with the to>from decrement)', () => {
    const onMove = vi.fn();
    renderSidebar(root, patch3(), 0, { onPick: () => {}, onMove });
    // Drag row 0, drop on bottom half of row 2 → to=3, to>from so to-=1 → 2.
    drop(root.querySelectorAll('.instr-row')[2]!, 0, 'bottom');
    expect(onMove).toHaveBeenCalledWith(0, 2);
  });

  it('drop onto the TOP half of an earlier row moves before it (no decrement)', () => {
    const onMove = vi.fn();
    renderSidebar(root, patch3(), 0, { onPick: () => {}, onMove });
    // Drag row 2, drop on top half of row 0 → to=0, to<from so no decrement.
    drop(root.querySelectorAll('.instr-row')[0]!, 2, 'top');
    expect(onMove).toHaveBeenCalledWith(2, 0);
  });

  it('dropping onto self (either half) is a no-op', () => {
    const onMove = vi.fn();
    renderSidebar(root, patch3(), 0, { onPick: () => {}, onMove });
    const row1 = root.querySelectorAll('.instr-row')[1]!;
    drop(row1, 1, 'top');     // to=1, from===to → return
    drop(row1, 1, 'bottom');  // to=2, from===to-1 → return
    expect(onMove).not.toHaveBeenCalled();
  });

  it('an empty row is a valid drop TARGET (can move an instrument onto a gap)', () => {
    const onMove = vi.fn();
    renderSidebar(root, patch3(), 0, { onPick: () => {}, onMove });
    // Drag row 0, drop on top half of row 4 (empty) → to=4, to>from → 3.
    drop(root.querySelectorAll('.instr-row')[4]!, 0, 'top');
    expect(onMove).toHaveBeenCalledWith(0, 3);
  });

  it('no drag wiring at all when onMove is not supplied', () => {
    renderSidebar(root, patch3(), 0, { onPick: () => {} });
    const row0 = root.querySelectorAll('.instr-row')[0] as HTMLElement;
    expect(row0.draggable).toBe(false);
    // A drop with no handler should not throw.
    expect(() => drop(row0, 0, 'bottom')).not.toThrow();
  });
});
