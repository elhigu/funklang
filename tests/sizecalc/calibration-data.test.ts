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

  it('is calibrated (fitted from the corpus) with a measured base + opCost for every op', () => {
    expect(CALIBRATION.fitted).toBe(true);
    // measured base is the real ~13.5k floor, not the old 3000 seed
    expect(CALIBRATION.base).toBeGreaterThan(8000);
    for (const def of OP_DEFS) expect(CALIBRATION.opCost[def.code]).toBeGreaterThanOrEqual(0);
  });

  it('records fit residuals', () => {
    expect(CALIBRATION.fit.meanErrShrinkled).toBeGreaterThanOrEqual(0);
    expect(CALIBRATION.fit.maxErrUncompressed).toBeGreaterThanOrEqual(0);
  });
});
