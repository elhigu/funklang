// Randomize an op slot's constant argument values to distinct, in-range numbers.
//
// Critical for the corpus: real patches give every slot different parameter
// values, so the compiler can't fold them. If corpus slots share identical args
// (emptySlot defaults), whole-program LTO collapses repeated calls into loops and
// a 190-slot patch compiles to ~1.6 kB instead of the realistic ~16 kB — teaching
// the size model that slots are nearly free. Distinct args prevent that.
import { opByCode } from '../../src/schema/op-metadata';
import type { Slot } from '../../src/patch/types';

const randInt = (min: number, max: number, rand: () => number): number =>
  Math.round(min + rand() * (max - min));

export function randomizeSlotArgs(s: Slot, rand: () => number): void {
  const def = opByCode(s.fn);
  if (!def) return;
  for (const p of def.params) {
    const t = p.type;
    if (t.kind === 'var-or-const') {
      // only randomize the literal value when this operand is in CONST mode
      const sel = p.selector;
      if (!sel || (s[sel] as number) === 0) (s as unknown as Record<string, number>)[p.field] = randInt(t.min, t.max, rand);
    } else if (t.kind === 'const-int') {
      (s as unknown as Record<string, number>)[p.field] = randInt(t.min, t.max, rand);
    }
  }
}

/** Randomize every op slot (fn !== 0) across a patch's instruments in place. */
export function randomizePatchArgs(instruments: { slots: Slot[] }[], rand: () => number): void {
  for (const ins of instruments) for (const s of ins.slots) if (s.fn !== 0) randomizeSlotArgs(s, rand);
}
