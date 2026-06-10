// Ambient declarations for build-time injected values and Vite's `?raw` imports.

/** package.json version, injected via Vite `define` (see vite.config.ts). */
declare const __APP_VERSION__: string;

/** `import text from './FILE.md?raw'` → the file's raw contents as a string. */
declare module '*.md?raw' {
  const content: string;
  export default content;
}
