// Op dispatch table fn-substring → generator. Ports the per-op methods of
// Aklang2Asm (Program.cs). Only osc_saw is implemented so far; the rest are
// stubs that throw until ported.

import type { AkGenState } from './state';
import { remapVarToRegisterOrImmediate, getDecayValue } from './helpers';

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

/** Program.cs Control 920-934. inputs = [source var]. */
export function control(_st: AkGenState, output: string, inputs: string[]): string {
  const text = remapVarToRegisterOrImmediate(output);
  const text2 = remapVarToRegisterOrImmediate(inputs[0]!);
  let text3 = '';
  if (text !== text2) {
    text3 += '\t\t\t\tmove.w\t@IR,@OR\n';
  }
  text3 += '\t\t\t\tmoveq\t#9,d4\n';
  text3 += '\t\t\t\tasr.w\td4,@OR\n';
  text3 += '\t\t\t\tadd.w\t#64,@OR\n';
  text3 = text3.replaceAll('@OR', text);
  return text3.replaceAll('@IR', text2);
}

/** Program.cs Env_Decay 770-818. inputs = [smp, decayIndex, sustain, gain]. */
export function envDecay(st: AkGenState, output: string, inputs: string[]): string {
  const newValue = remapVarToRegisterOrImmediate(output);
  const newValue2 = String(st.currentEnvDInstance * 4);
  const decayValue = getDecayValue(Number.parseInt(inputs[1]!, 10));
  const num = Number.parseInt(inputs[2]!, 10) << 24;
  const text = '#' + (Number.parseInt(inputs[2]!, 10) << 24);
  const text2 = remapVarToRegisterOrImmediate(inputs[3]!);
  const newValue3 = Object.prototype.hasOwnProperty.call(st.mulRightShifts, text2)
    ? st.mulRightShifts[text2]!
    : '';
  let text3 = '';
  if (!text2.includes('#')) {
    text3 += '\t\t\t\tmove.w\t@GN,@TR1\n';
    text3 += '\t\t\t\tand.w\t#255,@TR1\n';
  }
  text3 += '\t\t\t\tmove.l\tAK_EnvDValue+@IN(a5),d5\n';
  text3 += '\t\t\t\tmove.l\td5,@OR\n';
  text3 += '\t\t\t\tswap\t@OR\n';
  text3 += '\t\t\t\tsub.l\t@DV,d5\n';
  if (text !== '#0') {
    text3 += '\t\t\t\tcmp.l\t@SV,d5\n';
  }
  text3 = text3 + '\t\t\t\tbgt.s   .EnvDNoSustain_' + st.localLabel + '\n';
  text3 =
    num > 127 || num < -128
      ? text3 + '\t\t\t\tmove.l\t@SV,d5\n'
      : text3 + '\t\t\t\tmoveq\t@SV,d5\n';
  text3 = text3 + '.EnvDNoSustain_' + st.localLabel + '\n';
  text3 += '\t\t\t\tmove.l\td5,AK_EnvDValue+@IN(a5)\n';
  if (text2 !== '#128') {
    if (Object.prototype.hasOwnProperty.call(st.mulRightShifts, text2)) {
      text3 += '\t\t\t\tasr.w\t@GS,@OR\n';
    } else {
      text3 += '\t\t\t\tmuls\t@TR1,@OR\n';
      text3 += '\t\t\t\tasr.l\t#7,@OR\n';
    }
  }
  text3 = text2.includes('#')
    ? text3.replaceAll('@TR1', text2)
    : text3.replaceAll('@TR1', 'd4');
  text3 = text3.replaceAll('@IN', newValue2);
  text3 = text3.replaceAll('@GN', text2);
  text3 = text3.replaceAll('@GS', newValue3);
  text3 = text3.replaceAll('@OR', newValue);
  text3 = text3.replaceAll('@DV', decayValue);
  text3 = text3.replaceAll('@SV', text);
  st.currentEnvDInstance++;
  return text3;
}

/** Program.cs Env_Attack 820-863 (constant attack). inputs = [smp, attackIndex, sustain(=0), gain]. */
export function envAttack(st: AkGenState, output: string, inputs: string[]): string {
  const newValue = remapVarToRegisterOrImmediate(output);
  const newValue2 = String(st.currentWordInstance * 2);
  const decayValue = getDecayValue(Number.parseInt(inputs[1]!, 10));
  const newValue3 = '#' + (Number.parseInt(inputs[2]!, 10) << 24);
  const text = remapVarToRegisterOrImmediate(inputs[3]!);
  const newValue4 = Object.prototype.hasOwnProperty.call(st.mulRightShifts, text)
    ? st.mulRightShifts[text]!
    : '';
  let text2 = '';
  if (!text.includes('#')) {
    text2 += '\t\t\t\tmove.w\t@GN,@TR1\n';
    text2 += '\t\t\t\tand.w\t#255,@TR1\n';
  }
  text2 += '\t\t\t\tmove.l\tAK_OpInstance+@IN(a5),d5\n';
  text2 += '\t\t\t\tmove.l\td5,@OR\n';
  text2 += '\t\t\t\tswap\t@OR\n';
  text2 += '\t\t\t\tadd.l\t@AV,d5\n';
  text2 = text2 + '\t\t\t\tbvc.s   .EnvANoMax_' + st.localLabel + '\n';
  text2 += '\t\t\t\tmove.l\t#32767<<16,d5\n';
  text2 = text2 + '.EnvANoMax_' + st.localLabel + '\n';
  text2 += '\t\t\t\tmove.l\td5,AK_OpInstance+@IN(a5)\n';
  if (text !== '#128') {
    if (Object.prototype.hasOwnProperty.call(st.mulRightShifts, text)) {
      text2 += '\t\t\t\tasr.w\t@GS,@OR\n';
    } else {
      text2 += '\t\t\t\tmuls\t@TR1,@OR\n';
      text2 += '\t\t\t\tasr.l\t#7,@OR\n';
    }
  }
  text2 = text.includes('#')
    ? text2.replaceAll('@TR1', text)
    : text2.replaceAll('@TR1', 'd4');
  text2 = text2.replaceAll('@IN', newValue2);
  text2 = text2.replaceAll('@GN', text);
  text2 = text2.replaceAll('@GS', newValue4);
  text2 = text2.replaceAll('@OR', newValue);
  text2 = text2.replaceAll('@AV', decayValue);
  text2 = text2.replaceAll('@SV', newValue3);
  st.currentWordInstance += 2;
  return text2;
}

/** Program.cs SVFilter 1259-1352. inputs = [instance, signalVar, cutoff(CO),
 *  resonance(RE), mode("0".."3")]. Bumps currentWordInstance += 3. */
export function svFilter(st: AkGenState, output: string, inputs: string[]): string {
  const newValue = remapVarToRegisterOrImmediate(output);
  const newValue2 = String(st.currentWordInstance * 2);
  const newValue3 = remapVarToRegisterOrImmediate(inputs[1]!);
  const text = remapVarToRegisterOrImmediate(inputs[2]!);
  const newValue4 = Object.prototype.hasOwnProperty.call(st.mulLeftShifts, text)
    ? st.mulLeftShifts[text]!
    : '';
  const text2 = remapVarToRegisterOrImmediate(inputs[3]!);
  const newValue5 = Object.prototype.hasOwnProperty.call(st.mulLeftShifts, text2)
    ? st.mulLeftShifts[text2]!
    : '';
  const text3 = inputs[4]!;
  let empty = '';
  empty += '\t\t\t\tmove.w\tAK_OpInstance+AK_BPF+@IN(a5),d5\n';
  empty += '\t\t\t\tasr.w\t#7,d5\n';
  empty += '\t\t\t\tmove.w\td5,d6\n';
  empty = Object.prototype.hasOwnProperty.call(st.mulLeftShifts, text)
    ? empty + '\t\t\t\tasl.w\t@CS,d5\n'
    : !text.includes('#')
      ? empty + '\t\t\t\tmuls\t@CO,d5\n'
      : empty + '\t\t\t\tmuls\t@CO,d5\n';
  empty += '\t\t\t\tmove.w\tAK_OpInstance+AK_LPF+@IN(a5),d4\n';
  empty += '\t\t\t\tadd.w\td5,d4\n';
  empty = empty + '\t\t\t\tbvc.s\t.NoClampLPF_' + st.localLabel + '\n';
  empty += '\t\t\t\tspl\t\td4\n';
  empty += '\t\t\t\text.w\td4\n';
  empty += '\t\t\t\teor.w\t#$7fff,d4\n';
  empty = empty + '.NoClampLPF_' + st.localLabel + '\n';
  empty += '\t\t\t\tmove.w\td4,AK_OpInstance+AK_LPF+@IN(a5)\n';
  if (Object.prototype.hasOwnProperty.call(st.mulLeftShifts, text2)) {
    empty += '\t\t\t\tasl.w\t@RS,d6\n';
    empty += '\t\t\t\text.l\td6\n';
  } else if (text2.includes('#')) {
    empty += '\t\t\t\tmuls\t@RE,d6\n';
  } else {
    empty += '\t\t\t\tmove.w\t@RE,d5\n';
    empty += '\t\t\t\tand.w\t#255,d5\n';
    empty += '\t\t\t\tmuls\td5,d6\n';
  }
  empty += '\t\t\t\tmove.w\t@VL,d5\n';
  empty += '\t\t\t\text.l\td5\n';
  empty += '\t\t\t\text.l\td4\n';
  empty += '\t\t\t\tsub.l\td4,d5\n';
  empty += '\t\t\t\tsub.l\td6,d5\n';
  empty += '\t\t\t\tcmp.l\t#32767,d5\n';
  empty = empty + '\t\t\t\tble.s\t.NoClampMaxHPF_' + st.localLabel + '\n';
  empty += '\t\t\t\tmove.w\t#32767,d5\n';
  empty = empty + '\t\t\t\tbra.s\t.NoClampMinHPF_' + st.localLabel + '\n';
  empty = empty + '.NoClampMaxHPF_' + st.localLabel + '\n';
  empty += '\t\t\t\tcmp.l\t#-32768,d5\n';
  empty = empty + '\t\t\t\tbge.s\t.NoClampMinHPF_' + st.localLabel + '\n';
  empty += '\t\t\t\tmove.w\t#-32768,d5\n';
  empty = empty + '.NoClampMinHPF_' + st.localLabel + '\n';
  empty += '\t\t\t\tmove.w\td5,AK_OpInstance+AK_HPF+@IN(a5)\n';
  empty += '\t\t\t\tasr.w\t#7,d5\n';
  empty = Object.prototype.hasOwnProperty.call(st.mulLeftShifts, text)
    ? empty + '\t\t\t\tasl.w\t@CS,d5\n'
    : !text.includes('#')
      ? empty + '\t\t\t\tmuls\t@CO,d5\n'
      : empty + '\t\t\t\tmuls\t@CO,d5\n';
  empty += '\t\t\t\tadd.w\tAK_OpInstance+AK_BPF+@IN(a5),d5\n';
  empty = empty + '\t\t\t\tbvc.s\t.NoClampBPF_' + st.localLabel + '\n';
  empty += '\t\t\t\tspl\t\td5\n';
  empty += '\t\t\t\text.w\td5\n';
  empty += '\t\t\t\teor.w\t#$7fff,d5\n';
  empty = empty + '.NoClampBPF_' + st.localLabel + '\n';
  empty += '\t\t\t\tmove.w\td5,AK_OpInstance+AK_BPF+@IN(a5)\n';
  switch (text3) {
    case '0':
      empty += '\t\t\t\tmove.w\tAK_OpInstance+AK_LPF+@IN(a5),@OR\n';
      break;
    case '1':
      empty += '\t\t\t\tmove.w\tAK_OpInstance+AK_HPF+@IN(a5),@OR\n';
      break;
    case '2':
      empty += '\t\t\t\tmove.w\td5,@OR\n';
      break;
    case '3':
      empty += '\t\t\t\tmove.w\tAK_OpInstance+AK_HPF+@IN(a5),@OR\n';
      empty += '\t\t\t\tadd.w\t@OR,@OR\n';
      empty = empty + '\t\t\t\tbvc.s\t.NoClampMode3_' + st.localLabel + '\n';
      empty += '\t\t\t\tspl\t\t@OR\n';
      empty += '\t\t\t\text.w\t@OR\n';
      empty += '\t\t\t\teor.w\t#$7fff,@OR\n';
      empty = empty + '.NoClampMode3_' + st.localLabel + '\n';
      break;
  }
  empty = empty.replaceAll('@IN', newValue2);
  empty = empty.replaceAll('@VL', newValue3);
  empty = empty.replaceAll('@CO', text);
  empty = empty.replaceAll('@CS', newValue4);
  empty = empty.replaceAll('@RE', text2);
  empty = empty.replaceAll('@RS', newValue5);
  empty = empty.replaceAll('@OR', newValue);
  st.currentWordInstance += 3;
  return empty;
}

/** Program.cs OnePoleFilter 1353-1429. inputs = [instance, signalVar(VL),
 *  cutoff(CO, uses mulLeftShifts), mode("0"|"1")]. Bumps currentWordInstance++. */
export function onePoleFilter(st: AkGenState, output: string, inputs: string[]): string {
  const text = remapVarToRegisterOrImmediate(output);
  const newValue = String(st.currentWordInstance * 2);
  const text2 = remapVarToRegisterOrImmediate(inputs[1]!);
  const text3 = remapVarToRegisterOrImmediate(inputs[2]!);
  const newValue2 = Object.prototype.hasOwnProperty.call(st.mulLeftShifts, text3)
    ? st.mulLeftShifts[text3]!
    : '';
  const text4 = inputs[3]!;
  let empty = '';
  empty += '\t\t\t\tmove.w\tAK_OpInstance+@IN(a5),d5\n';
  empty += '\t\t\t\tmove.w\td5,d6\n';
  empty += '\t\t\t\text.l\td6\n';
  empty += '\t\t\t\tasr.w\t#7,d5\n';
  if (Object.prototype.hasOwnProperty.call(st.mulLeftShifts, text3)) {
    empty += '\t\t\t\tasl.w\t@CS,d5\n';
    empty += '\t\t\t\text.l\td5\n';
  } else if (text3.includes('#')) {
    empty += '\t\t\t\tmuls\t@CO,d5\n';
  } else {
    empty += '\t\t\t\tmove.w\t@CO,d4\n';
    empty += '\t\t\t\tand.w\t#255,d4\n';
    empty += '\t\t\t\tmuls\td4,d5\n';
  }
  empty += '\t\t\t\tsub.l\td5,d6\n';
  empty += '\t\t\t\tmove.w\t@VL,d5\n';
  empty += '\t\t\t\tasr.w\t#7,d5\n';
  if (Object.prototype.hasOwnProperty.call(st.mulLeftShifts, text3)) {
    empty += '\t\t\t\tasl.w\t@CS,d5\n';
    empty += '\t\t\t\text.l\td5\n';
  } else if (text3.includes('#')) {
    empty += '\t\t\t\tmuls\t@CO,d5\n';
  } else {
    empty += '\t\t\t\tmove.w\t@CO,d4\n';
    empty += '\t\t\t\tand.w\t#255,d4\n';
    empty += '\t\t\t\tmuls\td4,d5\n';
  }
  empty += '\t\t\t\tadd.l\td6,d5\n';
  empty += '\t\t\t\tcmp.l\t#32767,d5\n';
  empty = empty + '\t\t\t\tble.s\t.NoClampMaxOPF_' + st.localLabel + '\n';
  empty += '\t\t\t\tmove.w\t#32767,d5\n';
  empty = empty + '\t\t\t\tbra.s\t.NoClampMinOPF_' + st.localLabel + '\n';
  empty = empty + '.NoClampMaxOPF_' + st.localLabel + '\n';
  empty += '\t\t\t\tcmp.l\t#-32768,d5\n';
  empty = empty + '\t\t\t\tbge.s\t.NoClampMinOPF_' + st.localLabel + '\n';
  empty += '\t\t\t\tmove.w\t#-32768,d5\n';
  empty = empty + '.NoClampMinOPF_' + st.localLabel + '\n';
  empty += '\t\t\t\tmove.w\td5,AK_OpInstance+@IN(a5)\n';
  if (text4 === '0') {
    empty += '\t\t\t\tmove.w\td5,@OR\n';
  } else if (text4 === '1') {
    if (text2 !== text) {
      empty += '\t\t\t\tmove.w\t@VL,@OR\n';
    }
    empty += '\t\t\t\tsub.w\td5,@OR\n';
  }
  empty = empty.replaceAll('@IN', newValue);
  empty = empty.replaceAll('@VL', text2);
  empty = empty.replaceAll('@CO', text3);
  empty = empty.replaceAll('@CS', newValue2);
  empty = empty.replaceAll('@OR', text);
  st.currentWordInstance++;
  return empty;
}

/** Program.cs Delay 936-1018. inputs = [instance, signalVar(VL), delayLen(DL,
 *  freq/freqVal), feedback(GN, gain/gainVal)]. Bumps currentLargeBufferInstance++
 *  and currentWordInstance++. */
export function delay(st: AkGenState, output: string, inputs: string[]): string {
  const newValue = remapVarToRegisterOrImmediate(output);
  const newValue2 = String(st.currentWordInstance * 2);
  const num = st.currentLargeBufferInstance * 4096;
  const newValue3 = String(num);
  const newValue4 = remapVarToRegisterOrImmediate(inputs[1]!);
  const text = remapVarToRegisterOrImmediate(inputs[2]!);
  const num2 = text.includes('#');
  const text2 = remapVarToRegisterOrImmediate(inputs[3]!);
  const newValue5 = Object.prototype.hasOwnProperty.call(st.mulRightShifts, text2)
    ? st.mulRightShifts[text2]!
    : '';
  let empty = '';
  empty += '\t\t\t\tmove.w\t@VL,d4\n';
  if (text2 !== '#128') {
    if (Object.prototype.hasOwnProperty.call(st.mulRightShifts, text2)) {
      empty += '\t\t\t\tasr.w\t@GS,@d4\n';
    } else if (text2.includes('#')) {
      empty += '\t\t\t\tmuls\t@GN,d4\n';
      empty += '\t\t\t\tasr.l\t#7,d4\n';
    } else {
      empty += '\t\t\t\tmove.w\t@GN,d5\n';
      empty += '\t\t\t\tand.w\t#255,d5\n';
      empty += '\t\t\t\tmuls\td5,d4\n';
      empty += '\t\t\t\tasr.l\t#7,d4\n';
    }
  }
  if (num === 0) {
    empty += '\t\t\t\tmove.l\ta1,a4\n';
  } else if (num < 32767) {
    empty += '\t\t\t\tlea\t\t@IN2(a1),a4\n';
  } else {
    empty += '\t\t\t\tmove.l\ta1,a4\n';
    empty += '\t\t\t\tadd.l\t#@IN2,a4\n';
  }
  empty += '\t\t\t\tmove.w\tAK_OpInstance+@IN1(a5),d5\n';
  empty += '\t\t\t\tmove.w\td4,(a4,d5.w)\n';
  if (num2) {
    empty += '\t\t\t\taddq.w\t#2,d5\n';
    empty += '\t\t\t\tcmp.w\t@DL<<1,d5\n';
    empty = empty + '\t\t\t\tblt.s\t.NoDelayReset_' + st.localLabel + '\n';
    empty += '\t\t\t\tmoveq\t#0,d5\n';
    empty = empty + '.NoDelayReset_' + st.localLabel + '\n';
    empty += '\t\t\t\tmove.w  d5,AK_OpInstance+@IN1(a5)\n';
    empty += '\t\t\t\tmove.w\t(a4,d5.w),@OR\n';
  } else {
    empty += '\t\t\t\tmove.w\t@DL,d6\n';
    empty += '               cmp.w\t#2047,d6\n';
    empty = empty + '\t\t\t\tble.s\t.NoClampDelay_' + st.localLabel + '\n';
    empty += '\t\t\t\tmove.w  #2047,d6\n';
    empty = empty + '.NoClampDelay_' + st.localLabel + '\n';
    empty += '\t\t\t\tadd.w\td6,d6\n';
    empty += '\t\t\t\taddq.w\t#2,d5\n';
    empty += '\t\t\t\tcmp.w\td6,d5\n';
    empty = empty + '\t\t\t\tblt.s\t.NoDelayReset_' + st.localLabel + '\n';
    empty += '\t\t\t\tmoveq\t#0,d5\n';
    empty = empty + '.NoDelayReset_' + st.localLabel + '\n';
    empty += '\t\t\t\tmove.w  d5,AK_OpInstance+@IN1(a5)\n';
    empty += '\t\t\t\tmove.w\t(a4,d5.w),@OR\n';
  }
  empty = empty.replaceAll('@IN1', newValue2);
  empty = empty.replaceAll('@IN2', newValue3);
  empty = empty.replaceAll('@VL', newValue4);
  empty = empty.replaceAll('@DL', text);
  empty = empty.replaceAll('@GN', text2);
  empty = empty.replaceAll('@GS', newValue5);
  empty = empty.replaceAll('@OR', newValue);
  st.currentLargeBufferInstance++;
  st.currentWordInstance++;
  return empty;
}

/** Program.cs CombFilter 1021-1138. inputs = [instance, signalVar(VL),
 *  delayLen(DL, freq/freqVal), feedback(FB, val2/val2Value, uses mulRightShifts),
 *  outGain(GN, gain/gainVal, uses mulRightShifts)]. Bumps currentLargeBufferInstance++
 *  and currentWordInstance++. */
export function combFilter(st: AkGenState, output: string, inputs: string[]): string {
  const newValue = remapVarToRegisterOrImmediate(output);
  const newValue2 = String(st.currentWordInstance * 2);
  const num = st.currentLargeBufferInstance * 4096;
  const newValue3 = String(num);
  const newValue4 = remapVarToRegisterOrImmediate(inputs[1]!);
  const text = remapVarToRegisterOrImmediate(inputs[2]!);
  const num2 = text.includes('#');
  const text2 = remapVarToRegisterOrImmediate(inputs[3]!);
  const newValue5 = Object.prototype.hasOwnProperty.call(st.mulRightShifts, text2)
    ? st.mulRightShifts[text2]!
    : '';
  const text3 = remapVarToRegisterOrImmediate(inputs[4]!);
  const newValue6 = Object.prototype.hasOwnProperty.call(st.mulRightShifts, text3)
    ? st.mulRightShifts[text3]!
    : '';
  let empty = '';
  if (num === 0) {
    empty += '\t\t\t\tmove.l\ta1,a4\n';
  } else if (num < 32767) {
    empty += '\t\t\t\tlea\t\t@IN2(a1),a4\n';
  } else {
    empty += '\t\t\t\tmove.l\ta1,a4\n';
    empty += '\t\t\t\tadd.l\t#@IN2,a4\n';
  }
  empty += '\t\t\t\tmove.w\tAK_OpInstance+@IN1(a5),d5\n';
  empty += '\t\t\t\tmove.w\t(a4,d5.w),d4\n';
  if (text2 !== '#128') {
    if (Object.prototype.hasOwnProperty.call(st.mulRightShifts, text2)) {
      empty += '\t\t\t\tasr.w\t@FS,d4\n';
    } else if (text2.includes('#')) {
      empty += '\t\t\t\tmuls\t@FB,d4\n';
      empty += '\t\t\t\tasr.l\t#7,d4\n';
    } else {
      empty += '\t\t\t\tmove.w\t@FB,d6\n';
      empty += '\t\t\t\tand.w\t#255,d6\n';
      empty += '\t\t\t\tmuls\td6,d4\n';
      empty += '\t\t\t\tasr.l\t#7,d4\n';
    }
  }
  empty += '\t\t\t\tadd.w\t@VL,d4\n';
  empty = empty + '\t\t\t\tbvc.s\t.CombAddNoClamp_' + st.localLabel + '\n';
  empty += '\t\t\t\tspl\t\td4\n';
  empty += '\t\t\t\text.w\td4\n';
  empty += '\t\t\t\teor.w\t#$7fff,d4\n';
  empty = empty + '.CombAddNoClamp_' + st.localLabel + '\n';
  empty += '\t\t\t\tmove.w\td4,(a4,d5.w)\n';
  if (num2) {
    empty += '\t\t\t\taddq.w\t#2,d5\n';
    empty += '\t\t\t\tcmp.w\t@DL<<1,d5\n';
    empty = empty + '\t\t\t\tblt.s\t.NoCombReset_' + st.localLabel + '\n';
    empty += '\t\t\t\tmoveq\t#0,d5\n';
    empty = empty + '.NoCombReset_' + st.localLabel + '\n';
    empty += '\t\t\t\tmove.w  d5,AK_OpInstance+@IN1(a5)\n';
  } else {
    empty += '\t\t\t\tmove.w\t@DL,d6\n';
    empty += '               cmp.w\t#2047,d6\n';
    empty = empty + '\t\t\t\tble.s\t.NoClampComb_' + st.localLabel + '\n';
    empty += '\t\t\t\tmove.w  #2047,d6\n';
    empty = empty + '.NoClampComb_' + st.localLabel + '\n';
    empty += '\t\t\t\tadd.w\td6,d6\n';
    empty += '\t\t\t\taddq.w\t#2,d5\n';
    empty += '\t\t\t\tcmp.w\td6,d5\n';
    empty = empty + '\t\t\t\tblt.s\t.NoCombReset_' + st.localLabel + '\n';
    empty += '\t\t\t\tmoveq\t#0,d5\n';
    empty = empty + '.NoCombReset_' + st.localLabel + '\n';
    empty += '\t\t\t\tmove.w  d5,AK_OpInstance+@IN1(a5)\n';
  }
  if (text3 !== '#128') {
    if (Object.prototype.hasOwnProperty.call(st.mulRightShifts, text3)) {
      empty += '\t\t\t\tmove.w\td4,@OR\n';
      empty += '\t\t\t\tasr.w\t@GS,@OR\n';
    } else if (text3.includes('#')) {
      empty += '\t\t\t\tmove.w\td4,@OR\n';
      empty += '\t\t\t\tmuls\t@GN,@OR\n';
      empty += '\t\t\t\tasr.l\t#7,@OR\n';
    } else {
      empty += '\t\t\t\tmove.w\t@GN,d5\n';
      empty += '\t\t\t\tand.w\t#255,d5\n';
      empty += '\t\t\t\tmove.w\td4,@OR\n';
      empty += '\t\t\t\tmuls\td5,@OR\n';
      empty += '\t\t\t\tasr.l\t#7,@OR\n';
    }
  } else {
    empty += '\t\t\t\tmove.w\td4,@OR\n';
  }
  empty = empty.replaceAll('@IN1', newValue2);
  empty = empty.replaceAll('@IN2', newValue3);
  empty = empty.replaceAll('@VL', newValue4);
  empty = empty.replaceAll('@DL', text);
  empty = empty.replaceAll('@GN', text3);
  empty = empty.replaceAll('@GS', newValue6);
  empty = empty.replaceAll('@FB', text2);
  empty = empty.replaceAll('@FS', newValue5);
  empty = empty.replaceAll('@OR', newValue);
  st.currentLargeBufferInstance++;
  st.currentWordInstance++;
  return empty;
}

/** Program.cs Reverb 1140-1257. dan-script: reverb(var1(signal->VL),
 *  val2(feedback FB, uses mulRightShifts), gain(output gain GN, uses
 *  mulRightShifts)). 8 comb buffers; each iteration bumps both
 *  currentLargeBufferInstance++ and currentWordInstance++. */
export function reverb(st: AkGenState, output: string, inputs: string[]): string {
  const newValue = remapVarToRegisterOrImmediate(output);
  const newValue2 = remapVarToRegisterOrImmediate(inputs[0]!);
  const text = remapVarToRegisterOrImmediate(inputs[1]!);
  const newValue3 = Object.prototype.hasOwnProperty.call(st.mulRightShifts, text)
    ? st.mulRightShifts[text]!
    : '';
  const text2 = remapVarToRegisterOrImmediate(inputs[2]!);
  const newValue4 = Object.prototype.hasOwnProperty.call(st.mulRightShifts, text2)
    ? st.mulRightShifts[text2]!
    : '';
  const array = [557, 593, 641, 677, 709, 743, 787, 809];
  let empty = '';
  empty += '\t\t\t\tmove.l\td7,-(sp)\n';
  empty += '\t\t\t\tsub.l\ta6,a6\n';
  for (let i = 0; i < 8; i++) {
    const newValue5 = String(st.currentWordInstance * 2);
    const num = st.currentLargeBufferInstance * 4096;
    const newValue6 = String(num);
    const newValue7 = '#' + array[i]!;
    if (num === 0) {
      empty += '\t\t\t\tmove.l\ta1,a4\n';
    } else if (num < 32767) {
      empty += '\t\t\t\tlea\t\t@IN2(a1),a4\n';
    } else {
      empty += '\t\t\t\tmove.l\ta1,a4\n';
      empty += '\t\t\t\tadd.l\t#@IN2,a4\n';
    }
    empty += '\t\t\t\tmove.w\tAK_OpInstance+@IN1(a5),d5\n';
    empty += '\t\t\t\tmove.w\t(a4,d5.w),d4\n';
    if (text !== '#128') {
      if (Object.prototype.hasOwnProperty.call(st.mulRightShifts, text)) {
        empty += '\t\t\t\tasr.w\t@FS,d4\n';
      } else if (text.includes('#')) {
        empty += '\t\t\t\tmuls\t@FB,d4\n';
        empty += '\t\t\t\tasr.l\t#7,d4\n';
      } else {
        empty += '\t\t\t\tmove.w\t@FB,d6\n';
        empty += '\t\t\t\tand.w\t#255,d6\n';
        empty += '\t\t\t\tmuls\td6,d4\n';
        empty += '\t\t\t\tasr.l\t#7,d4\n';
      }
    }
    empty += '\t\t\t\tadd.w\t@VL,d4\n';
    empty = empty + '\t\t\t\tbvc.s\t.ReverbAddNoClamp_' + st.localLabel + '_' + i + '\n';
    empty += '\t\t\t\tspl\t\td4\n';
    empty += '\t\t\t\text.w\td4\n';
    empty += '\t\t\t\teor.w\t#$7fff,d4\n';
    empty = empty + '.ReverbAddNoClamp_' + st.localLabel + '_' + i + '\n';
    empty += '\t\t\t\tmove.w\td4,(a4,d5.w)\n';
    empty += '\t\t\t\taddq.w\t#2,d5\n';
    empty += '\t\t\t\tcmp.w\t@DL<<1,d5\n';
    empty = empty + '\t\t\t\tble.s\t.NoReverbReset_' + st.localLabel + '_' + i + '\n';
    empty += '\t\t\t\tmoveq\t#0,d5\n';
    empty = empty + '.NoReverbReset_' + st.localLabel + '_' + i + '\n';
    empty += '\t\t\t\tmove.w  d5,AK_OpInstance+@IN1(a5)\n';
    if (text2 !== '#128') {
      if (Object.prototype.hasOwnProperty.call(st.mulRightShifts, text2)) {
        empty += '\t\t\t\tmove.w\td4,d7\n';
        empty += '\t\t\t\tasr.w\t@GS,d7\n';
      } else if (text2.includes('#')) {
        empty += '\t\t\t\tmove.w\td4,d7\n';
        empty += '\t\t\t\tmuls\t@GN,d7\n';
        empty += '\t\t\t\tasr.l\t#7,d7\n';
      } else {
        empty += '\t\t\t\tmove.w\t@GN,d5\n';
        empty += '\t\t\t\tand.w\t#255,d5\n';
        empty += '\t\t\t\tmove.w\td4,d7\n';
        empty += '\t\t\t\tmuls\td5,d7\n';
        empty += '\t\t\t\tasr.l\t#7,d7\n';
      }
      empty += '\t\t\t\tadd.w\td7,a6\n';
    } else {
      empty += '\t\t\t\tadd.w\td4,a6\n';
    }
    empty = empty.replaceAll('@IN1', newValue5);
    empty = empty.replaceAll('@IN2', newValue6);
    empty = empty.replaceAll('@VL', newValue2);
    empty = empty.replaceAll('@DL', newValue7);
    empty = empty.replaceAll('@GN', text2);
    empty = empty.replaceAll('@GS', newValue4);
    empty = empty.replaceAll('@FB', text);
    empty = empty.replaceAll('@FS', newValue3);
    empty = empty.replaceAll('@OR', newValue);
    st.currentLargeBufferInstance++;
    st.currentWordInstance++;
  }
  empty += '\t\t\t\tmove.l\ta6,d7\n';
  empty += '\t\t\t\tcmp.l\t#32767,d7\n';
  empty = empty + '\t\t\t\tble.s\t.NoReverbMax_' + st.localLabel + '\n';
  empty += '\t\t\t\tmove.w\t#32767,d7\n';
  empty = empty + '\t\t\t\tbra.s\t.NoReverbMin_' + st.localLabel + '\n';
  empty = empty + '.NoReverbMax_' + st.localLabel + '\n';
  empty += '\t\t\t\tcmp.l\t#-32768,d7\n';
  empty = empty + '\t\t\t\tbge.s\t.NoReverbMin_' + st.localLabel + '\n';
  empty += '\t\t\t\tmove.w\t#-32768,d7\n';
  empty = empty + '.NoReverbMin_' + st.localLabel + '\n';
  empty += '\t\t\t\tmove.w\td7,@OR\n';
  empty += '\t\t\t\tmove.l\t(sp)+,d7\n';
  return empty.replaceAll('@OR', newValue);
}

/** Program.cs Sample_And_Hold 732-768. dan-script: sh(instance, var1(signal->VL),
 *  gain(STR, the S&H trigger source; uses varlit gain/gainVal)). val1 must be
 *  non-zero (errIfVal1Zero). Bumps currentWordInstance += 2. */
export function sampleHold(st: AkGenState, output: string, inputs: string[]): string {
  const newValue = remapVarToRegisterOrImmediate(output);
  const newValue2 = String(st.currentWordInstance * 2);
  const newValue3 = String(st.currentWordInstance * 2 + 2);
  const newValue4 = remapVarToRegisterOrImmediate(inputs[1]!);
  const text = remapVarToRegisterOrImmediate(inputs[2]!);
  let newValue5 = '';
  const num = text.includes('#');
  let text2 = '';
  if (!num) {
    text2 += '\t\t\t\tmove.w\t@STR,d4\n';
    text2 += '\t\t\t\tand.w\t#255,d4\n';
    text2 += '\t\t\t\tmuls\td4,d4\n';
    text2 += '\t\t\t\tasr.l\t#2,d4\n';
  } else {
    const num2 = Number.parseInt(inputs[2]!, 10);
    newValue5 = '#' + ((num2 * num2) >> 2);
  }
  text2 += '\t\t\t\tsub.w\t#1,AK_OpInstance+@IN1(a5)\n';
  text2 = text2 + '\t\t\t\tbge.s\t.SHNoStore_' + st.localLabel + '\n';
  text2 += '\t\t\t\tmove.w\t@VL,AK_OpInstance+@IN2(a5)\n';
  text2 = num
    ? text2 + '\t\t\t\tmove.w\t@STI,AK_OpInstance+@IN1(a5)\n'
    : text2 + '\t\t\t\tmove.w\td4,AK_OpInstance+@IN1(a5)\n';
  text2 = text2 + '.SHNoStore_' + st.localLabel + '\n';
  text2 += '\t\t\t\tmove.w\tAK_OpInstance+@IN2(a5),@OR\n';
  text2 = text2.replaceAll('@IN1', newValue2);
  text2 = text2.replaceAll('@IN2', newValue3);
  text2 = text2.replaceAll('@STR', text);
  text2 = text2.replaceAll('@STI', newValue5);
  text2 = text2.replaceAll('@VL', newValue4);
  text2 = text2.replaceAll('@OR', newValue);
  st.currentWordInstance += 2;
  return text2;
}

/** Program.cs Distortion 1431-1481. dan-script: distortion(var1(signal->VL),
 *  gain(GN, the distortion amount; varlit gain/gainVal, uses mulLeftShifts)).
 *  Note: when gain has no '#' (a variable selector), the gain is masked to 8
 *  bits (and.w #255) then muls; const power-of-2 gains use the mulLeftShifts
 *  asl path; other const gains use muls directly. */
export function distortion(st: AkGenState, output: string, inputs: string[]): string {
  const newValue = remapVarToRegisterOrImmediate(output);
  const newValue2 = remapVarToRegisterOrImmediate(inputs[0]!);
  const text = remapVarToRegisterOrImmediate(inputs[1]!);
  const newValue3 = Object.prototype.hasOwnProperty.call(st.mulLeftShifts, text)
    ? st.mulLeftShifts[text]!
    : '';
  let empty = '';
  empty += '\t\t\t\tmove.w\t@VL,d5\n';
  if (!text.includes('#')) {
    empty += '\t\t\t\tmove.w\t@GN,d4\n';
    empty += '\t\t\t\tand.w\t#255,d4\n';
    empty += '\t\t\t\tmuls\td4,d5\n';
    empty += '\t\t\t\tasr.l\t#5,d5\n';
  } else if (Object.prototype.hasOwnProperty.call(st.mulLeftShifts, text)) {
    empty += '\t\t\t\text.l\td5\n';
    empty += '\t\t\t\tasl.l\t@GS,d5\n';
    empty += '\t\t\t\tasr.l\t#5,d5\n';
  } else {
    empty += '\t\t\t\tmuls\t@GN,d5\n';
    empty += '\t\t\t\tasr.l\t#5,d5\n';
  }
  empty += '\t\t\t\tcmp.l\t#32767,d5\n';
  empty = empty + '\t\t\t\tble.s\t.NoClampMaxDist_' + st.localLabel + '\n';
  empty += '\t\t\t\tmove.w\t#32767,d5\n';
  empty = empty + '\t\t\t\tbra.s\t.NoClampMinDist_' + st.localLabel + '\n';
  empty = empty + '.NoClampMaxDist_' + st.localLabel + '\n';
  empty += '\t\t\t\tcmp.l\t#-32768,d5\n';
  empty = empty + '\t\t\t\tbge.s\t.NoClampMinDist_' + st.localLabel + '\n';
  empty += '\t\t\t\tmove.w\t#-32768,d5\n';
  empty = empty + '.NoClampMinDist_' + st.localLabel + '\n';
  empty += '\t\t\t\tasr.w\t#1,d5\n';
  empty += '\t\t\t\tmove.w\td5,@OR\n';
  empty = empty + '\t\t\t\tbge.s\t.DistNoAbs_' + st.localLabel + '\n';
  empty += '\t\t\t\tneg.w\td5\n';
  empty = empty + '.DistNoAbs_' + st.localLabel + '\n';
  empty += '\t\t\t\tmove.w\t#32767,d6\n';
  empty += '\t\t\t\tsub.w\td5,d6\n';
  empty += '\t\t\t\tmuls\td6,@OR\n';
  empty += '\t\t\t\tswap\t@OR\n';
  empty += '\t\t\t\tasl.w\t#3,@OR\n';
  empty = empty.replaceAll('@VL', newValue2);
  empty = empty.replaceAll('@GN', text);
  empty = empty.replaceAll('@GS', newValue3);
  return empty.replaceAll('@OR', newValue);
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
  { match: 'sh(', gen: sampleHold },
  { match: 'envd(', gen: envDecay },
  { match: 'enva(', gen: envAttack },
  { match: 'mul(', gen: mul },
  { match: 'add(', gen: add },
  { match: 'ctrl(', gen: control },
  { match: 'dly_cyc(', gen: delay },
  { match: 'cmb_flt_n(', gen: combFilter },
  { match: 'reverb(', gen: reverb },
  { match: 'sv_flt_n(', gen: svFilter },
  { match: 'onepole_flt(', gen: onePoleFilter },
  { match: 'chordgen(', gen: stub('chordgen') },
  { match: 'clone(', gen: stub('clone') },
  { match: 'clone_reverse(', gen: stub('clone_reverse') },
  { match: 'imported_sample(', gen: stub('imported_sample') },
  { match: 'distortion(', gen: distortion },
  { match: 'adsr(', gen: stub('adsr') },
];

export function dispatchOp(st: AkGenState, stmt: string, output: string, inputs: string[]): string {
  for (const { match, gen } of OP_DISPATCH) {
    if (stmt.includes(match)) return gen(st, output, inputs);
  }
  // Main has no else: an unrecognised statement contributes nothing.
  return '';
}
