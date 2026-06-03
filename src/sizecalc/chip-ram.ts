// src/sizecalc/chip-ram.ts
//
// Exact resident (play-time) chip-RAM usage of a patch, mirroring the
// AllocMem calls in exe_creator/main-executable.c:479-481. All MEMF_CHIP.
// The transient 24*2048*2 precalc work buffer is intentionally excluded
// (see spec): it is freed before playback and assumed to fit.
import type { Patch } from '../patch/types';

export interface ChipUsage {
  /** Σ generated-sample bytes (allocation stride = sampleLength per instrument). */
  sampleBytes: number;
  /** Σ imported-sample bytes baked into chip. */
  importBytes: number;
  /** Empty ProTracker module template bytes. */
  modBytes: number;
  /** Total resident chip-RAM. */
  residentTotal: number;
}

export function chipUsage(patch: Patch, modLengthEmpty: number): ChipUsage {
  let sampleBytes = 0;
  for (const ins of patch.instruments) {
    sampleBytes += Math.max(0, ins.sampleLength | 0);
  }
  let importBytes = 0;
  for (const s of patch.importedSamples) {
    importBytes += s.data.length;
  }
  const modBytes = modLengthEmpty | 0;
  return { sampleBytes, importBytes, modBytes, residentTotal: sampleBytes + importBytes + modBytes };
}
