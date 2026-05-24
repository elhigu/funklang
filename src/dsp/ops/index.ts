// Op-code → implementation map. Extended as more ops are ported.
// See funklang/docs/dsp-reference.md §4 for the canonical op table.

import type { OpFn } from '../types';
import { op_vol } from './vol';
import { op_osc_saw } from './osc_saw';
import { op_osc_tri } from './osc_tri';
import { op_osc_sine } from './osc_sine';
import { op_osc_pulse } from './osc_pulse';
import { op_osc_noise } from './osc_noise';
import { op_add } from './add';
import { op_mul } from './mul';
import { op_ctrl } from './ctrl';
import { op_distortion } from './distortion';
import { op_sh } from './sh';

export const OPS: Record<number, OpFn> = {
  1: op_vol,
  2: op_osc_saw,
  3: op_osc_tri,
  4: op_osc_sine,
  5: op_osc_pulse,
  6: op_osc_noise,
  9: op_add,
  10: op_mul,
  14: op_ctrl,
  16: op_distortion,
  19: op_sh,
};
