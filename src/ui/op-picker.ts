// Modal op-code picker. Resolves to chosen op code or null on cancel.
// The list of available ops + their human-readable names + category grouping
// all come from OP_DEFS (single source of truth) so adding/renaming an op
// only requires an op-metadata.ts edit.

import { OP_DEFS } from '../schema/op-metadata';
import type { OpDef } from '../schema/op-metadata';
import { fmtBytes } from './format';

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

/** Optional per-op add-cost (bytes this op adds to the CURRENT patch). When the
 *  op is already used elsewhere its shared routine is already paid, so it's cheaper. */
export interface OpAddCost { cost: number; alreadyPresent: boolean }

/** `costOf` is resolved LAZILY on hover/focus (each call assembles a variant of
 *  the patch), so the picker opens instantly and only the op you look at gets
 *  priced. Resolve to null when the op can't be assembled into the patch.
 *  `disabledOf` greys an op out in the current context: return a reason string
 *  (shown as the card's tooltip) to disable it, or null to allow it. */
export function pickOp(
  costOf?: (op: number) => Promise<OpAddCost | null>,
  disabledOf?: (op: number) => string | null,
): Promise<number | null> {
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

    // One description strip at the bottom of the modal, updated as the user
    // hovers / focuses a card. Keeping descriptions OUT of the cards means
    // every card is a uniform single-line height — no more one tall card
    // (ctrl's long blurb) stretching its whole grid row.
    const detail = document.createElement('div');
    detail.className = 'op-picker-detail';
    const DETAIL_HINT = 'Hover an operator for details.';
    detail.textContent = DETAIL_HINT;
    const showDetail = (def: OpDef): void => {
      detail.textContent = def.description ? `${def.name} — ${def.description}` : def.name;
    };

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
        // Context disable (e.g. loop_gen when one already exists / this isn't
        // the last slot). Unsupported ops are always disabled.
        const disabledReason = def.unsupported ? null : (disabledOf?.(def.code) ?? null);
        const isDisabled = def.unsupported || disabledReason != null;
        // Exact add-cost, computed lazily the first time this op is hovered/
        // focused (each lookup assembles a variant of the patch). Until then the
        // slot is blank; while assembling it spins.
        let loadCost: (() => void) | null = null;
        if (costOf && !isDisabled) {
          const cost = document.createElement('span');
          cost.className = 'op-picker-cost';
          btn.appendChild(cost);
          let started = false;
          loadCost = (): void => {
            if (started) return;
            started = true;
            cost.classList.add('size-spin');
            cost.textContent = '⟳';
            void costOf(def.code)
              .then((c) => {
                cost.classList.remove('size-spin');
                if (!c) { cost.textContent = ''; return; }
                cost.textContent = `+${fmtBytes(c.cost)}${c.alreadyPresent ? ' · shared' : ''}`;
                cost.title = c.alreadyPresent
                  ? 'This op is already used in the patch — only its per-use connection code is added.'
                  : 'Adds this op’s code + one use.';
              })
              .catch(() => { cost.classList.remove('size-spin'); cost.textContent = ''; });
          };
        }
        if (def.description) {
          // Carried for the detail strip + as a native tooltip fallback.
          btn.dataset['opDesc'] = def.description;
          btn.title = def.description;
        }
        if (isDisabled) {
          btn.disabled = true;
          btn.classList.add('op-picker-card-unsupported');
          if (disabledReason) btn.title = disabledReason;
        }
        btn.addEventListener('mouseenter', () => { showDetail(def); loadCost?.(); });
        btn.addEventListener('focus', () => { showDetail(def); loadCost?.(); });
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (isDisabled) return;   // disabled cards are never selectable
          done(def.code);
        });
        grid.appendChild(btn);
      }
      sect.appendChild(grid);
      inner.appendChild(sect);
    }
    inner.appendChild(detail);
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
