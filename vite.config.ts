/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

// NOTE: funklang/groundtruth/ is Node-only (offline tooling) and must never be imported by src/ — see groundtruth/isolation.test.ts

// Single source of truth for the version shown in-app (About modal): the
// package.json version, injected at build time so it always matches the release.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  root: '.',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { outDir: 'dist', target: 'es2022' },
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts', 'groundtruth/**/*.test.ts'],
    // Never descend into a scratch/wine build dir if one ever lands under the
    // tree — its `dosdevices/z: -> /` symlink would crash globbing on EACCES.
    exclude: ['**/node_modules/**', '**/.scratch/**', '**/groundtruth-scratch/**'],
  },
});
