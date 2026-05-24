// Modal op-code picker. Resolves to chosen op code or null on cancel.
// Op-code → name map sourced from funklang/docs/dsp-reference.md §4.

export const OP_NAME: Record<number, string> = {
  1: 'vol',
  2: 'osc_saw',
  3: 'osc_tri',
  4: 'osc_sine',
  5: 'osc_pulse',
  6: 'osc_noise',
  7: 'enva',
  8: 'envd',
  9: 'add',
  10: 'mul',
  11: 'dly_cyc',
  12: 'cmb_flt_n',
  13: 'reverb',
  14: 'ctrl',
  15: 'sv_flt_n',
  16: 'distortion',
  17: 'clone',
  18: 'chordgen',
  19: 'sh',
  20: 'imported',
  21: 'onepole_flt',
  23: 'adsr',
  24: 'vocoder',
};

interface OpGroup {
  title: string;
  codes: number[];
}

const GROUPS: OpGroup[] = [
  { title: 'Oscillators', codes: [2, 3, 4, 5, 6] },
  { title: 'Mix', codes: [9, 10] },
  { title: 'Envelopes', codes: [7, 8, 23] },
  { title: 'Filters', codes: [15, 21, 12] },
  { title: 'FX', codes: [13, 11, 16, 19, 18] },
  { title: 'Control', codes: [1, 14] },
  { title: 'Cross', codes: [17, 20] },
];

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
    for (const g of GROUPS) {
      const sect = document.createElement('div');
      sect.className = 'op-picker-group';
      sect.innerHTML = `<div class="op-picker-group-title">${g.title}</div>`;
      const grid = document.createElement('div');
      grid.className = 'op-picker-grid';
      for (const code of g.codes) {
        const btn = document.createElement('button');
        btn.className = 'op-picker-btn';
        btn.textContent = OP_NAME[code] ?? `op${code}`;
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          done(code);
        });
        grid.appendChild(btn);
      }
      sect.appendChild(grid);
      inner.appendChild(sect);
    }
    overlay.appendChild(inner);
    inner.addEventListener('click', (e) => e.stopPropagation());
    overlay.addEventListener('click', () => done(null));
    document.addEventListener('keydown', onKey);
    document.body.appendChild(overlay);
  });
}
