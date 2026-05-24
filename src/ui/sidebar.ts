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
    const li = document.createElement('li');
    li.className = 'instr-row' +
      (ins.slots.length === 0 ? ' empty' : '') +
      (i === activeIdx ? ' active' : '');
    li.innerHTML =
      `<span class="num">${String(i + 1).padStart(2, '0')}</span>` +
      `<span class="name">${ins.name || '—'}</span>`;
    if (ins.slots.length) li.addEventListener('click', () => onPick(i));
    root.appendChild(li);
  }
}
