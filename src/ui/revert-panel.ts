// REVERT AUTOSAVE side panel: browse localStorage autosave snapshots and
// restore one. Extracted from app.ts — the panel owns all of its own UI
// (open/close, the snapshot list, highlight, keyboard / wheel / click-
// outside browsing). The one piece it does NOT own is APPLYING a restored
// patch to the editor (that mutates activeIdx / selection / render), which
// the host passes in as `onRestore`.

import { listAutosaves, restoreAutosave, saveAutosave, type AutosaveEntry } from './autosave';
import type { Patch } from '../patch/types';

export interface RevertPanelDeps {
  /** The live patch to snapshot to the top of the list when the panel
   *  opens — the user's "I can always get back here" anchor. */
  getPatch: () => Patch;
  /** Apply a restored patch to the editor. The host owns activeIdx /
   *  selection / output / render, so it does the reset + repaint + play. */
  onRestore: (patch: Patch) => void;
}

export interface RevertPanel {
  open(): void;
  close(): void;
  isOpen(): boolean;
}

/**
 * Wire the REVERT AUTOSAVE panel. Call once after the root template (which
 * must contain `#revert-panel`, `#revert-list`, `#revert-close`,
 * `#btn-revert`) is in the DOM.
 */
export function wireRevertPanel(root: HTMLElement, deps: RevertPanelDeps): RevertPanel {
  const panel = root.querySelector('#revert-panel') as HTMLElement;
  const list = root.querySelector('#revert-list') as HTMLElement;
  const closeBtn = root.querySelector('#revert-close') as HTMLButtonElement;
  const openBtn = root.querySelector('#btn-revert') as HTMLButtonElement;

  let entries: AutosaveEntry[] = [];

  const isOpen = (): boolean => !panel.classList.contains('hidden');
  const close = (): void => {
    panel.classList.add('hidden');
    panel.setAttribute('aria-hidden', 'true');
  };

  const restoreEntry = (i: number): void => {
    const entry = entries[i];
    if (!entry) return;
    try {
      deps.onRestore(restoreAutosave(entry));
    } catch (err) {
      console.error('Failed to restore autosave', err);
    }
  };

  const selectRow = (i: number): void => {
    const rows = Array.from(list.querySelectorAll('.revert-row')) as HTMLElement[];
    if (i < 0 || i >= rows.length) return;
    for (const r of rows) r.classList.remove('active');
    rows[i]!.classList.add('active');
    rows[i]!.scrollIntoView({ block: 'nearest' });
    restoreEntry(i);
  };

  /** Move the selection by ±1 and load that snapshot (so each step plays). */
  const step = (delta: number): void => {
    const rows = Array.from(list.querySelectorAll('.revert-row')) as HTMLElement[];
    if (rows.length === 0) return;
    const cur = Math.max(0, rows.findIndex((r) => r.classList.contains('active')));
    const next = Math.max(0, Math.min(rows.length - 1, cur + delta));
    if (next !== cur) selectRow(next);
  };

  const open = (): void => {
    // Snapshot CURRENT state to the top of the list before browsing — the
    // user-requested escape hatch so any preview can be rolled back.
    saveAutosave(deps.getPatch());
    entries = listAutosaves();
    list.innerHTML = '';
    entries.forEach((entry, i) => {
      const li = document.createElement('li');
      li.className = 'revert-row';
      // Highlight CURRENT (row 0) so there's a visible "I'm here" anchor.
      if (i === 0) li.classList.add('active');
      const ts = new Date(entry.timestamp);
      const labelLeft = i === 0 ? 'CURRENT' : `${i} ${i === 1 ? 'save' : 'saves'} ago`;
      li.innerHTML = `<span class="revert-label">${labelLeft}</span><span class="revert-time">${ts.toLocaleString()}</span>`;
      li.addEventListener('click', () => selectRow(i));
      list.appendChild(li);
    });
    panel.classList.remove('hidden');
    panel.setAttribute('aria-hidden', 'false');
  };

  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);

  // Keyboard browse (Up/Down) + Escape, only while open.
  document.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); step(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); step(-1); }
  });

  // Wheel scrolls the SELECTION (not the DOM) — spin through history.
  panel.addEventListener('wheel', (e) => {
    if (!isOpen()) return;
    e.preventDefault();
    step(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  // Click outside the panel (and not on the opening button) closes it.
  // mousedown so it dismisses the instant a stray editor click lands.
  document.addEventListener('mousedown', (e) => {
    if (!isOpen()) return;
    const t = e.target as Node;
    if (panel.contains(t) || openBtn.contains(t)) return;
    close();
  });

  return { open, close, isOpen };
}
