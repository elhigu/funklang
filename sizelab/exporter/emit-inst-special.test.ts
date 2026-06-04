import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { emitClone, emitImported, emitAdsr } from './emit-inst-special';

describe('imported (20)', () => {
  it('inline ImpLength ternary keyed on gain', () => {
    expect(emitImported({ ...emptySlot(), gain: 3 }))
      .toBe('smp < ImpLength[3] ? *(BYTE*)(BaseImpAdr[3]+smp)<<8 : 0');
  });
});

describe('clone (17)', () => {
  it('forward (gainVal 0), literal transpose', () => {
    const slot = { ...emptySlot(), freq: 0, freqVal: 100, val2Value: 5, gain: 2, gainVal: 0 };
    expect(emitClone(slot, 4)).toBe(
      '(((smp*(100+32768))>>15)+5)< SmpLength[2] ? ' +
      '*(BYTE*)(BaseAdr[2]+((smp*(100+32768))>>15)+5)<<8 : 0',
    );
  });
  it('reverse (gainVal != 0) uses BaseAdr[gain+1] and subtraction', () => {
    const slot = { ...emptySlot(), freq: 1, freqVal: 0, val2Value: 0, gain: 2, gainVal: 1 };
    expect(emitClone(slot, 4)).toBe(
      '(((smp*(v1+32768))>>15)+0)< SmpLength[2] ? ' +
      '*(BYTE*)(BaseAdr[3]-(((smp*(v1+32768))>>15)+0))<<8 : 0',
    );
  });
});

describe('adsr (23)', () => {
  it('precomputed rates as 7 comma args (sampleLength 1000)', () => {
    // val2Value=0→num=1, val1Value=0→num2=1, freqVal=0→num3=1, sampleLength=1000→num4=997
    // gainVal=100→b=100; widthVal=0→num5=0; num6=32767*100<<1=6553400; num7=0
    // num8=6553400/1=6553400; num9=(6553400-0)/1=6553400; num10=0/1=0
    const slot = { ...emptySlot(), val2Value: 0, val1Value: 0, freqVal: 0, gainVal: 100, widthVal: 0 };
    expect(emitAdsr(slot, 7, 1000)).toBe('7, 6553400, 6553400, 0, 997, 0, 6553400');
  });
});
