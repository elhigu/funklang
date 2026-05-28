// Op metadata registry — single source of truth for the editor's per-op
// parameter UI. Schemas are derived from Form1.cs's `selectGroupBox` and
// `TextBoxTranslateInst` switch statements (the GUI's edit-panel handlers
// and the C codegen, respectively) and cross-checked against the C op
// signatures in exe_creator/synthnodes.h and the JS ports in
// funklang/src/dsp/ops/*.ts.
//
// Ranges come straight from the corresponding `hScrollBarXxx.Maximum/Minimum`
// init lines in Form1.cs.

import type { Slot } from '../patch/types';

/**
 * `ParamKind` describes how a single editor control reads/writes one or two
 * slot fields. A `var-or-const` param uses TWO fields: the `selector` field
 * (0 = "use literal", 1..4 = "use vN") and the `field` (the literal value).
 */
export type ParamKind =
  | { kind: 'const-int';    min: number; max: number; label: string; scale?: 'linear' | 'pow' }
  | { kind: 'var-source';   label: string; allowNone?: boolean }
  | { kind: 'var-or-const'; min: number; max: number; label: string; scale?: 'linear' | 'pow' }
  | { kind: 'enum';         options: ReadonlyArray<{ value: number; label: string }>; label: string }
  | { kind: 'instr-ref';    label: string }
  | { kind: 'sample-ref';   label: string };

export interface ParamDef {
  /** Slot field this control reads/writes the *value* into. */
  field: keyof Slot;
  /**
   * For `var-or-const`: companion field that encodes "is it a variable
   * reference?". When `selector` is 0 the literal `field` value is used; when
   * 1..4 the variable v1..v4 is used instead and `field` is ignored at render.
   *
   * Matches Form1's convention: `arrayfrequency`/`arrayfrequencyval`,
   * `arraygain`/`arraygainval`, `arrayval2`/`arrayval2value`, etc.
   */
  selector?: keyof Slot;
  type: ParamKind;
}

export interface OpDef {
  code: number;
  name: string;
  category: 'osc' | 'mix' | 'env' | 'filter' | 'fx' | 'ctrl' | 'cross';
  params: ParamDef[];
}

// Common enum tables.
const SVFLT_MODES = [
  { value: 0, label: 'LP' },
  { value: 1, label: 'HP' },
  { value: 2, label: 'BP' },
  { value: 3, label: 'Notch' },
] as const;

const ONEPOLE_MODES = [
  { value: 0, label: 'LP' },
  { value: 1, label: 'HP' },
] as const;

const REVERSE_FLAGS = [
  { value: 0, label: 'fwd' },
  { value: 1, label: 'rev' },
] as const;

// Ranges (verified against Form1.cs hScrollBarXxx.Maximum/Minimum):
//   add/mul val2value : -32768 .. 32830  (Form1.cs 11846, 12376)
//   osc freq          : 0 .. 10000       (Form1.cs 11626, 11700, 11773, 11924)
//   osc gain          : 0 .. 128         (Form1.cs 11619, 11693, 11766, 11917)
//   osc_pulse width   : 0 .. 127         (Form1.cs 11910)
//   osc_noise gain    : 0 .. 128         (Form1.cs 12038)
//   vol gain          : 0 .. 255         (Form1.cs 11560)
//   distortion gain   : 0 .. 127         (Form1.cs 11502)
//   enva attack/gain  : 0..127 / 0..128  (Form1.cs 12089, 12082)
//   envd dec/sus/gain : 0..127 / 0..127 / 0..128 (Form1.cs 12163, 12156, 12149)
//   dly_cyc delay/gain: 0..2047 / 0..128 (Form1.cs 12452, 12445)
//   cmb_flt_n         : delay 0..2047, feedback 0..127, gain 0..128 (Form1.cs 12591, 12584, 12577)
//   reverb            : feedback 0..127, gain 0..128 (Form1.cs 12708, 12701)
//   sv_flt_n          : cutoff 0..127, resonance 0..127 (Form1.cs 12831, 12824)
//   onepole_flt       : cutoff 0..127  (Form1.cs 14297)
//   clone             : transpose -16384..32830 (Form1.cs 13871/13870), offset 0..32767 (Form1.cs 13916)
//   chordgen          : shift 0..127  (Form1.cs 13700)
//   sh                : step 0..127  (Form1.cs 14082)
//   adsr              : attack/decay/release 0..255, sustain 0..127, gain 0..128 (Form1.cs 12240/12254/12294, 12287, 12280)

export const OP_DEFS: ReadonlyArray<OpDef> = [
  // ── 1: vol ────────────────────────────────────────────────
  // Form1.cs case 1 (lines 1836-1842 / codegen 4855-4872):
  //   vol(arrayvartext[val1], gain-or-gainVal)
  // ComboBoxVolVal: ["-","V1","V2","V3","V4"]   → val1 var-source (no literal)
  // ComboBoxVolGain: ["-","V1","V2","V3","V4"]  → gain selector
  // hScrollBarVolGainValue: 0..255
  {
    code: 1, name: 'vol', category: 'ctrl',
    params: [
      { field: 'val1', type: { kind: 'var-source', label: 'in', allowNone: true } },
      { field: 'gainVal', selector: 'gain',
        type: { kind: 'var-or-const', min: 0, max: 255, label: 'gain' } },
    ],
  },

  // ── 2: osc_saw ────────────────────────────────────────────
  // Form1.cs case 2 (1843-1851 / 4873-4901). osc_saw(j, freq|freqVal, gain|gainVal).
  // ComboBoxOscsawFreq: ["Value","V1".."V4"], freq selector. Freq range 0..10000.
  // Gain selector, range 0..128.
  {
    code: 2, name: 'osc_saw', category: 'osc',
    params: [
      { field: 'freqVal', selector: 'freq',
        type: { kind: 'var-or-const', min: 0, max: 10000, label: 'freq', scale: 'pow' } },
      { field: 'gainVal', selector: 'gain',
        type: { kind: 'var-or-const', min: 0, max: 128, label: 'gain' } },
    ],
  },

  // ── 3: osc_tri ────────────────────────────────────────────
  // Form1.cs case 3 — same shape as osc_saw.
  {
    code: 3, name: 'osc_tri', category: 'osc',
    params: [
      { field: 'freqVal', selector: 'freq',
        type: { kind: 'var-or-const', min: 0, max: 10000, label: 'freq', scale: 'pow' } },
      { field: 'gainVal', selector: 'gain',
        type: { kind: 'var-or-const', min: 0, max: 128, label: 'gain' } },
    ],
  },

  // ── 4: osc_sine ───────────────────────────────────────────
  {
    code: 4, name: 'osc_sine', category: 'osc',
    params: [
      { field: 'freqVal', selector: 'freq',
        type: { kind: 'var-or-const', min: 0, max: 10000, label: 'freq', scale: 'pow' } },
      { field: 'gainVal', selector: 'gain',
        type: { kind: 'var-or-const', min: 0, max: 128, label: 'gain' } },
    ],
  },

  // ── 5: osc_pulse ──────────────────────────────────────────
  // Form1.cs case 5 — osc_saw shape + width/widthVal (0..127, selector "Value/V1..V4").
  {
    code: 5, name: 'osc_pulse', category: 'osc',
    params: [
      { field: 'freqVal', selector: 'freq',
        type: { kind: 'var-or-const', min: 0, max: 10000, label: 'freq', scale: 'pow' } },
      { field: 'gainVal', selector: 'gain',
        type: { kind: 'var-or-const', min: 0, max: 128, label: 'gain' } },
      { field: 'widthVal', selector: 'width',
        type: { kind: 'var-or-const', min: 0, max: 127, label: 'duty' } },
    ],
  },

  // ── 6: osc_noise ──────────────────────────────────────────
  // Form1.cs case 6 — only gain (selector + 0..128 value).
  {
    code: 6, name: 'osc_noise', category: 'osc',
    params: [
      { field: 'gainVal', selector: 'gain',
        type: { kind: 'var-or-const', min: 0, max: 128, label: 'gain' } },
    ],
  },

  // ── 7: enva ───────────────────────────────────────────────
  // Form1.cs case 7 (1888-1894 / 5023-5053):
  //   enva(smp, val1-or-val1Value, 0, gain-or-gainVal)
  // val1 selector "-/V1..V4" (var-or-const). attack range 0..127. gain 0..128.
  {
    code: 7, name: 'enva', category: 'env',
    params: [
      { field: 'val1Value', selector: 'val1',
        type: { kind: 'var-or-const', min: 0, max: 127, label: 'attack' } },
      { field: 'gainVal', selector: 'gain',
        type: { kind: 'var-or-const', min: 0, max: 128, label: 'gain' } },
    ],
  },

  // ── 8: envd ───────────────────────────────────────────────
  // Form1.cs case 8 (1896-1908 / 5055-5095):
  //   envd(smp, val1-or-val1Value [decay], val2-or-val2Value [sustain], gain-or-gainVal)
  // decay range 0..127, sustain range 0..127, gain 0..128.
  {
    code: 8, name: 'envd', category: 'env',
    params: [
      { field: 'val1Value', selector: 'val1',
        type: { kind: 'var-or-const', min: 0, max: 127, label: 'decay' } },
      { field: 'val2Value', selector: 'val2',
        type: { kind: 'var-or-const', min: 0, max: 127, label: 'sustain' } },
      { field: 'gainVal', selector: 'gain',
        type: { kind: 'var-or-const', min: 0, max: 128, label: 'gain' } },
    ],
  },

  // ── 9: add ────────────────────────────────────────────────
  // Form1.cs case 9 (1910-1915 / 5097-5114):
  //   add(arrayvartext[val1], val2-or-val2Value)
  // val1 MUST be V1..V4 (ComboBoxAddVal1: ["-","V1".."V4"]; "-" is invalid
  // and triggers the "Error in instrument N" path in some ops, but for add
  // the codegen still emits "" if val1==0 → behaves like literal v0=0).
  // val2 selector "Value/V1..V4", val2Value range -32768..32830.
  {
    code: 9, name: 'add', category: 'mix',
    params: [
      // val1 MUST be V1..V4 per user spec — `allowNone: false` makes the
      // 0/"—" option still appear (Klang stores 0 for "unwired") but as
      // a red warning, not a valid choice.
      { field: 'val1', type: { kind: 'var-source', label: 'in1', allowNone: false } },
      { field: 'val2Value', selector: 'val2',
        type: { kind: 'var-or-const', min: -32768, max: 32830, label: 'in2' } },
    ],
  },

  // ── 10: mul ───────────────────────────────────────────────
  // Identical shape to add. Codegen also prints float = val2Value * 3.05e-5
  // for display only — we keep the raw int knob.
  {
    code: 10, name: 'mul', category: 'mix',
    params: [
      { field: 'val1', type: { kind: 'var-source', label: 'in1', allowNone: true } },
      { field: 'val2Value', selector: 'val2',
        type: { kind: 'var-or-const', min: -32768, max: 32830, label: 'in2' } },
    ],
  },

  // ── 11: dly_cyc ───────────────────────────────────────────
  // Form1.cs case 11 (1928-1940 / 5137-…):
  //   dly_cyc(j, val1 [must be var], freq-or-freqVal [delay], gain-or-gainVal)
  // delay range 0..2047, gain 0..128.
  {
    code: 11, name: 'dly_cyc', category: 'fx',
    params: [
      { field: 'val1', type: { kind: 'var-source', label: 'in', allowNone: false } },
      { field: 'freqVal', selector: 'freq',
        type: { kind: 'var-or-const', min: 0, max: 2047, label: 'delay' } },
      { field: 'gainVal', selector: 'gain',
        type: { kind: 'var-or-const', min: 0, max: 128, label: 'gain' } },
    ],
  },

  // ── 12: cmb_flt_n ─────────────────────────────────────────
  // Form1.cs case 12 (1942-1965): val1 (var), freq/freqVal (delay 0..2047),
  // val2/val2Value (feedback 0..127), gain/gainVal (gain 0..128).
  {
    code: 12, name: 'cmb_flt_n', category: 'filter',
    params: [
      { field: 'val1', type: { kind: 'var-source', label: 'in', allowNone: false } },
      { field: 'freqVal', selector: 'freq',
        type: { kind: 'var-or-const', min: 0, max: 2047, label: 'delay' } },
      { field: 'val2Value', selector: 'val2',
        type: { kind: 'var-or-const', min: 0, max: 127, label: 'feedback' } },
      { field: 'gainVal', selector: 'gain',
        type: { kind: 'var-or-const', min: 0, max: 128, label: 'gain' } },
    ],
  },

  // ── 13: reverb ────────────────────────────────────────────
  // Form1.cs case 13 (1967-1983): val1 (var), val2/val2Value (feedback 0..127),
  // gain/gainVal (gain 0..128). NO delay slot — reverb's internal delays are
  // hard-coded constants in synthnodes.h.
  {
    code: 13, name: 'reverb', category: 'fx',
    params: [
      { field: 'val1', type: { kind: 'var-source', label: 'in', allowNone: false } },
      { field: 'val2Value', selector: 'val2',
        type: { kind: 'var-or-const', min: 0, max: 127, label: 'fbk' } },
      { field: 'gainVal', selector: 'gain',
        type: { kind: 'var-or-const', min: 0, max: 128, label: 'gain' } },
    ],
  },

  // ── 14: ctrl ──────────────────────────────────────────────
  // Form1.cs case 14 (1985-1988): ONLY val1 (var-source, "-/V1..V4").
  {
    code: 14, name: 'ctrl', category: 'ctrl',
    params: [
      { field: 'val1', type: { kind: 'var-source', label: 'in', allowNone: false } },
    ],
  },

  // ── 15: sv_flt_n ──────────────────────────────────────────
  // Form1.cs case 15 (1989-2010 / 5247-5307):
  //   sv_flt_n(j, val1 [var], freq-or-freqVal [cutoff], val2-or-val2Value [reso],
  //            gain [RAW BYTE → mode, NOT gain channel])
  // ComboBoxFilterMode: ["Lowpass","Highpass","Bandpass","Notch"]
  //   → stored in the `gain` slot byte (case 15 codegen prints `arraygain[k,l]` raw).
  // cutoff range 0..127, resonance range 0..127.
  {
    code: 15, name: 'sv_flt_n', category: 'filter',
    params: [
      { field: 'val1', type: { kind: 'var-source', label: 'in', allowNone: false } },
      { field: 'freqVal', selector: 'freq',
        type: { kind: 'var-or-const', min: 0, max: 127, label: 'cutoff' } },
      { field: 'val2Value', selector: 'val2',
        type: { kind: 'var-or-const', min: 0, max: 127, label: 'reso' } },
      { field: 'gain', type: { kind: 'enum', options: SVFLT_MODES, label: 'mode' } },
    ],
  },

  // ── 16: distortion ────────────────────────────────────────
  // Form1.cs case 16 (2012-2017 / 5310-5325):
  //   distortion(val1 [var], gain-or-gainVal). gain range 0..127.
  {
    code: 16, name: 'distortion', category: 'fx',
    params: [
      { field: 'val1', type: { kind: 'var-source', label: 'in', allowNone: false } },
      { field: 'gainVal', selector: 'gain',
        type: { kind: 'var-or-const', min: 0, max: 127, label: 'gain' } },
    ],
  },

  // ── 17: clone ─────────────────────────────────────────────
  // Form1.cs case 17 (2019-2055 / 5328-5394):
  //   transpose: freq/freqVal (var-or-const, range -16384..32830)
  //   srcInstr:  gain (instr-ref 0..30) — NOTE this overloads "gain"!
  //   reverse:   gainVal (0=fwd, 1=rev — ComboBoxCloneReverse: ["No","Yes"])
  //   offset:    val2Value (const, 0..32767)
  // The codegen reads `arrayfrequency > 0` to pick var vs literal for transpose.
  {
    code: 17, name: 'clone', category: 'cross',
    params: [
      { field: 'freqVal', selector: 'freq',
        type: { kind: 'var-or-const', min: -16384, max: 32830, label: 'transpose' } },
      { field: 'gain', type: { kind: 'instr-ref', label: 'source' } },
      { field: 'gainVal', type: { kind: 'enum', options: REVERSE_FLAGS, label: 'dir' } },
      { field: 'val2Value', type: { kind: 'const-int', min: 0, max: 32767, label: 'offset' } },
    ],
  },

  // ── 18: chordgen ──────────────────────────────────────────
  // Form1.cs case 18 (2056-2080 / 5396-5428):
  //   source:  gain (instr-ref)
  //   n1:      freq  (raw byte, ComboBoxChordNote1)
  //   n2:      width (raw byte, ComboBoxChordNote2)
  //   n3:      val1  (raw byte, ComboBoxChordNote3)
  //   shift:   val2/val2Value (var-or-const, range 0..127)
  // The note pickers are byte-indices into chordgen's hard-coded interval
  // table (synthnodes.h lines 180-194 list 12 intervals). 0 means "skip".
  {
    code: 18, name: 'chordgen', category: 'cross',
    params: [
      { field: 'gain', type: { kind: 'instr-ref', label: 'source' } },
      { field: 'freq',  type: { kind: 'const-int', min: 0, max: 12, label: 'note1' } },
      { field: 'width', type: { kind: 'const-int', min: 0, max: 12, label: 'note2' } },
      { field: 'val1',  type: { kind: 'const-int', min: 0, max: 12, label: 'note3' } },
      { field: 'val2Value', selector: 'val2',
        type: { kind: 'var-or-const', min: 0, max: 127, label: 'shift' } },
    ],
  },

  // ── 19: sample_hold ───────────────────────────────────────
  // Form1.cs case 19 (2081-2086 / 5430-5452):
  //   sh(j, val1 [var], gain-or-gainVal [step, range 0..127])
  // Renamed in the editor from the cryptic "sh" to its full Klang
  // documentation name — the underlying C op + binary code stay 19.
  {
    code: 19, name: 'sample_hold', category: 'ctrl',
    params: [
      { field: 'val1', type: { kind: 'var-source', label: 'in', allowNone: false } },
      { field: 'gainVal', selector: 'gain',
        type: { kind: 'var-or-const', min: 0, max: 127, label: 'step' } },
    ],
  },

  // ── 20: imported_sample ───────────────────────────────────
  // Form1.cs case 20 (2088-2091 / 5455-5463):
  //   ONE param: import index, stored in `gain`. No other slot fields used.
  {
    code: 20, name: 'imported', category: 'cross',
    params: [
      { field: 'gain', type: { kind: 'sample-ref', label: 'sample' } },
    ],
  },

  // ── 21: onepole_flt ───────────────────────────────────────
  // Form1.cs case 21 (2093-2103 / 5465-5488):
  //   onepole_flt(j, val1 [var], freq-or-freqVal [cutoff 0..127],
  //               gain [RAW BYTE → mode])
  // ComboBoxOnepoleMode: ["Lowpass","Highpass"]  → stored in `gain` byte.
  {
    code: 21, name: 'onepole_flt', category: 'filter',
    params: [
      { field: 'val1', type: { kind: 'var-source', label: 'in', allowNone: false } },
      { field: 'freqVal', selector: 'freq',
        type: { kind: 'var-or-const', min: 0, max: 127, label: 'cutoff' } },
      { field: 'gain', type: { kind: 'enum', options: ONEPOLE_MODES, label: 'mode' } },
    ],
  },

  // ── 22: loop_gen ──────────────────────────────────────────
  // Special: per-instrument crossfade applied AFTER the per-tick render. The
  // op itself has NO slot params (Form1.cs case 22, 2105-2126, only edits
  // the *instrument's* loopOffset/loopLength fields via a separate panel —
  // which is owned by the instrument header, not the slot row).
  // Trigger is hard-coded to slot index 15.
  {
    code: 22, name: 'loop_gen', category: 'cross',
    params: [],
  },

  // ── 23: adsr ──────────────────────────────────────────────
  // Form1.cs case 23 (2127-2146 / 5491-5530). Five plain literal knobs:
  //   attack  = val2Value   (0..255)
  //   decay   = val1Value   (0..255)
  //   sustain = widthVal    (0..127)
  //   release = freqVal     (0..255)
  //   gain    = gainVal     (0..128)  (peak; codegen labels it "peak")
  // The selector fields (freq/gain/val1/val2/width) are NOT read by op23 —
  // the codegen always reads the literal *Val fields. So no var-or-const here.
  {
    code: 23, name: 'adsr', category: 'env',
    params: [
      { field: 'val2Value', type: { kind: 'const-int', min: 0, max: 255, label: 'attack' } },
      { field: 'val1Value', type: { kind: 'const-int', min: 0, max: 255, label: 'decay' } },
      { field: 'widthVal',  type: { kind: 'const-int', min: 0, max: 127, label: 'sustain' } },
      { field: 'freqVal',   type: { kind: 'const-int', min: 0, max: 255, label: 'release' } },
      { field: 'gainVal',   type: { kind: 'const-int', min: 0, max: 128, label: 'gain' } },
    ],
  },

  // ── 24: vocoder ───────────────────────────────────────────
  // Form1.cs case 24 (2148-2152). Has a GUI panel (val1 = modulator,
  // val2 = carrier — both var-source) but NO codegen case (see dsp-reference
  // §4 table). Effectively a no-op in v1. We still surface the UI fields so
  // users editing existing patches can see/edit them.
  {
    code: 24, name: 'vocoder', category: 'cross',
    params: [
      { field: 'val1', type: { kind: 'var-source', label: 'mod', allowNone: false } },
      { field: 'val2', type: { kind: 'var-source', label: 'carrier', allowNone: false } },
    ],
  },
];

const OP_BY_CODE = new Map<number, OpDef>();
for (const def of OP_DEFS) OP_BY_CODE.set(def.code, def);

export function opByCode(code: number): OpDef | undefined {
  return OP_BY_CODE.get(code);
}

/**
 * Reset slot fields that are NOT part of `newOpCode`'s param schema to 0
 * (and set `fn` to `newOpCode`). Preserves `outVar` and `instance` which are
 * structural / position-stable across op-type changes.
 *
 * Used by the editor when the user changes a slot's op type — avoids leaving
 * stale data that the new op would misinterpret (e.g. a previous mul's
 * val2Value treated as an enva attack-time literal).
 */
/**
 * Per-op factory defaults applied when the editor first inserts a slot of
 * that op (separate from `resetSlotForOp` which only zeroes irrelevant
 * fields when the user CHANGES op). Anything not listed here defaults to 0.
 *
 * The user-stated defaults so far:
 *   envd → decay 23, sustain 0, gain 128 — a usable envelope out of the
 *          box instead of an all-zero one that produces silence.
 */
const INSERT_DEFAULTS: Record<number, Partial<Slot>> = {
  1: { gainVal: 128 },                                  // vol
  2: { freqVal: 50, gainVal: 64 },                      // osc_saw
  3: { freqVal: 50, gainVal: 64 },                      // osc_tri
  4: { freqVal: 50, gainVal: 64 },                      // osc_sine
  5: { freqVal: 50, gainVal: 64, widthVal: 63 },        // osc_pulse
  6: { gainVal: 64 },                                   // osc_noise
  7: { val1Value: 16, gainVal: 64 },                    // enva
  8: { val1Value: 16, val2Value: 64, gainVal: 64 },     // envd
  9: { val1: 1, val2Value: 0 },                         // add
  11: { gainVal: 128 },                                 // dly_cyc
  12: { gainVal: 64 },                                  // cmb_flt_n
};

/** Apply factory defaults for the given op on top of `base`. */
export function applyInsertDefaults(base: Slot, opCode: number): Slot {
  const d = INSERT_DEFAULTS[opCode];
  return d ? { ...base, ...d } : base;
}

export function resetSlotForOp(slot: Slot, newOpCode: number): Slot {
  const def = opByCode(newOpCode);
  // Fields used by ANY op as a value OR selector.
  const allValueFields: ReadonlyArray<keyof Slot> = [
    'freq', 'freqVal', 'gain', 'gainVal', 'width', 'widthVal',
    'val1', 'val1Value', 'val2', 'val2Value',
  ];
  const keep = new Set<keyof Slot>();
  if (def) {
    for (const p of def.params) {
      keep.add(p.field);
      if (p.selector) keep.add(p.selector);
    }
  }
  const next: Slot = { ...slot, fn: newOpCode };
  for (const f of allValueFields) {
    if (!keep.has(f)) {
      (next[f] as number) = 0;
    }
  }
  return next;
}
