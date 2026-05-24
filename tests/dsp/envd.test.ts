// op 8 — envd: decay envelope (32767 - ramp), floored at sustain<<8.

import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { makePatch, runBoth, fp } from './_dsp_helpers';

describe('op envd (code 8)', () => {
  it.each([
    { name: 'decay=0  sustain=0  gain=127', decay: 0,   sustain: 0,   envGain: 127 },
    { name: 'decay=10 sustain=32 gain=200', decay: 10,  sustain: 32,  envGain: 200 },
    { name: 'decay=30 sustain=64 gain=100', decay: 30,  sustain: 64,  envGain: 100 },
    { name: 'decay=80 sustain=0  gain=255', decay: 80,  sustain: 0,   envGain: 255 },
    { name: 'decay=120 sustain=100 gain=64',decay: 120, sustain: 100, envGain: 64  },
  ])('matches refrender for $name', ({ decay, sustain, envGain }) => {
    const env = { ...emptySlot(), outVar: 1, fn: 8,
                  val1Value: decay, val2Value: sustain, gainVal: envGain };
    const p = makePatch(2048, [env]);
    const { c, js } = runBoth(p);
    expect(fp(js)).toEqual(fp(c));
  });
});
