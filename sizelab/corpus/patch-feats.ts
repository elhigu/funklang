// Reduce a patch to the per-slot descriptors the fitter needs, so measurements.csv
// is self-contained (the .akp files are gitignored / regenerable scratch — the
// fitter must not depend on them).
import type { Patch } from '../../src/patch/types';
import { slotVarOperands } from '../../src/sizecalc/code-size';
import type { PhaseDesc } from './corpus-spec';

/** One PhaseDesc per op slot (fn !== 0); mode encodes the variable-operand count
 *  as that many 'V's (so nVarOperands = Σ 'V' counts, like the synthetic rows). */
export function patchToMeasured(patch: Patch): PhaseDesc[] {
  const out: PhaseDesc[] = [];
  for (const ins of patch.instruments) {
    for (const s of ins.slots) {
      if (s.fn === 0) continue;
      const v = slotVarOperands(s);
      out.push({ op: s.fn, mode: v > 0 ? 'V'.repeat(v) : '-' });
    }
  }
  return out;
}
