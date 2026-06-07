// Ridge least-squares: solve (XᵀX + λI) β = Xᵀy for β, via Gaussian elimination
// with partial pivoting. Small dense system (a few dozen features); no deps.

/** Solve a square linear system A·x = b (A is n×n row-major). Returns x. */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  // augmented copy
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let col = 0; col < n; col++) {
    // partial pivot
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r]![col]!) > Math.abs(M[piv]![col]!)) piv = r;
    if (Math.abs(M[piv]![col]!) < 1e-12) continue; // singular column; ridge should prevent this
    [M[col], M[piv]] = [M[piv]!, M[col]!];
    const pivVal = M[col]![col]!;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r]![col]! / pivVal;
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r]![c]! -= f * M[col]![c]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const d = M[i]![i]!;
    x[i] = Math.abs(d) < 1e-12 ? 0 : M[i]![n]! / d;
  }
  return x;
}

/**
 * Ridge regression. `X` is rows × features, `y` is rows. `lambda` regularizes
 * (added to the diagonal of XᵀX) to keep collinear features stable. Returns the
 * fitted coefficient vector (length = features).
 */
export function ridgeFit(X: number[][], y: number[], lambda = 1e-3): number[] {
  const rows = X.length;
  const f = X[0]?.length ?? 0;
  // XᵀX (+ λI) and Xᵀy
  const xtx: number[][] = Array.from({ length: f }, () => new Array<number>(f).fill(0));
  const xty = new Array<number>(f).fill(0);
  for (let r = 0; r < rows; r++) {
    const row = X[r]!;
    for (let i = 0; i < f; i++) {
      xty[i]! += row[i]! * y[r]!;
      for (let j = 0; j < f; j++) xtx[i]![j]! += row[i]! * row[j]!;
    }
  }
  for (let i = 0; i < f; i++) xtx[i]![i]! += lambda;
  return solveLinear(xtx, xty);
}

/** Mean and max absolute residual of `y` vs `predict(i)`. */
export function residuals(y: number[], predict: (i: number) => number): { mean: number; max: number } {
  let sum = 0;
  let max = 0;
  for (let i = 0; i < y.length; i++) {
    const e = Math.abs(y[i]! - predict(i));
    sum += e;
    if (e > max) max = e;
  }
  return { mean: y.length ? sum / y.length : 0, max };
}
