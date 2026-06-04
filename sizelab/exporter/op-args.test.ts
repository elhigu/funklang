// funklang/sizelab/exporter/op-args.test.ts
import { describe, it, expect } from 'vitest';
import { OP_ARGS } from './op-args';

describe('OP_ARGS table', () => {
  it('osc_saw (2) is instance + 2 varlits', () => {
    expect(OP_ARGS[2]!.specs).toEqual([
      { kind: 'instance' },
      { kind: 'varlit', sel: 'freq', lit: 'freqVal' },
      { kind: 'varlit', sel: 'gain', lit: 'gainVal' },
    ]);
  });
  it('sv_flt_n (15) ends in a RAW gain and flags val1-zero error', () => {
    const e = OP_ARGS[15]!;
    expect(e.specs.at(-1)).toEqual({ kind: 'raw', field: 'gain' });
    expect(e.errIfVal1Zero).toBe(true);
  });
  it('omits bespoke ops 17, 20, 23 and skipped/absent 22, 24', () => {
    for (const fn of [17, 20, 22, 23, 24]) expect(OP_ARGS[fn]).toBeUndefined();
  });
  it('covers every regular op 1-21 except 17/20', () => {
    for (const fn of [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,18,19,21]) {
      expect(OP_ARGS[fn], `fn ${fn}`).toBeDefined();
    }
  });
});
