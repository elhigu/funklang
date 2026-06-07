import { emptySlot, type Slot } from '../../src/patch/types';

/** Standard calibrated input producer: osc_sine (fn 4), fixed const freq+gain. */
export const PRODUCER_FREQ = 1000;
export const PRODUCER_GAIN = 64;

export function producerSlot(outVar: number): Slot {
  return { ...emptySlot(), fn: 4, outVar, freq: 0, freqVal: PRODUCER_FREQ, gain: 0, gainVal: PRODUCER_GAIN };
}
