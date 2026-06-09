// Op dispatch table fn-substring → generator. Ports the per-op methods of
// Aklang2Asm (Program.cs). Only osc_saw is implemented so far; the rest are
// stubs that throw until ported.

import type { AkGenState } from './state';
import { remapVarToRegisterOrImmediate } from './helpers';

export type OpGen = (st: AkGenState, output: string, inputs: string[]) => string;

/** Program.cs Osc_Saw 500-538. */
export function oscSaw(st: AkGenState, output: string, inputs: string[]): string {
  const orVal = remapVarToRegisterOrImmediate(output);
  const inVal = String(st.currentWordInstance * 2);
  const frVal = remapVarToRegisterOrImmediate(inputs[1]!);
  const gnText = remapVarToRegisterOrImmediate(inputs[2]!);
  const gsVal = Object.prototype.hasOwnProperty.call(st.mulRightShifts, gnText)
    ? st.mulRightShifts[gnText]!
    : '';
  let empty = '';
  empty += '\t\t\t\tadd.w\t@FR,AK_OpInstance+@IN(a5)\n';
  if (gnText === '#128') {
    empty += '\t\t\t\tmove.w\tAK_OpInstance+@IN(a5),@OR\n';
  } else if (Object.prototype.hasOwnProperty.call(st.mulRightShifts, gnText)) {
    empty += '\t\t\t\tmove.w\tAK_OpInstance+@IN(a5),@OR\n';
    empty += '\t\t\t\tasr.w\t@GS,@OR\n';
  } else {
    if (!gnText.includes('#')) {
      empty += '\t\t\t\tmove.w\t@GN,@TR1\n';
      empty += '\t\t\t\tand.w\t#255,@TR1\n';
    }
    empty += '\t\t\t\tmove.w\tAK_OpInstance+@IN(a5),@OR\n';
    empty += '\t\t\t\tmuls\t@TR1,@OR\n';
    empty += '\t\t\t\tasr.l\t#7,@OR\n';
  }
  empty = gnText.includes('#')
    ? empty.replaceAll('@TR1', gnText)
    : empty.replaceAll('@TR1', 'd4');
  empty = empty.replaceAll('@IN', inVal);
  empty = empty.replaceAll('@FR', frVal);
  empty = empty.replaceAll('@GN', gnText);
  empty = empty.replaceAll('@GS', gsVal);
  empty = empty.replaceAll('@OR', orVal);
  st.currentWordInstance++;
  return empty;
}

/** Program.cs Osc_Tri 539-580. */
export function oscTri(st: AkGenState, output: string, inputs: string[]): string {
  const orVal = remapVarToRegisterOrImmediate(output);
  const inVal = String(st.currentWordInstance * 2);
  const frVal = remapVarToRegisterOrImmediate(inputs[1]!);
  const gnText = remapVarToRegisterOrImmediate(inputs[2]!);
  const gsVal = Object.prototype.hasOwnProperty.call(st.mulRightShifts, gnText)
    ? st.mulRightShifts[gnText]!
    : '';
  let empty = '';
  empty += '\t\t\t\tadd.w\t@FR,AK_OpInstance+@IN(a5)\n';
  if (!gnText.includes('#')) {
    empty += '\t\t\t\tmove.w\t@GN,@TR1\n';
    empty += '\t\t\t\tand.w\t#255,@TR1\n';
  }
  empty += '\t\t\t\tmove.w\tAK_OpInstance+@IN(a5),@OR\n';
  empty += '\t\t\t\tbge.s\t.TriNoInvert_' + st.localLabel + '\n';
  empty += '\t\t\t\tnot.w\t@OR\n';
  empty += '.TriNoInvert_' + st.localLabel + '\n';
  empty += '\t\t\t\tsub.w\t#16384,@OR\n';
  empty += '\t\t\t\tadd.w\t@OR,@OR\n';
  if (gnText !== '#128') {
    if (Object.prototype.hasOwnProperty.call(st.mulRightShifts, gnText)) {
      empty += '\t\t\t\tasr.w\t@GS,@OR\n';
    } else {
      empty += '\t\t\t\tmuls\t@TR1,@OR\n';
      empty += '\t\t\t\tasr.l\t#7,@OR\n';
    }
  }
  empty = gnText.includes('#')
    ? empty.replaceAll('@TR1', gnText)
    : empty.replaceAll('@TR1', 'd4');
  empty = empty.replaceAll('@IN', inVal);
  empty = empty.replaceAll('@FR', frVal);
  empty = empty.replaceAll('@GN', gnText);
  empty = empty.replaceAll('@GS', gsVal);
  empty = empty.replaceAll('@OR', orVal);
  st.currentWordInstance++;
  return empty;
}

function stub(name: string): OpGen {
  return () => {
    throw new Error(`akgen: op '${name}' not implemented`);
  };
}

/**
 * Dispatch by the same `Contains("<name>(")` substring tests Main uses
 * (Program.cs 293-385). Order matters only where one name is a prefix of
 * another; we keep the original ordering.
 */
export const OP_DISPATCH: Array<{ match: string; gen: OpGen }> = [
  { match: 'vol(', gen: stub('vol') },
  { match: 'osc_saw(', gen: oscSaw },
  { match: 'osc_tri(', gen: oscTri },
  { match: 'osc_sine(', gen: stub('osc_sine') },
  { match: 'osc_pulse(', gen: stub('osc_pulse') },
  { match: 'osc_noise(', gen: stub('osc_noise') },
  { match: 'sh(', gen: stub('sh') },
  { match: 'envd(', gen: stub('envd') },
  { match: 'enva(', gen: stub('enva') },
  { match: 'mul(', gen: stub('mul') },
  { match: 'add(', gen: stub('add') },
  { match: 'ctrl(', gen: stub('ctrl') },
  { match: 'dly_cyc(', gen: stub('dly_cyc') },
  { match: 'cmb_flt_n(', gen: stub('cmb_flt_n') },
  { match: 'reverb(', gen: stub('reverb') },
  { match: 'sv_flt_n(', gen: stub('sv_flt_n') },
  { match: 'onepole_flt(', gen: stub('onepole_flt') },
  { match: 'chordgen(', gen: stub('chordgen') },
  { match: 'clone(', gen: stub('clone') },
  { match: 'clone_reverse(', gen: stub('clone_reverse') },
  { match: 'imported_sample(', gen: stub('imported_sample') },
  { match: 'distortion(', gen: stub('distortion') },
  { match: 'adsr(', gen: stub('adsr') },
];

export function dispatchOp(st: AkGenState, stmt: string, output: string, inputs: string[]): string {
  for (const { match, gen } of OP_DISPATCH) {
    if (stmt.includes(match)) return gen(st, output, inputs);
  }
  // Main has no else: an unrecognised statement contributes nothing.
  return '';
}
