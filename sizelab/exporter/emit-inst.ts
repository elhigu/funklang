import type { Patch, Slot } from '../../src/patch/types';
import { VARTEXT, renderArgs } from './arg-emit';
import { OP_ARGS } from './op-args';
import { emitClone, emitImported, emitAdsr } from './emit-inst-special';

/** 25-entry op-name table, Form1.cs line 41. 17 (clone) and 20 (imported) are
 *  blank because they emit a bare expression (prefix already opened a paren). */
export const OPNAME: string[] = [
  '', 'vol', 'osc_saw', 'osc_tri', 'osc_sine', 'osc_pulse', 'osc_noise',
  'enva', 'envd', 'add', 'mul', 'dly_cyc', 'cmb_flt_n', 'reverb', 'ctrl',
  'sv_flt_n', 'distortion', '', 'chordgen', 'sh', '', 'onepole_flt',
  '', 'adsr', 'vocoder',
];

function emitSlotArgs(slot: Slot, l: number, k: number, sampleLength: number): string {
  const fn = slot.fn;
  if (fn === 17) return emitClone(slot, k);
  if (fn === 20) return emitImported(slot);
  if (fn === 23) return emitAdsr(slot, l, sampleLength);
  const op = OP_ARGS[fn];
  if (!op) throw new Error(`unsupported op fn=${fn} (instrument ${k + 1}, slot ${l})`);
  if (op.errIfVal1Zero && slot.val1 === 0) {
    throw new Error(`Error in instrument ${k + 1}: ${OPNAME[fn]} requires a val1 variable`);
  }
  return renderArgs(slot, l, op.specs);
}

export function emitInst(patch: Patch): string {
  let s = '';
  for (let k = 0; k < 31; k++) {
    const ins = patch.instruments[k];
    if (!ins || ins.sampleLength <= 2) continue;
    s += `// ${ins.name}\r\n`;
    s += `if (instrument == ${k}) {\r\n`;
    for (let l = 0; l < 16; l++) {
      const slot = ins.slots[l];
      if (!slot || slot.outVar === 0 || slot.fn === 22) continue;
      const name = OPNAME[slot.fn] ?? '';
      s += `${VARTEXT[slot.outVar]} = ${name}(${emitSlotArgs(slot, l, k, ins.sampleLength)});\r\n`;
    }
    s += `}\r\n`;
  }
  return s;
}
