// tools/calibrate-exe-size.ts
//
// OFFLINE calibration for src/sizecalc/calibration-data.ts. Runs the existing
// aklang exe pipeline (exe_creator/, via wine) over synthetic single-op
// patches + the real patches/*.akp corpus, fits the linear size model, and
// rewrites calibration-data.ts with measured constants + residual error.
//
// Requires: wine, the exe_creator toolchain (gcc/elf2hunk/Shrinkler). Run from
// the funklang/ directory:  npm run calibrate-exe-size
//
// NOT shipped to the browser. Pure offline measurement.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { OP_DEFS } from '../src/schema/op-metadata';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const EXE_CREATOR = resolve(REPO_ROOT, 'exe_creator');

interface Sample { opBag: Record<number, number>; nOpSlots: number; impBytes: number; uncompressed: number; shrinkled: number; }

function ensureToolchain(): void {
  if (!existsSync(EXE_CREATOR)) {
    throw new Error(`exe_creator not found at ${EXE_CREATOR}`);
  }
  // TODO(impl): probe `wine --version`; if missing, print install guidance and exit 1.
}

// Build the feed for the pipeline from a Patch. Reuses the SAME header/script
// emission the "export amiga exe" effort produces (Iset.h/Ilen.h/Inst.h/
// Isamp.raw or aklang2asm script.txt). Until that exporter lands, this throws
// with a pointer to the spec so the dependency is explicit.
function emitPipelineInput(/* patch */): never {
  throw new Error(
    'calibration needs the patch→pipeline exporter (script.txt or Iset.h/Ilen.h/Inst.h/Isamp.raw).\n' +
    'See funklang/docs/superpowers/specs/2026-06-03-size-memory-estimator-design.md ' +
    '§"Calibration tool" — implement the exporter, then wire it here.',
  );
}

// Compile one prepared input through wine and return {uncompressed, shrinkled}.
function compileAndMeasure(/* inputDir */): { uncompressed: number; shrinkled: number } {
  // TODO(impl): run gnumake -f Makefile-executable (a.mingw.exe = uncompressed),
  // then Shrinkler → exemusic.exe (shrinkled). Record both file sizes via statSync.
  throw new Error('not implemented: wire to exe_creator Makefile + Shrinkler');
}

// Least-squares fit of base/slotStreamCost/opCost + shrink ratios from samples.
function fit(samples: Sample[]): void {
  // TODO(impl): isolate per-op code cost from single-op deltas, then solve the
  // overdetermined system for base/slotStreamCost; fit shrink.codeRatio/impRatio
  // and shrink.base. Compute mean/max residuals. Rewrite calibration-data.ts
  // with fitted:true and the fit{} block.
  void samples;
  throw new Error('not implemented: fit + rewrite calibration-data.ts');
}

function main(): void {
  ensureToolchain();
  const samples: Sample[] = [];
  // 1) synthetic: baseline + one patch per op type (emitPipelineInput → compileAndMeasure)
  for (const def of OP_DEFS) { void def; /* TODO build single-op patch */ }
  // 2) real corpus: patches/*.akp
  // 3) fit + write
  fit(samples);
  console.log('calibration complete');
}

main();
