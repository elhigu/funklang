// funklang/groundtruth/isolation.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('isolation: src/ must not import groundtruth/', () => {
  it('no file under src/ references groundtruth', () => {
    const srcDir = join(__dirname, '..', 'src');
    const offenders = walk(srcDir).filter((f) =>
      /from ['"].*groundtruth/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
