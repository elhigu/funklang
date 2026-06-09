// Op dispatch table fn-substring → generator. Ports the per-op methods of
// Aklang2Asm (Program.cs). Only osc_saw is implemented so far; the rest are
// stubs that throw until ported.

import type { AkGenState } from './state';
import { remapVarToRegisterOrImmediate } from './helpers';

export type OpGen = (st: AkGenState, output: string, inputs: string[]) => string;

/** Program.cs Volume 465-498. */
export function volume(st: AkGenState, output: string, inputs: string[]): string {
  const orVal = remapVarToRegisterOrImmediate(output);
  const valText = remapVarToRegisterOrImmediate(inputs[0]!);
  const gnText = remapVarToRegisterOrImmediate(inputs[1]!);
  const gsVal = Object.prototype.hasOwnProperty.call(st.mulRightShifts, gnText)
    ? st.mulRightShifts[gnText]!
    : '';
  let empty = '';
  if (orVal !== valText) {
    empty += '\t\t\t\tmove.w\t@VAL,@OR\n';
  }
  if (gnText !== '#128') {
    if (Object.prototype.hasOwnProperty.call(st.mulRightShifts, gnText)) {
      empty += '\t\t\t\tasr.w\t@GS,@OR\n';
    } else {
      if (!gnText.includes('#')) {
        empty += '\t\t\t\tmove.w\t@GN,@TR1\n';
        empty += '\t\t\t\tand.w\t#255,@TR1\n';
      }
      empty += '\t\t\t\tmuls\t@TR1,@OR\n';
      empty += '\t\t\t\tasr.l\t#7,@OR\n';
    }
  }
  empty = gnText.includes('#')
    ? empty.replaceAll('@TR1', gnText)
    : empty.replaceAll('@TR1', 'd4');
  empty = empty.replaceAll('@VAL', valText);
  empty = empty.replaceAll('@GN', gnText);
  empty = empty.replaceAll('@GS', gsVal);
  return empty.replaceAll('@OR', orVal);
}

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

/** Program.cs Osc_Sine 647-693. */
export function oscSine(st: AkGenState, output: string, inputs: string[]): string {
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
  empty += '\t\t\t\tsub.w\t#16384,@OR\n';
  empty += '\t\t\t\tmove.w\t@OR,d5\n';
  empty += '\t\t\t\tbge.s\t.SineNoAbs_' + st.localLabel + '\n';
  empty += '\t\t\t\tneg.w\td5\n';
  empty += '.SineNoAbs_' + st.localLabel + '\n';
  empty += '\t\t\t\tmove.w\t#32767,d6\n';
  empty += '\t\t\t\tsub.w\td5,d6\n';
  empty += '\t\t\t\tmuls\td6,@OR\n';
  empty += '\t\t\t\tswap\t@OR\n';
  empty += '\t\t\t\tasl.w\t#3,@OR\n';
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

/** Program.cs Osc_Pulse 581-645. */
export function oscPulse(st: AkGenState, output: string, inputs: string[]): string {
  const orVal = remapVarToRegisterOrImmediate(output);
  const inVal = String(st.currentWordInstance * 2);
  const frVal = remapVarToRegisterOrImmediate(inputs[1]!);
  const gnText = remapVarToRegisterOrImmediate(inputs[2]!);
  const gsVal = Object.prototype.hasOwnProperty.call(st.mulRightShifts, gnText)
    ? st.mulRightShifts[gnText]!
    : '';
  const dcText = remapVarToRegisterOrImmediate(inputs[3]!);
  let empty = '';
  empty += '\t\t\t\tadd.w\t@FR,AK_OpInstance+@IN(a5)\n';
  if (!gnText.includes('#')) {
    empty += '\t\t\t\tmove.w\t@GN,@TR2\n';
    empty += '\t\t\t\tand.w\t#255,@TR2\n';
  }
  if (dcText.includes('#')) {
    if (Number.parseInt(dcText.replace('#', ''), 10) !== 63) {
      const startIndex = dcText.indexOf('#');
      empty +=
        '\t\t\t\tcmp.w\t#((' +
        (dcText.slice(0, startIndex) + dcText.slice(startIndex + 1)) +
        '-63)<<9),AK_OpInstance+@IN(a5)\n';
    }
  } else {
    if (dcText === gnText) {
      empty += '\t\t\t\tmove.w\t@TR2,@TR1\n';
    } else {
      empty += '\t\t\t\tmove.w\t@DC,@TR1\n';
      empty += '\t\t\t\tand.w\t#255,@TR1\n';
    }
    empty += '\t\t\t\tsub.w\t#63,@TR1\n';
    empty += '\t\t\t\tasl.w\t#8,@TR1\n';
    empty += '\t\t\t\tadd.w\t@TR1,@TR1\n';
    empty += '\t\t\t\tcmp.w\tAK_OpInstance+@IN(a5),@TR1\n';
  }
  empty += '\t\t\t\tslt\t\t@OR\n';
  empty += '\t\t\t\text.w\t@OR\n';
  empty += '\t\t\t\teor.w\t#$7fff,@OR\n';
  if (gnText !== '#128') {
    if (Object.prototype.hasOwnProperty.call(st.mulRightShifts, gnText)) {
      empty += '\t\t\t\tasr.w\t@GS,@OR\n';
    } else {
      empty += '\t\t\t\tmuls\t@TR2,@OR\n';
      empty += '\t\t\t\tasr.l\t#7,@OR\n';
    }
  }
  empty = empty.replaceAll('@TR1', 'd4');
  empty = gnText.includes('#')
    ? empty.replaceAll('@TR2', gnText)
    : empty.replaceAll('@TR2', 'd5');
  empty = empty.replaceAll('@IN', inVal);
  empty = empty.replaceAll('@FR', frVal);
  empty = empty.replaceAll('@DC', dcText);
  empty = empty.replaceAll('@GN', gnText);
  empty = empty.replaceAll('@GS', gsVal);
  empty = empty.replaceAll('@OR', orVal);
  st.currentWordInstance++;
  return empty;
}

/** Program.cs Osc_Noise 694-730. Sets usedNoise=true (-> AK_NoiseSeeds in VarsCode).
 * inputs[0] is the operand (the dan-script `smp` token -> d7); the method does
 * NOT bump currentWordInstance. */
export function oscNoise(st: AkGenState, output: string, inputs: string[]): string {
  const newValue = remapVarToRegisterOrImmediate(output);
  const text = remapVarToRegisterOrImmediate(inputs[0]!);
  const newValue2 = Object.prototype.hasOwnProperty.call(st.mulRightShifts, text)
    ? st.mulRightShifts[text]!
    : '';
  let empty = '';
  empty += '\t\t\t\tmove.l\tAK_NoiseSeeds+0(a5),d4\n';
  empty += '\t\t\t\tmove.l\tAK_NoiseSeeds+4(a5),d5\n';
  empty += '\t\t\t\teor.l\td5,d4\n';
  empty += '\t\t\t\tmove.l\td4,AK_NoiseSeeds+0(a5)\n';
  empty += '\t\t\t\tadd.l\td5,AK_NoiseSeeds+8(a5)\n';
  empty += '\t\t\t\tadd.l\td4,AK_NoiseSeeds+4(a5)\n';
  if (!text.includes('#')) {
    empty += '\t\t\t\tmove.w\t@GN,@TR1\n';
    empty += '\t\t\t\tand.w\t#255,@TR1\n';
  }
  empty += '\t\t\t\tmove.w\tAK_NoiseSeeds+10(a5),@OR\n';
  if (text !== '#128') {
    if (Object.prototype.hasOwnProperty.call(st.mulRightShifts, text)) {
      empty += '\t\t\t\tasr.w\t@GS,@OR\n';
    } else {
      empty += '\t\t\t\tmuls\t@TR1,@OR\n';
      empty += '\t\t\t\tasr.l\t#7,@OR\n';
    }
  }
  empty = text.includes('#')
    ? empty.replaceAll('@TR1', text)
    : empty.replaceAll('@TR1', 'd4');
  empty = empty.replaceAll('@GN', text);
  empty = empty.replaceAll('@GS', newValue2);
  empty = empty.replaceAll('@OR', newValue);
  st.usedNoise = true;
  return empty;
}

/** Program.cs Add 891-918. inputs = [val1, val2]. */
export function add(st: AkGenState, output: string, inputs: string[]): string {
  const text = remapVarToRegisterOrImmediate(output);
  const text2 = remapVarToRegisterOrImmediate(inputs[0]!);
  const text3 = remapVarToRegisterOrImmediate(inputs[1]!);
  let empty = '';
  if (text === text2) {
    empty += '\t\t\t\tadd.w\t@V2,@OR\n';
  } else if (text === text3) {
    empty += '\t\t\t\tadd.w\t@V1,@OR\n';
  } else {
    empty += '\t\t\t\tmove.w\t@V1,@OR\n';
    empty += '\t\t\t\tadd.w\t@V2,@OR\n';
  }
  empty = empty + '\t\t\t\tbvc.s\t.AddNoClamp_' + st.localLabel + '\n';
  empty += '\t\t\t\tspl\t\t@OR\n';
  empty += '\t\t\t\text.w\t@OR\n';
  empty += '\t\t\t\teor.w\t#$7fff,@OR\n';
  empty = empty + '.AddNoClamp_' + st.localLabel + '\n';
  empty = empty.replaceAll('@OR', text);
  empty = empty.replaceAll('@V1', text2);
  return empty.replaceAll('@V2', text3);
}

/** Program.cs Mul 865-888. inputs = [val1, val2]. */
export function mul(_st: AkGenState, output: string, inputs: string[]): string {
  const text = remapVarToRegisterOrImmediate(output);
  const text2 = remapVarToRegisterOrImmediate(inputs[0]!);
  const text3 = remapVarToRegisterOrImmediate(inputs[1]!);
  let empty = '';
  if (text === text2) {
    empty += '\t\t\t\tmuls\t@V2,@OR\n';
  } else if (text === text3) {
    empty += '\t\t\t\tmuls\t@V1,@OR\n';
  } else {
    empty += '\t\t\t\tmove.w\t@V1,@OR\n';
    empty += '\t\t\t\tmuls\t@V2,@OR\n';
  }
  empty += '\t\t\t\tadd.l\t@OR,@OR\n';
  empty += '\t\t\t\tswap\t@OR\n';
  empty = empty.replaceAll('@OR', text);
  empty = empty.replaceAll('@V1', text2);
  return empty.replaceAll('@V2', text3);
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
  { match: 'vol(', gen: volume },
  { match: 'osc_saw(', gen: oscSaw },
  { match: 'osc_tri(', gen: oscTri },
  { match: 'osc_sine(', gen: oscSine },
  { match: 'osc_pulse(', gen: oscPulse },
  { match: 'osc_noise(', gen: oscNoise },
  { match: 'sh(', gen: stub('sh') },
  { match: 'envd(', gen: stub('envd') },
  { match: 'enva(', gen: stub('enva') },
  { match: 'mul(', gen: mul },
  { match: 'add(', gen: add },
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
