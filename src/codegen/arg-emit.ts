import type { Slot } from '../patch/types';

export const VARTEXT = ['', 'v1', 'v2', 'v3', 'v4'] as const;

export type ArgSpec =
  | { kind: 'instance' }
  | { kind: 'smp' }
  | { kind: 'zero' }
  | { kind: 'var'; field: keyof Slot }
  | { kind: 'varlit'; sel: keyof Slot; lit: keyof Slot }
  | { kind: 'raw'; field: keyof Slot }
  | { kind: 'baseadr'; field: keyof Slot };

function vartext(sel: number): string {
  return VARTEXT[sel] ?? '';
}

export function renderArg(slot: Slot, l: number, a: ArgSpec): string {
  switch (a.kind) {
    case 'instance': return String(l);
    case 'smp': return 'smp';
    case 'zero': return '0';
    case 'var': return vartext(slot[a.field] as number);
    case 'varlit': {
      const sel = slot[a.sel] as number;
      return sel > 0 ? vartext(sel) : String(slot[a.lit] as number);
    }
    case 'raw': return String(slot[a.field] as number);
    case 'baseadr': return `BaseAdr[${slot[a.field] as number}]`;
  }
}

export function renderArgs(slot: Slot, l: number, specs: ArgSpec[]): string {
  return specs.map((a) => renderArg(slot, l, a)).join(', ');
}
