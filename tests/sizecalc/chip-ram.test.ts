import { describe, it, expect } from 'vitest';
import { emptyPatch } from '../../src/patch/types';
import { chipUsage } from '../../src/sizecalc/chip-ram';

describe('chipUsage', () => {
  it('an empty patch costs only the mod template', () => {
    const u = chipUsage(emptyPatch(), 1084);
    expect(u.sampleBytes).toBe(0);
    expect(u.importBytes).toBe(0);
    expect(u.modBytes).toBe(1084);
    expect(u.residentTotal).toBe(1084);
  });

  it('sums sampleLength over instruments and import byte lengths', () => {
    const p = emptyPatch();
    p.instruments[0]!.sampleLength = 12288;
    p.instruments[1]!.sampleLength = 2048;
    p.importedSamples[0]!.data = new Int8Array(500);
    p.importedSamples[3]!.data = new Int8Array(20);
    const u = chipUsage(p, 1084);
    expect(u.sampleBytes).toBe(12288 + 2048);
    expect(u.importBytes).toBe(520);
    expect(u.residentTotal).toBe(1084 + 14336 + 520);
  });

  it('clamps negative sampleLength to zero', () => {
    const p = emptyPatch();
    p.instruments[0]!.sampleLength = -5;
    expect(chipUsage(p, 0).sampleBytes).toBe(0);
  });
});
