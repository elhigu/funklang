import type { Slot } from '../../src/patch/types';
import { opByCode } from '../../src/schema/op-metadata';

export interface VocParam { selector: keyof Slot; value: keyof Slot; }

export function varOrConstParams(opCode: number): VocParam[] {
  const def = opByCode(opCode);
  if (!def) return [];
  const out: VocParam[] = [];
  for (const p of def.params) {
    if (p.type.kind === 'var-or-const' && p.selector) out.push({ selector: p.selector, value: p.field });
  }
  return out;
}

export function varSourceParams(opCode: number): Array<keyof Slot> {
  const def = opByCode(opCode);
  if (!def) return [];
  return def.params.filter((p) => p.type.kind === 'var-source').map((p) => p.field);
}

export function modesFor(opCode: number): boolean[][] {
  const n = varOrConstParams(opCode).length;
  if (n === 0) return [[]];
  const modes: boolean[][] = [new Array(n).fill(false)];
  for (let i = 0; i < n; i++) { const m = new Array(n).fill(false); m[i] = true; modes.push(m); }
  if (n > 1) modes.push(new Array(n).fill(true));
  return modes;
}

export const modeId = (m: boolean[]): string => (m.length ? m.map((v) => (v ? 'V' : 'c')).join('') : '-');
