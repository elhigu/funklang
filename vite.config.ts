/// <reference types="vitest" />
import { defineConfig } from 'vite';

// NOTE: funklang/groundtruth/ is Node-only (offline tooling) and must never be imported by src/ — see groundtruth/isolation.test.ts

export default defineConfig({
  root: '.',
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
