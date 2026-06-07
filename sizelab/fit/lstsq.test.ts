import { describe, it, expect } from 'vitest';
import { ridgeFit, residuals } from './lstsq';

describe('ridgeFit', () => {
  it('recovers a known linear model y = 2 + 3·a + 5·b', () => {
    const rows = [
      [1, 0, 0], [1, 1, 0], [1, 0, 1], [1, 1, 1], [1, 2, 1], [1, 1, 2], [1, 3, 2],
    ];
    const y = rows.map(([, a, b]) => 2 + 3 * a! + 5 * b!);
    const beta = ridgeFit(rows, y, 1e-6);
    expect(beta[0]!).toBeCloseTo(2, 1);
    expect(beta[1]!).toBeCloseTo(3, 1);
    expect(beta[2]!).toBeCloseTo(5, 1);
  });

  it('stays finite under perfectly collinear features (ridge)', () => {
    // two identical columns — singular without regularization
    const rows = [[1, 1, 1], [1, 2, 2], [1, 3, 3], [1, 4, 4]];
    const y = [3, 5, 7, 9]; // 1 + 2x
    const beta = ridgeFit(rows, y, 1e-3);
    expect(beta.every((v) => Number.isFinite(v))).toBe(true);
    // predictions should still track y
    const pred = (i: number) => rows[i]!.reduce((s, x, j) => s + x * beta[j]!, 0);
    const { max } = residuals(y, pred);
    expect(max).toBeLessThan(0.5);
  });
});

describe('residuals', () => {
  it('computes mean and max absolute error', () => {
    const r = residuals([10, 20, 30], (i) => [11, 20, 28][i]!);
    expect(r.max).toBe(2);
    expect(r.mean).toBeCloseTo((1 + 0 + 2) / 3, 6);
  });
});
