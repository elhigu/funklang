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
  { match: 'envd(', gen: envDecay },
  { match: 'enva(', gen: envAttack },
  { match: 'mul(', gen: mul },
  { match: 'add(', gen: add },
  { match: 'ctrl(', gen: control },
  { match: 'dly_cyc(', gen: stub('dly_cyc') },
  { match: 'cmb_flt_n(', gen: stub('cmb_flt_n') },
  { match: 'reverb(', gen: stub('reverb') },
  { match: 'sv_flt_n(', gen: svFilter },
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
