// funklang/src/codegen/op-args.ts
import type { ArgSpec } from './arg-emit';

export interface OpArgs {
  specs: ArgSpec[];
  /** Form1 aborts with an error if val1 selector is 0 (cases 11/13/15/19). */
  errIfVal1Zero?: boolean;
}

const I: ArgSpec = { kind: 'instance' };
const SMP: ArgSpec = { kind: 'smp' };
const ZERO: ArgSpec = { kind: 'zero' };
const VAR1: ArgSpec = { kind: 'var', field: 'val1' };
const VL = (sel: 'freq' | 'gain' | 'width' | 'val1' | 'val2',
            lit: 'freqVal' | 'gainVal' | 'widthVal' | 'val1Value' | 'val2Value'): ArgSpec =>
  ({ kind: 'varlit', sel, lit });
const RAW = (field: 'gain' | 'freq' | 'width' | 'val1'): ArgSpec => ({ kind: 'raw', field });

export const OP_ARGS: Record<number, OpArgs | undefined> = {
  1:  { specs: [VAR1, VL('gain', 'gainVal')] },
  2:  { specs: [I, VL('freq', 'freqVal'), VL('gain', 'gainVal')] },
  3:  { specs: [I, VL('freq', 'freqVal'), VL('gain', 'gainVal')] },
  4:  { specs: [I, VL('freq', 'freqVal'), VL('gain', 'gainVal')] },
  5:  { specs: [I, VL('freq', 'freqVal'), VL('gain', 'gainVal'), VL('width', 'widthVal')] },
  6:  { specs: [SMP, VL('gain', 'gainVal')] },
  7:  { specs: [SMP, VL('val1', 'val1Value'), ZERO, VL('gain', 'gainVal')] },
  8:  { specs: [SMP, VL('val1', 'val1Value'), VL('val2', 'val2Value'), VL('gain', 'gainVal')] },
  9:  { specs: [VAR1, VL('val2', 'val2Value')] },
  10: { specs: [VAR1, VL('val2', 'val2Value')] },
  11: { specs: [I, VAR1, VL('freq', 'freqVal'), VL('gain', 'gainVal')], errIfVal1Zero: true },
  12: { specs: [I, VAR1, VL('freq', 'freqVal'), VL('val2', 'val2Value'), VL('gain', 'gainVal')] },
  13: { specs: [VAR1, VL('val2', 'val2Value'), VL('gain', 'gainVal')], errIfVal1Zero: true },
  14: { specs: [VAR1] },
  15: { specs: [I, VAR1, VL('freq', 'freqVal'), VL('val2', 'val2Value'), RAW('gain')], errIfVal1Zero: true },
  16: { specs: [VAR1, VL('gain', 'gainVal')] },
  18: { specs: [SMP, { kind: 'baseadr', field: 'gain' }, RAW('freq'), RAW('width'), RAW('val1'), VL('val2', 'val2Value')] },
  19: { specs: [I, VAR1, VL('gain', 'gainVal')], errIfVal1Zero: true },
  21: { specs: [I, VAR1, VL('freq', 'freqVal'), RAW('gain')] },
};
