/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: { outDir: 'dist', target: 'es2022' },
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
});
