// Per-render DSP state. See `clr_buf()` in exe_creator/synthnodes.h.
//
// The C synth uses size-16 arrays indexed by slot index (or by `instance`
// for reverb's internal channels). We allocate N_SLOTS_MAX entries — the
// file format allows up to 20 slots — to be safe.

import type { OpState } from './types';
import { N_SLOTS_MAX } from '../patch/types';

export function newOpState(): OpState {
  return {
    counter_saw: new Int16Array(N_SLOTS_MAX),
    counter_tri: new Int16Array(N_SLOTS_MAX),
    counter_sine: new Int16Array(N_SLOTS_MAX),
    counter_pulse: new Int16Array(N_SLOTS_MAX),
    counter_sh: new Int16Array(N_SLOTS_MAX),
    buffer_sh: new Int16Array(N_SLOTS_MAX),
    // osc_noise LFSR seeds — verbatim from synthnodes.h line 79.
    noise_x1: 0x67452301 | 0,
    noise_x2: 0xefcdab89 | 0,
    noise_x3: 0,
  };
}
