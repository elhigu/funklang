// CLI: npx tsx tests/asm/akgen/check.ts <opName>
// Builds the fixture patch for <opName>, computes oracle bytes (asmBinFromPatch)
// and mine (emitAkGenerate -> assembleM68k), prints PASS or FAIL with the first
// differing byte offset and a short asm diff. Needs mono for the oracle:
//   nix-shell -p mono --run 'npx tsx tests/asm/akgen/check.ts osc_saw'

import { emptyPatch, emptySlot, type Patch } from '../../../src/patch/types';
import { asmBinFromPatch } from '../../../sizelab/harness/asm-bin';
import { emitAkGenerate } from '../../../src/asm/akgen';
import { assembleM68k } from '../../../src/asm/vasm';

function fixture(key: string): Patch {
  const p = emptyPatch();
  const ins = p.instruments[0]!;
  ins.name = 't';
  ins.sampleLength = 4096;

  switch (key) {
    case 'empty':
      // No slots — exercises the empty-instrument framework branch.
      ins.slots = [];
      break;
    case 'vol':
      // Volume 465-498. inputs = [val1(source var), gain(GN)].
      //  - power-of-2 gain (64 -> asr/GS path), out!=src (move emitted)
      //  - non-power-of-2 gain (50 -> muls/TR1=#50 path), out!=src
      //  - gain 128 (-> scaling skipped; only the move)
      //  - variable gain operand (-> non-# path: move/and @GN,@TR1; TR1=d4)
      //  - out == src (val1==outVar) -> the @OR==@VAL no-move branch
      ins.slots = [
        { ...emptySlot(), fn: 1, outVar: 1, val1: 2, gainVal: 64 },
        { ...emptySlot(), fn: 1, outVar: 2, val1: 3, gainVal: 50 },
        { ...emptySlot(), fn: 1, outVar: 3, val1: 4, gainVal: 128 },
        { ...emptySlot(), fn: 1, outVar: 4, val1: 1, gain: 1 },
        { ...emptySlot(), fn: 1, outVar: 1, val1: 1, gainVal: 50 },
      ];
      break;
    case 'osc_saw':
      // Three osc_saw across value classes:
      //  - power-of-2 gain (64 -> asr shift path)
      //  - non-power-of-2 gain (50 -> muls path)
      //  - special-case gain 128 (-> straight move)
      ins.slots = [
        { ...emptySlot(), fn: 2, outVar: 1, freqVal: 1000, gainVal: 64 },
        { ...emptySlot(), fn: 2, outVar: 2, freqVal: 1234, gainVal: 50 },
        { ...emptySlot(), fn: 2, outVar: 3, freqVal: 777, gainVal: 128 },
        // variable gain operand (gain selector -> v1 ... uses muls/var path)
        { ...emptySlot(), fn: 2, outVar: 4, freqVal: 555, gain: 1 },
      ];
      break;
    case 'osc_tri':
      // Four osc_tri across value classes (Osc_Tri 539-580):
      //  - power-of-2 gain (64 -> asr shift path)
      //  - non-power-of-2 gain (50 -> muls path)
      //  - gain 128 (-> text != "#128" guard skips scaling)
      //  - variable gain operand (-> non-# path with d4/TR1)
      ins.slots = [
        { ...emptySlot(), fn: 3, outVar: 1, freqVal: 1000, gainVal: 64 },
        { ...emptySlot(), fn: 3, outVar: 2, freqVal: 1234, gainVal: 50 },
        { ...emptySlot(), fn: 3, outVar: 3, freqVal: 777, gainVal: 128 },
        { ...emptySlot(), fn: 3, outVar: 4, freqVal: 555, gain: 1 },
      ];
      break;
    case 'osc_sine':
      // Osc_Sine 647-693. inputs = [instance, freq, gain(GN)].
      //  - power-of-2 gain (64 -> asr/GS path)
      //  - non-power-of-2 gain (50 -> muls/TR1=#50 path)
      //  - gain 128 (-> text != "#128" guard skips scaling)
      //  - variable gain operand (-> non-# path: move/and @GN,@TR1; TR1=d4)
      ins.slots = [
        { ...emptySlot(), fn: 4, outVar: 1, freqVal: 1000, gainVal: 64 },
        { ...emptySlot(), fn: 4, outVar: 2, freqVal: 1234, gainVal: 50 },
        { ...emptySlot(), fn: 4, outVar: 3, freqVal: 777, gainVal: 128 },
        { ...emptySlot(), fn: 4, outVar: 4, freqVal: 555, gain: 1 },
      ];
      break;
    case 'osc_pulse':
      // Osc_Pulse 581-645. inputs = [instance, freq, gain(GN), width(DC)].
      // Cover gain classes x width classes:
      ins.slots = [
        // gain power-of-2 (64 -> asr/GS path); width const != 63 (cmp.w path)
        { ...emptySlot(), fn: 5, outVar: 1, freqVal: 1000, gainVal: 64, widthVal: 40 },
        // gain non-power-of-2 (50 -> muls/TR2 path); width const == 63 (no cmp emitted)
        { ...emptySlot(), fn: 5, outVar: 2, freqVal: 1234, gainVal: 50, widthVal: 63 },
        // gain 128 (-> scaling skipped); width variable, differs from gain (move @DC,@TR1)
        { ...emptySlot(), fn: 5, outVar: 3, freqVal: 777, gainVal: 128, width: 2 },
        // variable gain (no '#' -> TR2=d5 path); variable width EQUAL to gain (move @TR2,@TR1)
        { ...emptySlot(), fn: 5, outVar: 4, freqVal: 555, gain: 1, width: 1 },
      ];
      break;
    case 'osc_noise':
      // Osc_Noise 694-730. dan-script is osc_noise(smp, <gain>); the oracle's
      // inputs[0] is the `smp` token -> RemapVar -> 'd7'. The method ignores
      // the gain arg entirely, so every slot drives the SAME reachable path:
      // 'd7' has no '#', is != '#128' and not in mulRightShifts -> the
      // move/and @GN,@TR1(d4) + muls d4 / asr.l #7 branch.
      // We still vary gainVal across const/power-of-2/non-power-of-2 to prove
      // the gain has no effect on emitted bytes, plus a variable gain operand.
      ins.slots = [
        { ...emptySlot(), fn: 6, outVar: 1, gainVal: 64 },
        { ...emptySlot(), fn: 6, outVar: 2, gainVal: 50 },
        { ...emptySlot(), fn: 6, outVar: 3, gainVal: 128 },
        { ...emptySlot(), fn: 6, outVar: 4, gain: 1 },
      ];
      break;
    case 'add':
      // Add 891-918. inputs = [val1(selector->v?), val2(varlit: sel->v? else literal)].
      // Cover the three output/operand branches + value classes:
      //  - out != in1 != in2, const non-power-of-2 val2 (50) -> move/add path
      //  - out != in1 != in2, const power-of-2 val2 (64) -> move/add path (no shift in Add)
      //  - out == in1 (val1 selector == outVar) -> add.w @V2,@OR branch
      //  - out == in2 (val2 selector == outVar) -> add.w @V1,@OR branch
      ins.slots = [
        { ...emptySlot(), fn: 9, outVar: 1, val1: 2, val2Value: 50 },
        { ...emptySlot(), fn: 9, outVar: 2, val1: 3, val2Value: 64 },
        { ...emptySlot(), fn: 9, outVar: 3, val1: 3, val2Value: 50 },
        { ...emptySlot(), fn: 9, outVar: 4, val1: 1, val2: 4 },
      ];
      break;
    case 'mul':
      // Mul 865-888. inputs = [val1(selector->v?), val2(varlit: sel->v? else literal)].
      // Cover the three output/operand branches + value classes:
      //  - out != in1 != in2, const non-power-of-2 val2 (50) -> move/muls path
      //  - out != in1 != in2, const power-of-2 val2 (64) -> move/muls path (no special-casing in Mul)
      //  - out == in1 (val1 selector == outVar) -> muls @V2,@OR branch
      //  - out == in2 (val2 selector == outVar) -> muls @V1,@OR branch (variable operand)
      ins.slots = [
        { ...emptySlot(), fn: 10, outVar: 1, val1: 2, val2Value: 50 },
        { ...emptySlot(), fn: 10, outVar: 2, val1: 3, val2Value: 64 },
        { ...emptySlot(), fn: 10, outVar: 3, val1: 3, val2Value: 50 },
        { ...emptySlot(), fn: 10, outVar: 4, val1: 1, val2: 4 },
      ];
      break;
    case 'ctrl':
      // Control 920-934. dan-script: vN = ctrl(vM); inputs = [source var (val1)].
      // The source is always a variable selector (RemapVar -> d0..d3), so the
      // only branch is text != text2 (out != src) vs text == text2 (out == src).
      //  - out != src (outVar 1, val1 selector 2 -> d1) -> move.w emitted
      //  - out != src again (outVar 2, val1 selector 3) -> move.w emitted
      //  - out == src (outVar 3, val1 selector 3 -> both d2) -> move.w skipped
      ins.slots = [
        { ...emptySlot(), fn: 14, outVar: 1, val1: 2 },
        { ...emptySlot(), fn: 14, outVar: 2, val1: 3 },
        { ...emptySlot(), fn: 14, outVar: 3, val1: 3 },
      ];
      break;
    case 'envd':
      // Env_Decay 770-818. dan-script: envd(smp, decayIdx, sustain, gain).
      //  inputs[1]=val1Value (decay index -> GetDecayValue table), literal (val1 sel=0)
      //  inputs[2]=val2Value (sustain, << 24 -> @SV), literal (val2 sel=0)
      //  inputs[3]=gain (@GN), literal or variable
      // Cover:
      //  - gain power-of-2 (64 -> asr/GS path); sustain>0 (num>127 -> move.l; cmp.l emitted)
      //  - gain non-power-of-2 (50 -> muls/TR1=#50 path); sustain>0
      //  - gain 128 (-> scaling skipped); sustain=0 (text=="#0": no cmp.l; num=0 -> moveq)
      //  - variable gain operand (no '#' -> move/and @GN,@TR1 d4 + muls path); sustain>0
      ins.slots = [
        { ...emptySlot(), fn: 8, outVar: 1, val1Value: 10, val2Value: 5, gainVal: 64 },
        { ...emptySlot(), fn: 8, outVar: 2, val1Value: 20, val2Value: 7, gainVal: 50 },
        { ...emptySlot(), fn: 8, outVar: 3, val1Value: 30, val2Value: 0, gainVal: 128 },
        { ...emptySlot(), fn: 8, outVar: 4, val1Value: 40, val2Value: 3, gain: 1 },
      ];
      break;
    case 'enva':
      // Env_Attack 820-863 (constant attack). dan-script: enva(smp, attackIdx, 0, gain).
      //  inputs[1]=val1Value (attack index -> GetDecayValue table), literal
      //  inputs[2]=ZERO (-> #0<<24 = #0 -> @SV, unused in emitted text)
      //  inputs[3]=gain (@GN), literal or variable
      // Each slot bumps currentWordInstance += 2 (the @IN offset). Cover:
      //  - gain power-of-2 (64 -> asr/GS path)
      //  - gain non-power-of-2 (50 -> muls/TR1=#50 path)
      //  - gain 128 (-> text == "#128": scaling skipped)
      //  - variable gain operand (no '#' -> move/and @GN,@TR1 d4 + muls path)
      ins.slots = [
        { ...emptySlot(), fn: 7, outVar: 1, val1Value: 10, gainVal: 64 },
        { ...emptySlot(), fn: 7, outVar: 2, val1Value: 20, gainVal: 50 },
        { ...emptySlot(), fn: 7, outVar: 3, val1Value: 30, gainVal: 128 },
        { ...emptySlot(), fn: 7, outVar: 4, val1Value: 40, gain: 1 },
      ];
      break;
    case 'sv_flt_n':
      // SVFilter 1259-1352. dan-script: sv_flt_n(instance, var1(signal), freq(CO),
      //   val2(RE/resonance), gain(RAW mode "0".."3")).
      //  - inputs[1]=val1 selector (signal var, must be non-zero) -> @VL = d0..d3
      //  - inputs[2]=cutoff: VL(freq,freqVal). In mulLeftShifts -> asl/@CS;
      //    const non-power-of-2 -> muls @CO; variable selector -> muls @CO (no '#')
      //  - inputs[3]=resonance: VL(val2,val2Value). In mulLeftShifts -> asl/@RS+ext.l;
      //    const '#' non-power-of-2 -> muls @RE; variable selector -> move/and/muls
      //  - inputs[4]=gain RAW -> mode switch 0/1/2/3 (LPF / HPF / BPF(d5) / HPF*2 clamp)
      // Each slot bumps currentWordInstance += 3. Cover all mode cases x value classes:
      ins.slots = [
        // cutoff power-of-2 (128 -> asl/@CS), reso power-of-2 (64 -> asl/@RS+ext.l), mode 0
        { ...emptySlot(), fn: 15, outVar: 1, val1: 2, freqVal: 128, val2Value: 64, gain: 0 },
        // cutoff non-power-of-2 const (50 -> muls @CO), reso non-power-of-2 const (50 -> muls @RE), mode 1
        { ...emptySlot(), fn: 15, outVar: 2, val1: 3, freqVal: 50, val2Value: 50, gain: 1 },
        // cutoff variable (freq sel -> d0, muls @CO), reso variable (val2 sel -> move/and/muls), mode 2
        { ...emptySlot(), fn: 15, outVar: 3, val1: 4, freq: 1, val2: 2, gain: 2 },
        // cutoff non-power-of-2 const (50 -> muls @CO), reso power-of-2 (64 -> asl/@RS), mode 3 (clamp branch)
        { ...emptySlot(), fn: 15, outVar: 4, val1: 1, freqVal: 50, val2Value: 64, gain: 3 },
      ];
      break;
    case 'onepole_flt':
      // OnePoleFilter 1353-1429. dan-script: onepole_flt(instance, var1(signal),
      //   freq(CO/cutoff), gain(RAW mode "0"|"1")).
      //  - inputs[1]=val1 selector (signal var) -> @VL = d0..d3 (or #0 if val1=0)
      //  - inputs[2]=cutoff: freq/freqVal. In mulLeftShifts -> asl/@CS+ext.l;
      //    const '#' non-power-of-2 -> muls @CO; variable selector -> move/and/muls
      //  - inputs[3]=gain RAW -> mode "0" (LPF: move d5) / "1" (HPF: VL-d5)
      // Each slot bumps currentWordInstance++. Cover cutoff value classes x modes:
      ins.slots = [
        // cutoff power-of-2 (128 -> asl/@CS+ext.l), signal var d1, mode 0
        { ...emptySlot(), fn: 21, outVar: 1, val1: 2, freqVal: 128, gain: 0 },
        // cutoff non-power-of-2 const (50 -> muls @CO), signal var d2, mode 1 (text2!=text -> move @VL emitted)
        { ...emptySlot(), fn: 21, outVar: 2, val1: 3, freqVal: 50, gain: 1 },
        // cutoff variable (freq sel -> d0, move/and/muls), signal var d3, mode 0
        { ...emptySlot(), fn: 21, outVar: 3, val1: 4, freq: 1, gain: 0 },
        // cutoff non-power-of-2 const (50 -> muls @CO), signal var == out (val1 sel 4 -> d3 == outVar4),
        //   mode 1 (text2==text -> move @VL skipped)
        { ...emptySlot(), fn: 21, outVar: 4, val1: 4, freqVal: 50, gain: 1 },
      ];
      break;
    case 'dly_cyc':
      // Delay 936-1018. dan-script: dly_cyc(instance, var1(signal), freq(DL/delay
      //   length), gain(GN/feedback)). val1 must be non-zero (errIfVal1Zero).
      //  - inputs[1]=val1 selector (signal var) -> @VL = d0..d3
      //  - inputs[2]=delay length: freq/freqVal. const '#' -> num2 path (cmp @DL<<1);
      //    variable selector (no '#') -> clamp #2047 path
      //  - inputs[3]=feedback gain: gain/gainVal. const '#' non-power-of-2 -> muls
      //    @GN; gain 128 -> scaling skipped; variable selector -> move/and/muls.
      //    NOTE: the power-of-2 (mulRightShifts) feedback path is intentionally
      //    NOT exercised — the oracle emits literal `asr.w @GS,@d4` (a typo in the
      //    original C#: `@d4` is never substituted), which vasm rejects. That
      //    branch can never be reproduced byte-for-byte because the oracle itself
      //    cannot assemble it; we faithfully port the same (broken) text anyway.
      // Each slot bumps currentLargeBufferInstance++ (num = N*4096): slot0 num=0
      // (move.l a1,a4), slots 1..7 num<32767 (lea @IN2(a1)), slot8+ num>=32767
      // (move.l a1,a4 + add.l #@IN2). 9 slots hit all three @IN2 branches.
      ins.slots = [
        // num=0 (move.l a1,a4); const DL=512; feedback non-power-of-2 (50 -> muls @GN)
        { ...emptySlot(), fn: 11, outVar: 1, val1: 2, freqVal: 512, gainVal: 50 },
        // num=4096 (<32767, lea); const DL=300; feedback non-power-of-2 (50 -> muls @GN)
        { ...emptySlot(), fn: 11, outVar: 2, val1: 3, freqVal: 300, gainVal: 50 },
        // num=8192 (lea); const DL=200; feedback 128 (scaling skipped)
        { ...emptySlot(), fn: 11, outVar: 3, val1: 4, freqVal: 200, gainVal: 128 },
        // num=12288 (lea); variable DL (freq sel -> clamp #2047 path); variable
        //   feedback (gain sel -> move/and/muls); signal var d3
        { ...emptySlot(), fn: 11, outVar: 4, val1: 4, freq: 1, gain: 2 },
        // fillers to push currentLargeBufferInstance over 32767/4096 ~= 8
        { ...emptySlot(), fn: 11, outVar: 1, val1: 2, freqVal: 100, gainVal: 50 },
        { ...emptySlot(), fn: 11, outVar: 2, val1: 3, freqVal: 100, gainVal: 50 },
        { ...emptySlot(), fn: 11, outVar: 3, val1: 4, freqVal: 100, gainVal: 50 },
        { ...emptySlot(), fn: 11, outVar: 1, val1: 2, freqVal: 100, gainVal: 50 },
        // num=32768 (>=32767, move.l a1,a4 + add.l #@IN2); const DL=400; feedback 50
        { ...emptySlot(), fn: 11, outVar: 2, val1: 3, freqVal: 400, gainVal: 50 },
      ];
      break;
    case 'cmb_flt_n':
      // CombFilter 1021-1138. dan-script: cmb_flt_n(instance, var1(signal),
      //   freq(DL/delay length), val2(FB/feedback), gain(GN/output gain)).
      //  - inputs[1]=val1 selector (signal var) -> @VL = d0..d3
      //  - inputs[2]=delay length: freq/freqVal. const '#' -> num2 path (cmp @DL<<1);
      //    variable selector (no '#') -> clamp #2047 path
      //  - inputs[3]=feedback: val2/val2Value. const power-of-2 (64 -> mulRightShifts
      //    -> asr.w @FS,d4); const non-power-of-2 (50 -> muls @FB); 128 -> skipped;
      //    variable selector -> move/and @FB,d6 + muls
      //  - inputs[4]=output gain: gain/gainVal. const power-of-2 (64 -> mulRightShifts
      //    -> asr.w @GS,@OR); const non-power-of-2 (50 -> muls @GN); 128 -> straight
      //    move.w d4,@OR; variable selector -> move/and @GN,d5 + muls
      // Each slot bumps currentLargeBufferInstance++ (num = N*4096): slot0 num=0
      // (move.l a1,a4), slots 1..7 num<32767 (lea @IN2(a1)), slot8+ num>=32767
      // (move.l a1,a4 + add.l #@IN2). 9 slots hit all three @IN2 branches.
      ins.slots = [
        // num=0 (move.l a1,a4); const DL=512; fb power-of-2 (64 -> asr.w @FS); gain power-of-2 (64 -> asr.w @GS)
        { ...emptySlot(), fn: 12, outVar: 1, val1: 2, freqVal: 512, val2Value: 64, gainVal: 64 },
        // num=4096 (<32767, lea); const DL=300; fb non-power-of-2 (50 -> muls @FB); gain non-power-of-2 (50 -> muls @GN)
        { ...emptySlot(), fn: 12, outVar: 2, val1: 3, freqVal: 300, val2Value: 50, gainVal: 50 },
        // num=8192 (lea); const DL=200; fb 128 (skipped); gain 128 (straight move d4,@OR)
        { ...emptySlot(), fn: 12, outVar: 3, val1: 4, freqVal: 200, val2Value: 128, gainVal: 128 },
        // num=12288 (lea); variable DL (freq sel -> clamp #2047 path); variable fb
        //   (val2 sel -> move/and @FB,d6 + muls); variable gain (gain sel -> move/and @GN,d5 + muls)
        { ...emptySlot(), fn: 12, outVar: 4, val1: 4, freq: 1, val2: 2, gain: 3 },
        // fillers to push currentLargeBufferInstance over 32767/4096 ~= 8
        { ...emptySlot(), fn: 12, outVar: 1, val1: 2, freqVal: 100, val2Value: 50, gainVal: 50 },
        { ...emptySlot(), fn: 12, outVar: 2, val1: 3, freqVal: 100, val2Value: 50, gainVal: 50 },
        { ...emptySlot(), fn: 12, outVar: 3, val1: 4, freqVal: 100, val2Value: 50, gainVal: 50 },
        { ...emptySlot(), fn: 12, outVar: 1, val1: 2, freqVal: 100, val2Value: 50, gainVal: 50 },
        // num=32768 (>=32767, move.l a1,a4 + add.l #@IN2); const DL=400; fb 64; gain 50
        { ...emptySlot(), fn: 12, outVar: 2, val1: 3, freqVal: 400, val2Value: 64, gainVal: 50 },
      ];
      break;
    case 'reverb':
      // Reverb 1140-1257. dan-script: reverb(var1(signal->VL), val2(feedback FB,
      //   uses mulRightShifts), gain(output gain GN, uses mulRightShifts)).
      //   val1 must be non-zero (errIfVal1Zero). Each slot is 8 comb iterations
      //   bumping currentLargeBufferInstance++ AND currentWordInstance++ per
      //   iteration (so +8 each per slot). @IN2 branch (num=N*4096) within a
      //   single slot: i=0 num=0 (move.l a1,a4), i=1..7 num=4096..28672 (<32767,
      //   lea). A SECOND slot starts at large-buffer 8 -> num=32768 (>=32767,
      //   move.l a1,a4 + add.l #@IN2) on its first iteration, covering the third
      //   @IN2 branch. Cover FB and GN value classes across slots:
      //  - FB power-of-2 (64 -> mulRightShifts -> asr.w @FS,d4);
      //    GN power-of-2 (64 -> move d4,d7 + asr.w @GS,d7)
      //  - FB non-power-of-2 const (50 -> muls @FB); GN non-power-of-2 const
      //    (50 -> move d4,d7 + muls @GN,d7)
      //  - FB 128 (scaling skipped); GN 128 (-> add.w d4,a6 branch)
      //  - FB variable (val2 sel -> move/and @FB,d6 + muls d6,d4);
      //    GN variable (gain sel -> move/and @GN,d5 + move d4,d7 + muls d5,d7)
      ins.slots = [
        { ...emptySlot(), fn: 13, outVar: 1, val1: 2, val2Value: 64, gainVal: 64 },
        { ...emptySlot(), fn: 13, outVar: 2, val1: 3, val2Value: 50, gainVal: 50 },
        { ...emptySlot(), fn: 13, outVar: 3, val1: 4, val2Value: 128, gainVal: 128 },
        { ...emptySlot(), fn: 13, outVar: 4, val1: 4, val2: 2, gain: 3 },
      ];
      break;
    case 'sampleHold':
    case 'sh':
      // Sample_And_Hold 732-768. dan-script: sh(instance, var1(signal->VL),
      //   gain(STR, the S&H trigger; varlit gain/gainVal)). val1 must be
      //   non-zero (errIfVal1Zero) -> @VL is a register d0..d3.
      //  - inputs[2]=gain: const '#' path -> @STI = #(n*n>>2) compile-time
      //    constant; the move.w @STI store branch. Cover const value classes:
      //      power-of-2 (64), non-power-of-2 (50), 128 (still '#', same path).
      //  - variable gain operand (gain sel -> d0..d3, no '#') -> the
      //    move.w/and.w/muls/asr.l d4 runtime-square path + move.w d4 store.
      // Each slot bumps currentWordInstance += 2 (the @IN1/@IN2 word pair).
      ins.slots = [
        { ...emptySlot(), fn: 19, outVar: 1, val1: 2, gainVal: 64 },
        { ...emptySlot(), fn: 19, outVar: 2, val1: 3, gainVal: 50 },
        { ...emptySlot(), fn: 19, outVar: 3, val1: 4, gainVal: 128 },
        { ...emptySlot(), fn: 19, outVar: 4, val1: 4, gain: 1 },
      ];
      break;
    case 'distortion':
      // Distortion 1431-1481. dan-script: distortion(var1(signal->VL),
      //   gain(GN, distortion amount; varlit gain/gainVal, uses mulLeftShifts)).
      //  - inputs[0]=val1 selector (signal var) -> @VL = d0..d3 (or #0 if val1=0)
      //  - inputs[1]=gain: varlit. const power-of-2 in mulLeftShifts (#2..#256)
      //    -> ext.l/asl.l @GS/asr.l #5 path; const non-power-of-2 -> muls @GN;
      //    variable selector (no '#') -> move/and #255/muls d4 path.
      // Distortion does NOT bump any instance counter. Cover value classes:
      ins.slots = [
        // gain power-of-2 (128 -> mulLeftShifts -> ext.l/asl.l @GS path), signal d1
        { ...emptySlot(), fn: 16, outVar: 1, val1: 2, gainVal: 128 },
        // gain non-power-of-2 const (50 -> muls @GN path), signal d2
        { ...emptySlot(), fn: 16, outVar: 2, val1: 3, gainVal: 50 },
        // gain power-of-2 (64 -> mulLeftShifts asl path), signal d3
        { ...emptySlot(), fn: 16, outVar: 3, val1: 4, gainVal: 64 },
        // variable gain operand (gain sel -> d0, no '#' -> move/and/muls d4 path), signal d3
        { ...emptySlot(), fn: 16, outVar: 4, val1: 4, gain: 1 },
      ];
      break;
    case 'adsr':
      // ADSR 1482-1507. dan-script: adsr(l, AA, DA, SLEV, SLEN, RA, PV) — all
      // args are compile-time constants computed by emitAdsr (no '#'/variable
      // branching exists in the op; every operand is a literal immediate).
      // The emitted text is fixed; only the substituted immediates + label vary.
      // Each slot bumps currentWordInstance += 5 (@IN1/@IN2/@IN3 word triple),
      // so multiple slots exercise the offset bookkeeping. Vary the param values
      // (sustain level, attack/decay/release rates, peak) across value classes:
      //  - power-of-2 gain (64) and non-power-of-2 gain (50)
      //  - widthVal producing negative num5/num7 (signed (short)(widthVal<<8))
      //  - a small sample so SLEN (num4) goes negative — exercises sign of @SLEN.
      ins.slots = [
        { ...emptySlot(), fn: 23, outVar: 1, val1Value: 10, val2Value: 5, freqVal: 8, gainVal: 64, widthVal: 30 },
        { ...emptySlot(), fn: 23, outVar: 2, val1Value: 20, val2Value: 7, freqVal: 12, gainVal: 50, widthVal: 200 },
        { ...emptySlot(), fn: 23, outVar: 3, val1Value: 3, val2Value: 1, freqVal: 2, gainVal: 128, widthVal: 100 },
        { ...emptySlot(), fn: 23, outVar: 4, val1Value: 40, val2Value: 30, freqVal: 50, gainVal: 64, widthVal: 0 },
      ];
      break;
    case 'chordgen':
    case 'chordGen':
      // ChordGen 1508-1578. dan-script: chordgen(smp, BaseAdr[base], note1,
      //   note2, note3, val2(@SH)).
      //  - inputs[1] = BaseAdr[<gain>]: non-numeric -> GetInstanceOffset returns
      //    "0" (@BS = 0) for a single-instrument patch (every slot).
      //  - inputs[2..4] = note indices (freq/width/val1, RAW) -> GetChordValue
      //    table (0..12). Cover: note==0 (chordValue=="#0" -> chord block
      //    skipped), all-distinct (all three blocks emitted), and duplicate
      //    notes (later block skipped via chordValue equality tests).
      //  - inputs[5] = val2 (@SH): const path -> #N; num>8 -> add.w @SH,a4;
      //    1<=num<=8 -> addq.w @SH,a4; num==0 -> no @SH add. Variable selector
      //    (val2 sel) -> the move.w/and.w/add.w d4,a4 runtime path.
      // Each slot bumps currentWordInstance += 6 (the @IN word offset advances).
      ins.slots = [
        // notes all distinct (1,2,3); @SH const non-power-of-2 (50 -> add.w)
        { ...emptySlot(), fn: 18, outVar: 1, gain: 0, freq: 1, width: 2, val1: 3, val2Value: 50 },
        // note1=0 (chordValue #0 -> first chord block skipped); notes 0,5,7;
        //   @SH const power-of-2 small (4 -> addq.w)
        { ...emptySlot(), fn: 18, outVar: 2, gain: 0, freq: 0, width: 5, val1: 7, val2Value: 4 },
        // duplicate notes (4,4,9): second block skipped (==chordValue), third
        //   emitted; @SH const 0 -> no @SH add at all
        { ...emptySlot(), fn: 18, outVar: 3, gain: 0, freq: 4, width: 4, val1: 9, val2Value: 0 },
        // variable @SH operand (val2 sel -> d0..d3): move.w/and.w/add.w path;
        //   notes 12,11,11 (third == second -> skipped)
        { ...emptySlot(), fn: 18, outVar: 4, gain: 0, freq: 12, width: 11, val1: 11, val2: 1 },
      ];
      break;
    case 'clone':
      // Clone 1581-1604 / CloneReverse 1605-1629. dan-script for op 17 is
      // emitted by the exporter (emit-inst-special.emitClone) as a bare C-style
      // expression, NOT a `clone(...)` statement:
      //   vN = ((((smp*(F+32768))>>15)+off) < SmpLength[g]
      //          ? *(BYTE*)(BaseAdr[g] + idx)<<8 : 0)        when gainVal == 0
      //   vN = (... ? *(BYTE*)(BaseAdr[g+1] - idx)<<8 : 0)   when gainVal != 0 (reverse)
      // Main's op dispatch keys on Contains("clone(") / Contains("clone_reverse(")
      // and finds NEITHER token in that expression, so the oracle emits no
      // instructions for the slot (only the leading `; <line>` comment). Our
      // dispatchOp likewise matches nothing and emits ''. The Clone/CloneReverse
      // methods are faithfully ported but UNREACHABLE through this pipeline; this
      // fixture proves byte-identity (both sides emit no clone code) across the
      // forward/reverse + offset value classes.
      //  - forward, const power-of-2 offset (val2Value 64), const freq
      //  - forward, const non-power-of-2 offset (val2Value 50), const freq
      //  - reverse (gainVal 1), offset 8 (boundary, addq path in the dead method)
      //  - forward, variable freq operand (freq selector) + offset 0
      ins.slots = [
        { ...emptySlot(), fn: 17, outVar: 1, freqVal: 1000, val2Value: 64, gain: 0, gainVal: 0 },
        { ...emptySlot(), fn: 17, outVar: 2, freqVal: 1234, val2Value: 50, gain: 1, gainVal: 0 },
        { ...emptySlot(), fn: 17, outVar: 3, freqVal: 777, val2Value: 8, gain: 0, gainVal: 1 },
        { ...emptySlot(), fn: 17, outVar: 4, freq: 1, val2Value: 0, gain: 2, gainVal: 0 },
      ];
      break;
    default:
      throw new Error(`unknown fixture '${key}'`);
  }
  return p;
}

function firstDiff(a: Uint8Array, b: Uint8Array): number {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return i;
  }
  return -1;
}

function asmDiff(oracle: string, mine: string): string {
  const ol = oracle.split('\n');
  const ml = mine.split('\n');
  const n = Math.max(ol.length, ml.length);
  const out: string[] = [];
  let shown = 0;
  for (let i = 0; i < n && shown < 30; i++) {
    if (ol[i] !== ml[i]) {
      out.push(`  L${i + 1} oracle: ${JSON.stringify(ol[i] ?? '<eof>')}`);
      out.push(`  L${i + 1} mine:   ${JSON.stringify(ml[i] ?? '<eof>')}`);
      shown++;
    }
  }
  return out.length ? out.join('\n') : '  (asm text identical)';
}

async function main() {
  const key = process.argv[2];
  if (!key) {
    console.error('usage: check.ts <empty|osc_saw>');
    process.exit(1);
  }
  const patch = fixture(key);

  const oracle = await asmBinFromPatch(patch);
  if (!oracle.ok) {
    console.log(`FAIL (${key}): oracle error: ${oracle.error}`);
    process.exit(1);
  }

  const myAsm = emitAkGenerate(patch);
  const mine = await assembleM68k(myAsm, { format: 'bin' });
  if (!mine.ok) {
    console.log(`FAIL (${key}): my asm failed to assemble: ${mine.error}`);
    console.log(asmDiff(oracle.asm!, myAsm));
    process.exit(1);
  }

  const ob = oracle.bytes!;
  const mb = mine.bytes!;
  const diff = firstDiff(ob, mb);
  if (diff === -1 && ob.length === mb.length) {
    console.log(`PASS (${key}): ${ob.length} bytes byte-identical`);
    return;
  }
  console.log(
    `FAIL (${key}): oracle=${ob.length}B mine=${mb.length}B first diff at byte ${diff}`,
  );
  console.log('asm diff:');
  console.log(asmDiff(oracle.asm!, myAsm));
  process.exit(1);
}

main();
