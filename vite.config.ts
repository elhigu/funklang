/// <reference types="vitest" />
import { defineConfig } from 'vite';

// NOTE: funklang/sizelab/ is Node-only (offline tooling) and must never be imported by src/ — see sizelab/isolation.test.ts

export default defineConfig({
  root: '.',
  build: { outDir: 'dist', target: 'es2022' },
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts', 'sizelab/**/*.test.ts'],
  },
});
