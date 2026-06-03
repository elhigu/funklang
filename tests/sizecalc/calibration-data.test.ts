import { describe, it, expect } from 'vitest';
import { CALIBRATION } from '../../src/sizecalc/calibration-data';
import { OP_DEFS } from '../../src/schema/op-metadata';

describe('CALIBRATION seed table', () => {
  it('has the required top-level fields', () => {
    expect(typeof CALIBRATION.base).toBe('number');
    expect(typeof CALIBRATION.slotStreamCost).toBe('number');
    expect(typeof CALIBRATION.modLengthEmpty).toBe('number');
    expect(CALIBRATION.shrink).toBeTypeOf('object');
    expect(typeof CALIBRATION.shrink.base).toBe('number');
    expect(typeof CALIBRATION.shrink.codeRatio).toBe('number');
    expect(typeof CALIBRATION.shrink.impRatio).toBe('number');
    expect(typeof CALIBRATION.fitted).toBe('boolean');
  });

  it('seeds an opCost entry for every known op code', () => {
    for (const def of OP_DEFS) {
      expect(CALIBRATION.opCost[def.code], `op ${def.code} (${def.name})`).toBeTypeOf('number');
    }
  });

  it('ships unfitted until the calibration tool runs', () => {
    expect(CALIBRATION.fitted).toBe(false);
  });
});
