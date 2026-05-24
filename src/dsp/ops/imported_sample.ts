// Op 20 — imported sample (inline expression; NOT in synthnodes.h).
// Form1.cs emits something like:
//
//   out = (smp < ImpLength[gain]) ? (*(BYTE*)(BaseImpAdr[gain] + smp)) << 8 : 0;
//
// And see Form1.cs ~line 1353-1356 (preview path):
//   variable[arrayvar[instr, i]] = (short)(importedsample[smp, arraygain[instr, i]] << 8);
//
// Source: dsp-reference.md §6 / refrender.c case 20 lines 509-518.
//
// Args:
//   imp = slot.gain      (import index 0..7)
//   smp = current tick t
//
// Returns the imported byte at offset `smp` sign-extended into the high
// byte of a short, or 0 if the import is missing or the index is out of
// range. NOTE: refrender reads imports[imp].data after delta-decode;
// however .akp stores RAW bytes (Form1 does NOT delta-encode on save —
// only the .raw export does), so refrender was patched to NOT delta-
// decode either. The JS engine just reads `patch.importedSamples[imp].data`
// directly.

import type { OpFn } from '../types';
import { toI16 } from './_helpers';

export const op_imported_sample: OpFn = (state, _slotIdx, _vars, slot, t) => {
  const imp = slot.gain;
  const samp = state.importedSamples[imp];
  if (!samp) return 0;
  const data = samp.data;
  if (t < 0 || t >= data.length) return 0;
  return toI16(data[t]! << 8);
};
