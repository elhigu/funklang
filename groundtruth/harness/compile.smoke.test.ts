// funklang/groundtruth/harness/compile.smoke.test.ts
import { describe, it, expect } from 'vitest';
import { VERIFICATION_PATCHES } from '../tools/verification-patches';
import { compilePatch, compilePatchBinary } from './compile';

// Real end-to-end compile. Gated on GROUNDTRUTH_COMPILE_SMOKE=1, which ONLY the
// `npm run compile:smoke` script sets (inside `nix-shell -p wineWowPackages.stable`,
// where a 64-bit-capable wine runs the x86-64 toolchain). A bare `vitest run`
// skips it — even though a 32-bit system `wine` may be on PATH, that one can't
// run the toolchain, so detecting "any wine" is not enough.
const SMOKE = process.env.GROUNDTRUTH_COMPILE_SMOKE === '1';

describe('compilePatch (real toolchain)', () => {
  it.runIf(SMOKE)('compiles P01 to the spike anchor sizes', async () => {
    const r = await compilePatch(VERIFICATION_PATCHES['P01']!);
    expect(r.ok, r.error).toBe(true);
    // Anchors include gcc8_a_support (__mulsi3 etc.) linked into both Makefiles.
    expect(r.uncompressed).toBe(13596);
    expect(r.shrinkled).toBe(4544);
  }, 600_000);

  it.runIf(SMOKE)('compiles P01 to a 344-byte relocatable binary blob', async () => {
    // bin path uses --gc-sections, so gcc8_a_support is dropped for this
    // multiply-free patch (vs 612 when the support object was force-linked).
    const r = await compilePatchBinary(VERIFICATION_PATCHES['P01']!);
    expect(r.ok, r.error).toBe(true);
    expect(r.bytes).toBe(344);
  }, 600_000);
});
