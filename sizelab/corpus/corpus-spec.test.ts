import { describe, it, expect } from 'vitest';
import { buildCorpus, REGULAR_OPS } from './corpus-spec';

describe('buildCorpus', () => {
  const corpus = buildCorpus();

  it('has unique ids and every item is a non-empty patch', () => {
    const ids = corpus.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of corpus) expect(c.patch.instruments.some((i) => i.slots.length > 0)).toBe(true);
  });

  it('includes a producer-only item and a scaffold covering every regular op', () => {
    expect(corpus.find((c) => c.id === 'producer')).toBeTruthy();
    const scaffold = corpus.find((c) => c.id === 'scaffold')!;
    const ops = new Set(scaffold.measured.map((m) => m.op));
    for (const op of REGULAR_OPS) expect(ops.has(op), `scaffold covers op ${op}`).toBe(true);
  });

  it('covers every regular op in at least one per-op-mode item', () => {
    const measuredOps = new Set(corpus.flatMap((c) => c.measured.map((m) => m.op)));
    for (const op of REGULAR_OPS) expect(measuredOps.has(op), `op ${op} measured`).toBe(true);
  });

  it('includes import-byte variety and sample-length variety', () => {
    expect(corpus.some((c) => c.importBytes > 0)).toBe(true);
    const lens = new Set(corpus.filter((c) => c.id.startsWith('samplelen')).map((c) => c.id));
    expect(lens.size).toBeGreaterThanOrEqual(2);
  });
});
