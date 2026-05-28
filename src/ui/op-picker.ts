// Modal op-code picker. Resolves to chosen op code or null on cancel.
// The list of available ops + their human-readable names + category grouping
// all come from OP_DEFS (single source of truth) so adding/renaming an op
// only requires an op-metadata.ts edit.

import { OP_DEFS } from '../dsp/op-metadata';
import type { OpDef } from '../dsp/op-metadata';

/** Backwards-compat lookup table — code → display name. */
export const OP_NAME: Record<number, string> = (() => {
  const out: Record<number, string> = {};
  for (const def of OP_DEFS) out[def.code] = def.name;
  return out;
})();

const CATEGORY_TITLES: Record<OpDef['category'], string> = {
  osc:    'Oscillators',
  mix:    'Mix',
  env:    'Envelopes',
  filter: 'Filters',
  fx:     'FX',
  ctrl:   'Control',
  cross:  'Cross-instrument',
};

// Preserve a stable display order for categories rather than walking OP_DEFS.
const CATEGORY_ORDER: OpDef['category'][] = [
  'osc', 'mix', 'env', 'filter', 'fx', 'ctrl', 'cross',
];

function groupedDefs(): Array<{ title: string; defs: OpDef[] }> {
  const groups = new Map<OpDef['category'], OpDef[]>();
  for (const def of OP_DEFS) {
    const arr = groups.get(def.category) ?? [];
    arr.push(def);
    groups.set(def.category, arr);
  }
  return CATEGORY_ORDER
    .map((c) => ({ title: CATEGORY_TITLES[c], defs: groups.get(c) ?? [] }))
    .filter((g) => g.defs.length > 0);
}

export function pickOp(): Promise<number | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'op-picker-overlay';
    let resolved = false;
    const done = (code: number | null): void => {
      if (resolved) return;
      resolved = true;
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(code);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') done(null);
    };

    const inner = document.createElement('div');
    inner.className = 'op-picker';
    inner.innerHTML = `<div class="op-picker-title">PICK OPERATOR</div>`;
    for (const g of groupedDefs()) {
      const sect = document.createElement('div');
      sect.className = 'op-picker-group';
      const titleEl = document.createElement('div');
      titleEl.className = 'op-picker-group-title';
      titleEl.textContent = g.title;
      sect.appendChild(titleEl);
      const grid = document.createElement('div');
      grid.className = 'op-picker-grid';
      for (const def of g.defs) {
        const btn = document.createElement('button');
        btn.className = 'op-picker-btn';
        btn.setAttribute('data-op-code', String(def.code));
        const nameEl = document.createElement('span');
        nameEl.className = 'op-picker-name';
        nameEl.textContent = def.name;
        btn.appendChild(nameEl);
        if (def.description) {
          const descEl = document.createElement('span');
          descEl.className = 'op-picker-desc';
          descEl.textContent = def.description;
          btn.appendChild(descEl);
        }
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          done(def.code);
        });
        grid.appendChild(btn);
      }
      sect.appendChild(grid);
      inner.appendChild(sect);
    }
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'op-picker-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      done(null);
    });
    inner.appendChild(cancelBtn);
    overlay.appendChild(inner);
    inner.addEventListener('click', (e) => e.stopPropagation());
    overlay.addEventListener('click', () => done(null));
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
  });
}
