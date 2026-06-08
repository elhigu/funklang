import { describe, it, expect } from 'vitest';
import { CALIBRATION } from '../../src/sizecalc/calibration-data';
import { OP_DEFS } from '../../src/schema/op-metadata';

describe('CALIBRATION seed table (aggregate .bin model)', () => {
  it('has the required top-level fields', () => {
    expect(typeof CALIBRATION.base).toBe('number');
    expect(typeof CALIBRATION.perDistinctOp).toBe('number');
    expect(typeof CALIBRATION.perSlot).toBe('number');
    expect(typeof CALIBRATION.floor).toBe('number');
    expect(typeof CALIBRATION.modLengthEmpty).toBe('number');
    expect(typeof CALIBRATION.fitted).toBe('boolean');
  });

  it('seeds an opCost (relative weight) entry for every known op code', () => {
    for (const def of OP_DEFS) {
      expect(CALIBRATION.opCost[def.code], `op ${def.code} (${def.name})`).toBeTypeOf('number');
    }
  });

  it('is calibrated from the corpus with sane aggregate coefficients', () => {
    expect(CALIBRATION.fitted).toBe(true);
    // Aggregate model: each distinct op type and each slot pulls positive code,
    // and there is a positive .bin floor (empty-patch size).
    expect(CALIBRATION.perDistinctOp).toBeGreaterThan(0);
    expect(CALIBRATION.perSlot).toBeGreaterThan(0);
    expect(CALIBRATION.floor).toBeGreaterThan(0);
    for (const def of OP_DEFS) expect(CALIBRATION.opCost[def.code]).toBeGreaterThanOrEqual(0);
  });

  it('records real-patch fit residuals', () => {
    expect(CALIBRATION.fit.meanErr).toBeGreaterThanOrEqual(0);
    expect(CALIBRATION.fit.maxErr).toBeGreaterThanOrEqual(CALIBRATION.fit.meanErr);
    expect(CALIBRATION.fit.meanPct).toBeGreaterThanOrEqual(0);
  });
});
