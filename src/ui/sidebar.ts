import type { Patch } from '../patch/types';
import { isInstrumentValid } from '../patch/validation';

export function renderSidebar(
  root: HTMLElement,
  patch: Patch,
  activeIdx: number,
  onPick: (i: number) => void,
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
    li.innerHTML =
      `<span class="num">${String(i + 1).padStart(2, '0')}</span>` +
      `<span class="name">${ins.name || '—'}</span>`;
    if (filled > 0) li.addEventListener('click', () => onPick(i));
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
