// op 7 — enva: attack envelope (multiplicative ramp via decayTable).
//
// Chain: osc_saw → v2 (source signal) ; enva(v2 unused; uses smp+attack) → v1.
// Note: enva takes `smp` directly as `sample`, not v2; we still drive a saw
// to make sure no cross-state leaks. The op itself ignores v2.

import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { makePatch, runBoth, fp } from './_dsp_helpers';

describe('op enva (code 7)', () => {
  it.each([
    { name: 'attack=0  gain=127', attack: 0,   envGain: 127 },
    { name: 'attack=5  gain=100', attack: 5,   envGain: 100 },
    { name: 'attack=20 gain=200', attack: 20,  envGain: 200 },
    { name: 'attack=60 gain=64',  attack: 60,  envGain: 64  },
    { name: 'attack=120 gain=255',attack: 120, envGain: 255 },
  ])('matches refrender for $name', ({ attack, envGain }) => {
    // enva uses smp as `sample`; val1Value carries attack BYTE.
    const env = { ...emptySlot(), outVar: 1, fn: 7, val1Value: attack, gainVal: envGain };
    const p = makePatch(2048, [env]);
    const { c, js } = runBoth(p);
    expect(fp(js)).toEqual(fp(c));
  });
});
