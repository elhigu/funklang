import type { Patch } from '../patch/types';
import { isInstrumentValid } from '../patch/validation';

export interface SidebarHandlers {
  onPick: (i: number) => void;
  /** User clicked the row's hover-revealed ✕ button. The host runs a
   *  confirmation dialog and then resets the instrument. */
  onDelete?: ((i: number) => void) | undefined;
}

export function renderSidebar(
  root: HTMLElement,
  patch: Patch,
  activeIdx: number,
  handlers: SidebarHandlers,
): void {
  root.innerHTML = '';
  let activeRow: HTMLLIElement | null = null;
  for (let i = 0; i < patch.instruments.length; i++) {
    const ins = patch.instruments[i]!;
    // Count filled (non-empty) slots — the editor hides op0 rows entirely,
    // so an instrument whose array holds only empty slots should look empty
    // in the sidebar too.
    const filled = ins.slots.reduce((n, s) => n + (s.fn !== 0 ? 1 : 0), 0);
    // Validation only applies to instruments with any filled slots: an
    // empty instrument has nothing to be wrong with.
    const invalid = filled > 0 && !isInstrumentValid(patch, i);
    const li = document.createElement('li');
    const isActive = i === activeIdx;
    li.className = 'instr-row' +
      (filled === 0 ? ' empty' : '') +
      (invalid ? ' invalid' : '') +
      (isActive ? ' active' : '');
    if (invalid) li.title = 'This instrument has unwired or invalid inputs — see red dropdowns inside.';
    const delBtn = filled > 0 && handlers.onDelete
      ? `<button class="instr-del" data-instr-del title="Reset this instrument">✕</button>`
      : '';
    li.innerHTML =
      `<span class="num">${String(i + 1).padStart(2, '0')}</span>` +
      `<span class="name">${ins.name || '—'}</span>` +
      delBtn;
    // Empty rows are now clickable too — selecting one is how the user
    // says "I want to start a new instrument here". The slot-grid renders
    // an empty-state placeholder with a [+] button for that case.
    li.addEventListener('click', (e) => {
      // Don't treat a click on the ✕ button as a row pick.
      if ((e.target as HTMLElement).closest('[data-instr-del]')) return;
      handlers.onPick(i);
    });
    const del = li.querySelector('[data-instr-del]') as HTMLButtonElement | null;
    if (del) {
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        handlers.onDelete?.(i);
      });
    }
    root.appendChild(li);
    if (isActive) activeRow = li;
  }

  // If the active row is off-screen in the scrollable list, scroll it back
  // into view. `block: 'nearest'` is a no-op when it's already visible, so
  // we don't jitter on every repaint.
  if (activeRow) {
    activeRow.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}
