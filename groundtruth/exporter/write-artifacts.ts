import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ExportedArtifacts, BinaryArtifacts } from './export-patch';

/** Either exe (`ExportedArtifacts`) or bin (`BinaryArtifacts`) — both are
 *  filename → text|bytes maps. */
export type Artifacts = ExportedArtifacts | BinaryArtifacts;

export function writeArtifacts(artifacts: Artifacts, dir: string): void {
  for (const [name, content] of Object.entries(artifacts)) {
    const target = join(dir, name);
    mkdirSync(dirname(target), { recursive: true });
    if (typeof content === 'string') writeFileSync(target, content, 'latin1');
    else writeFileSync(target, content);
  }
}
