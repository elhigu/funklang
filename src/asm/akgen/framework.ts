// Framework — ports Aklang2Asm's Main scaffolding (Program.cs 76-465) EXCEPT
// the per-op dispatch (which lives in ops.ts), plus ClearVarsCode (1784) and
// VarsCode (1742). The per-instrument loop calls back into a dispatch hook.

import type { AkGenState } from './state';
import { dividerCode } from './helpers';

/** A parsed instrument from the dan-script. */
export interface ParsedInstrument {
  /** [name, length, repeatOffset, repeatLength, loop] */
  header: string[];
  /** op statements (the `vN = op(args)` text), empties removed. */
  statements: string[];
}

/** Hook that emits the body of one op statement. */
export type DispatchHook = (st: AkGenState, stmt: string) => string;

/** Program.cs ClearVarsCode 1784 (label `AK_ResetVars`). */
function clearVarsCode(st: AkGenState): string {
  let empty = '';
  empty += 'AK_ResetVars:\n';
  empty += '\t\t\t\tmoveq   #0,d1\n';
  empty += '\t\t\t\tmoveq   #0,d2\n';
  empty += '\t\t\t\tmoveq   #0,d3\n';
  if (st.maxLargeBufferInstance > 0) {
    empty += '\t\t\t\tmove.w  d0,d7\n';
    empty += '\t\t\t\tbeq.s\t.NoClearDelay\n';
    empty += '\t\t\t\tlsl.w\t#8,d7\n';
    empty += '\t\t\t\tsubq.w\t#1,d7\n';
    empty += '\t\t\t\tmove.l  a1,a6\n';
    empty += '.ClearDelayLoop\n';
    empty += '\t\t\t\tmove.l  d1,(a6)+\n';
    empty += '\t\t\t\tmove.l  d1,(a6)+\n';
    empty += '\t\t\t\tmove.l  d1,(a6)+\n';
    empty += '\t\t\t\tmove.l  d1,(a6)+\n';
    empty += '\t\t\t\tdbra\td7,.ClearDelayLoop\n';
    empty += '.NoClearDelay\n';
  }
  empty += '\t\t\t\tmoveq   #0,d0\n';
  if (st.maxWordInstance > 0 || st.maxEnvdInstance > 0) {
    empty += '\t\t\t\tlea\t\tAK_OpInstance(a5),a6\n';
  }
  if (st.maxWordInstance > 0) {
    for (let i = 0; i < Math.floor(st.maxWordInstance / 2); i++) {
      empty += '\t\t\t\tmove.l\td0,(a6)+\n';
    }
  }
  if (st.maxEnvdInstance > 0) {
    if (st.maxEnvdInstance === 1) {
      empty += '\t\t\t\tmove.l  #32767<<16,(a6)+\n';
    } else {
      empty += '\t\t\t\tmove.l  #32767<<16,d6\n';
      for (let j = 0; j < st.maxEnvdInstance; j++) {
        empty += '\t\t\t\tmove.l\td6,(a6)+\n';
      }
    }
  }
  return empty + '\t\t\t\trts\n';
}

/** Program.cs VarsCode 1742 (label `AK_Vars`). */
function varsCode(st: AkGenState): string {
  let empty = '';
  empty += '\t\t\t\trsreset\n';
  empty += 'AK_LPF\t\t\trs.w\t1\n';
  empty += 'AK_HPF\t\t\trs.w\t1\n';
  empty += 'AK_BPF\t\t\trs.w\t1\n';
  empty += '\t\t\t\trsreset\n';
  empty += 'AK_CHORD1\t\trs.l\t1\n';
  empty += 'AK_CHORD2\t\trs.l\t1\n';
  empty += 'AK_CHORD3\t\trs.l\t1\n';
  empty += '\t\t\t\trsreset\n';
  empty += 'AK_SmpLen\t\trs.l\t31\n';
  empty += 'AK_ExtSmpLen\trs.l\t8\n';
  if (st.usedNoise) {
    empty += 'AK_NoiseSeeds\trs.l\t3\n';
  }
  empty += 'AK_SmpAddr\t\trs.l\t31\n';
  empty += 'AK_ExtSmpAddr\trs.l\t8\n';
  empty += 'AK_OpInstance\trs.w    %MAXWORDINSTANCES%\n';
  empty += 'AK_EnvDValue\trs.l\t%MAXENVDINSTANCES%\n';
  empty += 'AK_VarSize\t\trs.w\t0\n';
  empty += '\n';
  empty += 'AK_Vars:\n';
  for (let i = 0; i < 31; i++) {
    if (i >= st.instrumentLength.length) {
      empty += '\t\t\t\tdc.l\t$00000000\t\t; Instrument ' + (i + 1) + ' Length \n';
    } else {
      empty += '\t\t\t\tdc.l\t$' + toHex8(st.instrumentLengthInt[i]!) + '\t\t; Instrument ' + (i + 1) + ' Length \n';
    }
  }
  for (let j = 0; j < 8; j++) {
    if (j >= st.externalSampleLength.length) {
      empty += '\t\t\t\tdc.l\t$00000000\t\t; External Sample ' + (j + 1) + ' Length \n';
    } else {
      empty += '\t\t\t\tdc.l\t$' + toHex8(st.externalSampleLengthInt[j]!) + '\t\t; External Sample ' + (j + 1) + ' Length \n';
    }
  }
  if (st.usedNoise) {
    empty += '\t\t\t\tdc.l\t$67452301\t\t; AK_NoiseSeed1\n';
    empty += '\t\t\t\tdc.l\t$efcdab89\t\t; AK_NoiseSeed2\n';
    empty += '\t\t\t\tdc.l\t$00000000\t\t; AK_NoiseSeed3\n';
  }
  return empty + '\t\t\t\tds.b\tAK_VarSize-AK_SmpAddr\n';
}

/** C#'s int.ToString("x8") — lowercase, 8-wide, zero-padded. */
function toHex8(n: number): string {
  // C# formats a 32-bit int; emulate via >>>0 for the values we see (lengths).
  return (n >>> 0).toString(16).padStart(8, '0');
}

/**
 * Emit the whole assembly. `parsed` are the parsed instruments (in order);
 * `dispatch` emits each op body and is responsible for instance bookkeeping.
 */
export function emitFramework(
  st: AkGenState,
  parsed: ParsedInstrument[],
  dispatch: DispatchHook,
): string {
  let empty = '';
  empty += dividerCode();
  empty += ';\n';
  empty += '; Generated with Aklang2Asm V1.1, by Dan/Lemon. 2021-2022.\n';
  empty += ';\n';
  empty += "; Based on Alcatraz Amigaklang rendering core. (c) Jochen 'Virgill' Feldkötter 2020.\n";
  empty += ';\n';
  empty += "; What's new in V1.1?\n";
  empty += '; - Instance offsets fixed in ADSR operator\n';
  empty += '; - Incorrect shift direction fixed in OnePoleFilter operator\n';
  empty += '; - Loop Generator now correctly interleaved with instrument generation\n';
  empty += '; - Fine progress includes loop generation, and new AK_FINE_PROGRESS_LEN added\n';
  empty += '; - Reverb large buffer instance offsets were wrong, causing potential buffer overrun\n';
  empty += ';\n';
  empty += "; Call 'AK_Generate' with the following registers set:\n";
  empty += '; a0 = Sample Buffer Start Address\n';
  empty += '; a1 = %LARGEBUFFSIZE% Bytes Temporary Work Buffer Address (can be freed after sample rendering complete)\n';
  empty += '; a2 = External Samples Address (need not be in chip memory, and can be freed after sample rendering complete)\n';
  empty += '; a3 = Rendering Progress Address (2 modes available... see below)\n';
  empty += ';\n';
  empty += '; AK_FINE_PROGRESS equ 0 = rendering progress as a byte (current instrument number)\n';
  empty += '; AK_FINE_PROGRESS equ 1 = rendering progress as a long (current sample byte)\n';
  empty += ';\n';
  empty += dividerCode();
  empty += '\n';
  empty += 'AK_USE_PROGRESS\t\t\tequ ' + (st.useProgress ? '1' : '0') + '\n';
  empty += 'AK_FINE_PROGRESS\t\tequ ' + (st.useFineProgress ? '1' : '0') + '\n';
  empty += 'AK_FINE_PROGRESS_LEN\tequ %FINEPROGRESSLEN%\n';
  empty += 'AK_SMP_LEN\t\t\t\tequ %SAMPLESIZE%\n';
  empty += 'AK_EXT_SMP_LEN\t\t\tequ ' + st.externalSampleTotalLength + '\n';
  empty += '\n';
  empty += 'AK_Generate:\n';
  empty += '\n';
  empty += '\t\t\t\tlea\t\tAK_Vars(pc),a5\n';
  empty += '\n';
  empty += '\t\t\t\tifne\tAK_USE_PROGRESS\n';
  empty += '\t\t\t\t\tifeq\tAK_FINE_PROGRESS\n';
  empty += '\t\t\t\t\t\tmove.b\t#-1,(a3)\n';
  empty += '\t\t\t\t\telse\n';
  empty += '\t\t\t\t\t\tmove.l\t#0,(a3)\n';
  empty += '\t\t\t\t\tendif\n';
  empty += '\t\t\t\tendif\n';
  empty += '\n';
  empty += '\t\t\t\t; Create sample & external sample base addresses\n';
  empty += '\t\t\t\tlea\t\tAK_SmpLen(a5),a6\n';
  empty += '\t\t\t\tlea\t\tAK_SmpAddr(a5),a4\n';
  empty += '\t\t\t\tmove.l\ta0,d0\n';
  empty += '\t\t\t\tmoveq\t#31-1,d7\n';
  empty += '.SmpAdrLoop\t\tmove.l\td0,(a4)+\n';
  empty += '\t\t\t\tadd.l\t(a6)+,d0\n';
  empty += '\t\t\t\tdbra\td7,.SmpAdrLoop\n';
  empty += '\t\t\t\tmove.l\ta2,d0\n';
  empty += '\t\t\t\tmoveq\t#8-1,d7\n';
  empty += '.ExtSmpAdrLoop\tmove.l\td0,(a4)+\n';
  empty += '\t\t\t\tadd.l\t(a6)+,d0\n';
  empty += '\t\t\t\tdbra\td7,.ExtSmpAdrLoop\n';
  empty += '\n';
  if (st.externalSampleTotalLength > 0) {
    empty += '\t\t\t\t; Convert external samples from stored deltas\n';
    empty += '\t\t\t\tmove.l\ta2,a6\n';
    empty += '\t\t\t\tmove.w\t#AK_EXT_SMP_LEN-1,d7\n';
    empty += '\t\t\t\tmoveq\t#0,d0\n';
    empty += '.DeltaLoop\t\tadd.b\t(a6),d0\n';
    empty += '\t\t\t\tmove.b\td0,(a6)+\n';
    empty += '\t\t\t\tdbra\td7,.DeltaLoop\n';
    empty += '\n';
  }

  for (let j = 0; j < parsed.length; j++) {
    const { header, statements } = parsed[j]!;
    st.instrumentName.push(header[0]!);
    st.instrumentLength.push(header[1]!);
    st.instrumentLengthInt.push(parseInt(header[1]!, 10));
    st.sampleTotalLength += parseInt(header[1]!, 10);
    st.fineProgressLength += parseInt(header[1]!, 10);
    st.instrumentRepeatOffset.push(header[2]!);
    st.instrumentRepeatLength.push(header[3]!);
    st.instrumentLoop.push(header[4]!);

    if (statements.length === 0) {
      empty += dividerCode();
      empty += '; Empty Instrument\n';
      empty += dividerCode();
      empty += '\n';
      const num3 = parseInt(st.instrumentLength[j]!, 10);
      if (num3 !== 0) {
        if (num3 <= 8) {
          empty += '\t\t\t\taddq.w\t#' + st.instrumentLength[j] + ',a0\n';
        } else if (num3 > 32767) {
          empty += '\t\t\t\tadd.l\t#' + st.instrumentLength[j] + ',a0\n';
        } else {
          empty += '\t\t\t\tlea\t\t' + st.instrumentLength[j] + '(a0),a0\n';
        }
        if (num3 <= 8) {
          empty += '\t\t\t\tifne\tAK_USE_PROGRESS\n';
          empty += '\t\t\t\t\tifeq\tAK_FINE_PROGRESS\n';
          empty += '\t\t\t\t\t\taddq.b\t#1,(a3)\n';
          empty += '\t\t\t\t\telse\n';
          empty += '\t\t\t\t\t\taddq.l\t#' + st.instrumentLength[j] + ',(a3)\n';
          empty += '\t\t\t\t\tendif\n';
          empty += '\t\t\t\tendif\n';
        } else {
          empty += '\t\t\t\tifne\tAK_USE_PROGRESS\n';
          empty += '\t\t\t\t\tifeq\tAK_FINE_PROGRESS\n';
          empty += '\t\t\t\t\t\taddq.b\t#1,(a3)\n';
          empty += '\t\t\t\t\telse\n';
          empty += '\t\t\t\t\t\tadd.l\t#' + st.instrumentLength[j] + ',(a3)\n';
          empty += '\t\t\t\t\tendif\n';
          empty += '\t\t\t\tendif\n';
        }
        empty += '\n';
      }
      continue;
    }

    empty += dividerCode();
    empty += '; Instrument ' + (j + 1) + ' - ' + st.instrumentName[j] + '\n';
    empty += dividerCode();
    empty += '\n';
    empty +=
      j !== 0
        ? '\t\t\t\tmoveq\t#' + st.currentLargeBufferInstance + ',d0\n'
        : '\t\t\t\tmoveq\t#%MAXLARGEBUFFERINSTANCES%,d0\n';
    empty += '\t\t\t\tbsr\t\tAK_ResetVars\n';
    empty += '\t\t\t\tmoveq\t#0,d7\n';
    empty += '\t\t\t\tifne\tAK_USE_PROGRESS\n';
    empty += '\t\t\t\t\tifeq\tAK_FINE_PROGRESS\n';
    empty += '\t\t\t\t\t\taddq.b\t#1,(a3)\n';
    empty += '\t\t\t\t\tendif\n';
    empty += '\t\t\t\tendif\n';
    empty += '.Inst' + (j + 1) + 'Loop\n';
    st.currentLargeBufferInstance = 0;
    st.currentWordInstance = 0;
    st.currentEnvDInstance = 0;

    for (let k = 0; k < statements.length; k++) {
      const stmt = statements[k]!;
      st.localLabel = (j + 1) + '_' + (k + 1);
      empty += '\t\t\t\t; ' + stmt + '\n';
      empty += dispatch(st, stmt);
      empty += '\n';
    }

    empty += '\t\t\t\tasr.w\t#8,d0\n';
    empty += '\t\t\t\tmove.b\td0,(a0)+\n';
    empty += '\t\t\t\tifne\tAK_USE_PROGRESS\n';
    empty += '\t\t\t\t\tifne\tAK_FINE_PROGRESS\n';
    empty += '\t\t\t\t\t\taddq.l\t#1,(a3)\n';
    empty += '\t\t\t\t\tendif\n';
    empty += '\t\t\t\tendif\n';
    empty += '\t\t\t\taddq.l\t#1,d7\n';
    empty += '\t\t\t\tcmp.l\tAK_SmpLen+' + (j << 2) + '(a5),d7\n';
    empty += '\t\t\t\tblt\t\t.Inst' + (j + 1) + 'Loop\n';
    empty += '\n';

    if (st.instrumentLoop[j] === 'Y') {
      empty += '\t\t\t\tmovem.l a0-a1,-(sp)\t;Stash sample base address & large buffer address for loop generator\n';
    }
    if (st.currentLargeBufferInstance > st.maxLargeBufferInstance) {
      st.maxLargeBufferInstance = st.currentLargeBufferInstance;
    }
    if (st.currentWordInstance > st.maxWordInstance) {
      st.maxWordInstance = st.currentWordInstance;
    }
    if (st.currentEnvDInstance > st.maxEnvdInstance) {
      st.maxEnvdInstance = st.currentEnvDInstance;
    }
    if (st.instrumentLoop[j] === 'Y') {
      empty += '\n';
      empty += dividerCode();
      empty +=
        '; Instrument ' + (j + 1) + ' - Loop Generator (Offset: ' +
        st.instrumentRepeatOffset[j] + ' Length: ' + st.instrumentRepeatLength[j] + '\n';
      empty += dividerCode();
      empty += '\n';
      empty += loopGenerator(st, st.instrumentRepeatLength[j]!, st.instrumentRepeatOffset[j]!, String(j));
      empty += '\n';
      empty += '\t\t\t\tmovem.l (sp)+,a0-a1\t;Restore sample base address & large buffer address after loop generator\n';
      empty += '\n';
    }
  }

  if ((st.maxWordInstance & 1) === 1) {
    st.maxWordInstance++;
  }
  empty += '\n';
  empty += dividerCode();
  empty += '\n';
  empty += '\t\t\t\t; Clear first 2 bytes of each sample\n';
  empty += '\t\t\t\tlea\t\tAK_SmpAddr(a5),a6\n';
  empty += '\t\t\t\tmoveq\t#0,d0\n';
  empty += '\t\t\t\tmoveq\t#31-1,d7\n';
  empty += '.SmpClrLoop\t\tmove.l\t(a6)+,a4\n';
  empty += '\t\t\t\tmove.b\td0,(a4)+\n';
  empty += '\t\t\t\tmove.b\td0,(a4)+\n';
  empty += '\t\t\t\tdbra\td7,.SmpClrLoop\n';
  empty += '\n';
  empty += '\t\t\t\trts\n';
  empty += '\n';
  empty += dividerCode();
  empty += '\n';
  empty += clearVarsCode(st);
  empty += '\n';
  empty += dividerCode();
  empty += '\n';
  empty += varsCode(st);
  empty += '\n';
  empty += dividerCode();

  empty = empty.replaceAll('%SAMPLESIZE%', String(st.sampleTotalLength));
  empty = empty.replaceAll('%FINEPROGRESSLEN%', String(st.fineProgressLength));
  empty = empty.replaceAll('%LARGEBUFFSIZE%', String(st.maxLargeBufferInstance * 4096));
  empty = empty.replaceAll('%MAXLARGEBUFFERINSTANCES%', String(st.maxLargeBufferInstance));
  empty = empty.replaceAll('%MAXWORDINSTANCES%', String(st.maxWordInstance));
  empty = empty.replaceAll('%MAXENVDINSTANCES%', String(st.maxEnvdInstance));
  return empty;
}

// LoopGenerator stub — interleave hook (Program.cs 1637). Not yet ported;
// throws if a patch actually uses a loop generator.
function loopGenerator(_st: AkGenState, _repeatLength: string, _repeatOffset: string, _instrument: string): string {
  throw new Error('akgen: LoopGenerator not implemented');
}
