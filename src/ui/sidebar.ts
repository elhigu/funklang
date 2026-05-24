import type { Patch } from '../patch/types';

export function renderSidebar(
  root: HTMLElement,
  patch: Patch,
  activeIdx: number,
  onPick: (i: number) => void,
): void {
  root.innerHTML = '';
  for (let i = 0; i < patch.instruments.length; i++) {
    const ins = patch.instruments[i]!;
    // Count filled (non-empty) slots — the editor hides op0 rows entirely,
    // so an instrument whose array holds only empty slots should look empty
    // in the sidebar too.
    const filled = ins.slots.reduce((n, s) => n + (s.fn !== 0 ? 1 : 0), 0);
    const li = document.createElement('li');
    li.className = 'instr-row' +
      (filled === 0 ? ' empty' : '') +
      (i === activeIdx ? ' active' : '');
    li.innerHTML =
      `<span class="num">${String(i + 1).padStart(2, '0')}</span>` +
      `<span class="name">${ins.name || '—'}</span>`;
    if (filled > 0) li.addEventListener('click', () => onPick(i));
    root.appendChild(li);
  }
}
