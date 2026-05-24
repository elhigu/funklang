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
    // adsr: per-slot envelope state — clr_buf zeros these per-instrument.
    ADSR_Mode: new Int16Array(N_SLOTS_MAX),
    ADSR_Value: new Int32Array(N_SLOTS_MAX),
    ADSR_SustainCounter: new Int32Array(N_SLOTS_MAX),
    // filterBuffer: 4 shorts per slot (lpf, hpf, bpf, pole) — zeroed by clr_buf.
    filterBuffer: new Int16Array(N_SLOTS_MAX * 4),
    // delay lines for dly_cyc / cmb_flt_n / reverb (24 channels × 2048).
    // C uses static `short buffern[24][2048]` zeroed in clr_buf per-instrument.
    buffern: new Int16Array(24 * 2048),
    // cmb_flt_n: function-local static `i[24]`. refrender invokes once per
    // process so these start at 0; mirror that with a fresh array per render.
    cmb_flt_n_i: new Int16Array(24),
    // dly_cyc: function-local static `i[16]`. Separate static from cmb_flt_n.
    dly_cyc_i: new Int16Array(N_SLOTS_MAX),
    // Engine fills this in per render so adsr can compute sustainTicks.
    sampleLength: 0,
    // Engine populates BEFORE per-tick loop with pre-rendered source bytes
    // for any instrument referenced by clone (17) / chordgen (18) slots.
    cloneBuffers: new Map<number, Int8Array>(),
    // Engine fills with reference to patch.importedSamples for op 20.
    importedSamples: [],
  };
}
