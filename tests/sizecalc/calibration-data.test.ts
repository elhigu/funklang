import { describe, it, expect } from 'vitest';
import { CALIBRATION } from '../../src/sizecalc/calibration-data';
import { OP_DEFS } from '../../src/schema/op-metadata';

describe('CALIBRATION seed table (additive per-op model)', () => {
  it('has the required top-level fields', () => {
    expect(typeof CALIBRATION.base).toBe('number');
    expect(typeof CALIBRATION.perSlot).toBe('number');
    expect(typeof CALIBRATION.perVarOperand).toBe('number');
    expect(typeof CALIBRATION.floor).toBe('number');
    expect(typeof CALIBRATION.modLengthEmpty).toBe('number');
    expect(typeof CALIBRATION.fitted).toBe('boolean');
  });

  it('has an opRoutine entry for every known op code', () => {
    for (const def of OP_DEFS) {
      expect(CALIBRATION.opRoutine[def.code], `op ${def.code} (${def.name})`).toBeTypeOf('number');
    }
  });

  it('is calibrated from the corpus with sane coefficients', () => {
    expect(CALIBRATION.fitted).toBe(true);
    expect(CALIBRATION.base).toBeGreaterThanOrEqual(0);
    expect(CALIBRATION.perSlot).toBeGreaterThanOrEqual(0);
    expect(CALIBRATION.perVarOperand).toBeGreaterThan(0); // variable operands cost code
    expect(CALIBRATION.floor).toBeGreaterThan(0);
    for (const def of OP_DEFS) expect(CALIBRATION.opRoutine[def.code]).toBeGreaterThanOrEqual(0);
  });

  it('records real-patch fit residuals', () => {
    expect(CALIBRATION.fit.meanErr).toBeGreaterThanOrEqual(0);
    expect(CALIBRATION.fit.maxErr).toBeGreaterThanOrEqual(CALIBRATION.fit.meanErr);
    expect(CALIBRATION.fit.meanPct).toBeGreaterThanOrEqual(0);
  });
});
