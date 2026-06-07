import { emptyInstrument, emptySlot, type Instrument, type Slot } from '../../src/patch/types';
import { opByCode } from '../../src/schema/op-metadata';
import { producerSlot } from './producer';
import { varOrConstParams, varSourceParams } from './modes';

export const CALIB_SAMPLE_LENGTH = 4096;

export interface OpInstrument { instrument: Instrument; producerCount: number; }

function midConst(opCode: number, valueField: keyof Slot): number {
  const def = opByCode(opCode);
  const p = def?.params.find((pp) => pp.field === valueField);
  if (p && p.type.kind === 'var-or-const') return Math.floor((p.type.min + p.type.max) / 2);
  return 1;
}

export function opInstrument(opCode: number, mode: boolean[], name = `op${opCode}`): OpInstrument {
  const voc = varOrConstParams(opCode);
  const vs = varSourceParams(opCode);
  const slots: Slot[] = [];
  let nextVar = 2; // v1 reserved for the op output
  const alloc = (): number => { const v = Math.min(nextVar, 4); nextVar += 1; return v; };

  const op: Slot = { ...emptySlot(), fn: opCode, outVar: 1 };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const set = (field: keyof Slot, value: number): void => { (op as any)[field] = value; };

  for (const field of vs) {
    const pv = alloc();
    slots.push(producerSlot(pv));
    set(field, pv);
  }
  voc.forEach((vp, i) => {
    set(vp.value, midConst(opCode, vp.value));
    if (mode[i]) { const pv = alloc(); slots.push(producerSlot(pv)); set(vp.selector, pv); }
    else set(vp.selector, 0);
  });

  slots.push(op);
  const instrument = emptyInstrument(name);
  instrument.sampleLength = CALIB_SAMPLE_LENGTH;
  instrument.slots = slots;
  return { instrument, producerCount: slots.length - 1 };
}
