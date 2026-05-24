import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { refrender } from './refrender';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../..');

describe('refrender helper', () => {
  it('runs against loctro5 instrument 0 and returns Int16 samples', () => {
    const out = refrender(
      resolve(REPO_ROOT, 'loctro5 3 chippisamplea.akp'),
      0,
    );
    expect(out.length).toBeGreaterThan(0);
    expect(out.BYTES_PER_ELEMENT).toBe(2);
  });
});
