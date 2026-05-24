// op 23 — adsr: full envelope with pre-computed attack/decay/sustain/release.
//
// Form1 pre-computes the 6 int args from slot fields:
//   attackTicks  = (val2Value<<8) + 1
//   decayTicks   = (val1Value<<8) + 1
//   releaseTicks = (freqVal  <<8) + 1
//   peakByte     = gainVal
//   sustain16    = widthVal << 8
//   sustainTicks = sampleLength - attackTicks - decayTicks - releaseTicks
//
// Chain: adsr → v1 (alone). Sample length must be long enough that
// (val2+val1+freq) * 256 ≤ sampleLength so sustainTicks > 0.

import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { makePatch, runBoth, fp } from './_dsp_helpers';

describe('op adsr (code 23)', () => {
  it.each([
    // sampleLength is large enough that all four phases fit.
    // attackTicks  = val2Value * 256 + 1
    // decayTicks   = val1Value * 256 + 1
    // releaseTicks = freqVal   * 256 + 1
    // sustainTicks = sampleLength - sum
    {
      name: 'short ADSR peak=200 sustain=100',
      val2Value: 1,    // attack  ≈ 257 ticks
      val1Value: 1,    // decay   ≈ 257 ticks
      freqVal:   1,    // release ≈ 257 ticks
      widthVal: 100,   // sustain level (short = 100<<8 = 25600)
      gainVal:  200,   // peak byte
      sampleLength: 2048,
    },
    {
      name: 'slow attack',
      val2Value: 4,    // attack ≈ 1025 ticks
      val1Value: 2,    // decay
      freqVal:   2,    // release
      widthVal: 64,
      gainVal:  255,
      sampleLength: 4096,
    },
    {
      name: 'high sustain',
      val2Value: 1,
      val1Value: 1,
      freqVal:   1,
      widthVal: 127,   // sustain16 = 32512
      gainVal:  255,   // peak     = 32767*255*2 = 16711170
      sampleLength: 3000,
    },
    {
      name: 'zero sustain',
      val2Value: 1,
      val1Value: 2,
      freqVal:   1,
      widthVal: 0,
      gainVal:  200,
      sampleLength: 2500,
    },
    {
      name: 'longer sample',
      val2Value: 2,
      val1Value: 3,
      freqVal:   2,
      widthVal: 50,
      gainVal:  180,
      sampleLength: 8000,
    },
  ])('matches refrender for $name', (cfg) => {
    const env = {
      ...emptySlot(),
      outVar: 1, fn: 23,
      val2Value: cfg.val2Value,
      val1Value: cfg.val1Value,
      freqVal:   cfg.freqVal,
      widthVal:  cfg.widthVal,
      gainVal:   cfg.gainVal,
    };
    const p = makePatch(cfg.sampleLength, [env]);
    const { c, js } = runBoth(p);
    expect(fp(js)).toEqual(fp(c));
  });
});
