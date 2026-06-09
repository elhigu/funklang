// Offline fitter → regenerates src/sizecalc/calibration-data.ts. TARGET = the
// relocatable .bin code size.
//
// MODEL (base-anchored, concave in slots, relative-% weighted):
//   codeBytes = floor + perDistinctOp·distinctOps
//                     + perSlotPow·nSlots^slotPower      (concave: slot code folds as the patch grows)
//                     + perVarOperand·nVarOperands
//
// Why this shape (learned the hard way against 32 real patches + designed combos):
//  - floor is the measured empty .bin; anchoring it keeps small patches honest.
//  - .bin size is dominated by slot count (corr 0.94) but SUB-LINEAR: per-slot
//    code drops from ~150 B (small) to ~65 B (large) as whole-program LTO folds
//    shared code — hence nSlots^slotPower (≈0.8), not linear.
//  - variable operands add real code; distinct op types add their routines.
//  - Fit is RELATIVE-weighted (w=1/binBytes) so a 300-byte patch matters as much
//    as a 19 kB one — small patches stay accurate.
//
// Per-op `opWeight` (isolated single-op cost) is kept ONLY as a relative "which op
// is heavy" weight for the breakdown; it is NOT summed into the headline (summing
// per-op costs over-predicts real patches badly — see git history).
//
// Honest accuracy = leave-one-out over the real patches. Run: npm run fit:calibration
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OP_DEFS } from '../../src/schema/op-metadata';
import { parseCsv, type MeasurementRow } from '../corpus/measurements-csv';

const SINE = 4;
const SLOT_POWER = 0.8;
const MOD_LENGTH_EMPTY = 2108;
const SEED_OPWEIGHT: Record<number, number> = { 17: 1200, 18: 560, 20: 300, 22: 200, 23: 200, 24: 128 };

// All features come from the CSV `measured` list (self-contained — no .akp at fit
// time). Each PhaseDesc is one op slot; mode holds that slot's variable operands
// as 'V's. `producerCount` carries the synthetic single-op rows' extra producers.
interface Feat { distinct: Set<number>; nSlots: number; nVar: number; }
function feats(r: MeasurementRow): Feat {
  const distinct = new Set<number>(r.measured.map((m) => m.op));
  if (r.producerCount > 0) distinct.add(SINE);
  const nSlots = r.producerCount + r.measured.length;
  const nVar = r.measured.reduce((a, m) => a + (m.mode.match(/V/g)?.length ?? 0), 0);
  return { distinct, nSlots, nVar };
}
const featVec = (r: MeasurementRow): number[] => [feats(r).distinct.size, Math.pow(feats(r).nSlots, SLOT_POWER), feats(r).nVar];

// Weighted ridge: minimize Σ w_i (Xβ - y)².
function wridge(X: number[][], y: number[], w: number[], lambda: number): number[] {
  const f = X[0]!.length; const A = Array.from({ length: f }, () => new Array<number>(f).fill(0)); const b = new Array<number>(f).fill(0);
  for (let r = 0; r < X.length; r++) { const ro = X[r]!, wr = w[r]!, yr = y[r]!; for (let i = 0; i < f; i++) { b[i]! += wr * ro[i]! * yr; for (let j = 0; j < f; j++) A[i]![j]! += wr * ro[i]! * ro[j]!; } }
  for (let i = 0; i < f; i++) A[i]![i]! += lambda;
  const M = A.map((rw, i) => [...rw, b[i]!]); const n = f;
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[p]![c]!)) p = r; if (Math.abs(M[p]![c]!) < 1e-12) continue;[M[c], M[p]] = [M[p]!, M[c]!]; const pv = M[c]![c]!; for (let r = 0; r < n; r++) { if (r === c) continue; const fc = M[r]![c]! / pv; if (!fc) continue; for (let k = c; k <= n; k++) M[r]![k]! -= fc * M[c]![k]!; } }
  return M.map((rw, i) => Math.abs(rw[i]!) < 1e-12 ? 0 : rw[n]! / rw[i]!);
}
const dot = (a: number[], b: number[]): number => a.reduce((s, x, i) => s + x * (b[i] ?? 0), 0);
const c0 = (v: number): number => Math.max(0, Math.round(v));

function main(): void {
  const rows = parseCsv(readFileSync(join(import.meta.dirname, '..', 'corpus', 'measurements.csv'), 'utf8')).filter((r) => r.binBytes > 0);
  const real = rows.filter((r) => r.id.startsWith('real:'));
  const designed = rows.filter((r) => !r.id.startsWith('real:'));
  const floor = Math.min(...rows.map((r) => r.binBytes));
  const W = (r: MeasurementRow): number => 1 / r.binBytes;

  // Fit on ALL data (designed + real) for the shipped coefficients.
  const beta = wridge(rows.map(featVec), rows.map((r) => r.binBytes - floor), rows.map(W), 0.5);
  const [perDistinctOp, perSlotPow, perVarOperand] = beta as [number, number, number];

  // Per-op relative weight = isolated single-op .bin cost over the floor.
  const opWeight = new Map<number, number>();
  for (const op of new Set(designed.flatMap((r) => [...feats(r).distinct]))) {
    const single = designed.find((r) => new RegExp(`^op${op}_(c+|-)$`).test(r.id));
    if (single) opWeight.set(op, Math.max(0, single.binBytes - floor));
  }

  // Honest accuracy: leave-one-out over the real patches (designed always in train).
  let sumPct = 0, maxErr = 0, sumErr = 0;
  for (let i = 0; i < real.length; i++) {
    const train = [...designed, ...real.filter((_, j) => j !== i)];
    const bi = wridge(train.map(featVec), train.map((r) => r.binBytes - floor), train.map(W), 0.5);
    const pred = floor + dot(featVec(real[i]!), bi);
    const err = Math.abs(pred - real[i]!.binBytes);
    sumPct += err / real[i]!.binBytes; sumErr += err; if (err > maxErr) maxErr = err;
  }
  const meanPct = Math.round(sumPct / real.length * 100);
  const meanErr = Math.round(sumErr / real.length);

  const opWeightEntries = OP_DEFS.map((d) => d.code).sort((a, b) => a - b)
    .map((code) => `    ${code}: ${opWeight.has(code) ? c0(opWeight.get(code)!) : (SEED_OPWEIGHT[code] ?? 200)},`).join('\n');

  const file = `// Calibration table for the size estimator (TARGET: .bin code size).
//
// REGENERATED by the offline fitter (npm run fit:calibration, sizelab/fit/).
// Base-anchored, concave-in-slots, relative-%-weighted fit on designed combos +
// real patches. codeBytes = floor + perDistinctOp·distinctOps
//   + perSlotPow·nSlots^slotPower + perVarOperand·nVarOperands.
// opWeight is a RELATIVE per-op weight for the breakdown only (NOT summed).
// Types: ./calibration-types.
import type { CalibrationData } from './calibration-types';

export type { CalibrationData, FitQuality } from './calibration-types';

export const CALIBRATION: CalibrationData = {
  floor: ${c0(floor)},
  perDistinctOp: ${c0(perDistinctOp)},
  perSlotPow: ${+perSlotPow.toFixed(3)},
  slotPower: ${SLOT_POWER},
  perVarOperand: ${c0(perVarOperand)},
  opWeight: {
${opWeightEntries}
  },
  modLengthEmpty: ${MOD_LENGTH_EMPTY},
  fitted: true,
  fit: {
    meanErr: ${meanErr},
    maxErr: ${Math.round(maxErr)},
    meanPct: ${meanPct},
  },
};
`;
  writeFileSync(join(import.meta.dirname, '..', '..', 'src', 'sizecalc', 'calibration-data.ts'), file);

  console.log(`anchored power-law fit (${rows.length} rows: ${designed.length} designed + ${real.length} real):`);
  console.log(`  floor=${c0(floor)} perDistinctOp=${c0(perDistinctOp)} perSlotPow=${perSlotPow.toFixed(2)} (slots^${SLOT_POWER}) perVarOperand=${c0(perVarOperand)}`);
  console.log(`  LEAVE-ONE-OUT over reals: mean ${meanPct}% (${meanErr} B), max ${Math.round(maxErr)} B`);
}

main();
