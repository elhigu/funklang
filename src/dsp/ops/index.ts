// Op-code → implementation map. Extended as more ops are ported.
// See funklang/docs/dsp-reference.md §4 for the canonical op table.

import type { OpFn } from '../types';
import { op_vol } from './vol';
import { op_osc_saw } from './osc_saw';
import { op_osc_sine } from './osc_sine';
import { op_osc_noise } from './osc_noise';
import { op_add } from './add';
import { op_mul } from './mul';

export const OPS: Record<number, OpFn> = {
  1: op_vol,
  2: op_osc_saw,
  4: op_osc_sine,
  6: op_osc_noise,
  9: op_add,
  10: op_mul,
};
