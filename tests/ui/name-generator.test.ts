import { describe, it, expect } from 'vitest';
import { generateInstrumentName, makeSeededRandom } from '../../src/ui/name-generator';

describe('generateInstrumentName', () => {
  it('returns a non-empty string from the curated table', () => {
    const name = generateInstrumentName(makeSeededRandom(42));
    expect(name.length).toBeGreaterThan(0);
  });

  it('is deterministic when given a seeded RNG', () => {
    const a = generateInstrumentName(makeSeededRandom(1234));
    const b = generateInstrumentName(makeSeededRandom(1234));
    expect(a).toBe(b);
  });

  it('produces different output across different seeds', () => {
    const seen = new Set<string>();
    for (let s = 1; s < 50; s++) seen.add(generateInstrumentName(makeSeededRandom(s)));
    // Demands SOME variety — exactly how much depends on the table, but
    // 50 different seeds should not all collapse into one string.
    expect(seen.size).toBeGreaterThan(5);
  });
});
