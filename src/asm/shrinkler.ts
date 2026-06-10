// In-browser Shrinkler (Blueberry's Amiga cruncher) compiled to WebAssembly via
// Emscripten. Crunches a raw blob in DATA mode (`-d`) with the byte-oriented
// context model (`-b`) and reports the compressed size — i.e. roughly what the
// `.bin` actually costs once packed into a demo (which carries one shared
// ShrinklerDecompress routine).
//
// Shrinkler is © Aske Simon Christensen (Blueberry); see ./shrinkler/README.md
// for provenance + rebuild. A fresh module instance per call (it exits the
// runtime after main()); the .wasm compile is cached by the engine after first
// load.
// @ts-expect-error — emscripten ES module has no type declarations
import initShrinkler from './shrinkler/shrinkler.mjs';

interface ShrFS {
  writeFile(path: string, data: Uint8Array): void;
  readFile(path: string): Uint8Array;
}
interface ShrModule { FS: ShrFS; callMain(args: string[]): void; }

export interface ShrinkResult {
  ok: boolean;
  /** Compressed bytes (present iff ok). */
  bytes?: Uint8Array;
  /** bytes.length — the packed size. */
  size?: number;
  error?: string;
}

/** Compress `data` with Shrinkler (data mode, byte context). Resolves to the
 *  compressed bytes/size, or an error. */
export async function shrinkle(data: Uint8Array): Promise<ShrinkResult> {
  const m: ShrModule = await initShrinkler();
  m.FS.writeFile('/in', data);
  let exitStatus = 0;
  try {
    m.callMain(['-d', '-b', '/in', '/out']);
  } catch (e) {
    // Emscripten throws ExitStatus to unwind main(); status 0 is a clean exit.
    exitStatus = (e && typeof e === 'object' && 'status' in e) ? Number((e as { status: number }).status) : 1;
  }
  if (exitStatus !== 0) return { ok: false, error: `shrinkler exited with status ${exitStatus}` };
  try {
    const bytes = m.FS.readFile('/out');
    return { ok: true, bytes, size: bytes.length };
  } catch {
    return { ok: false, error: 'shrinkler produced no output' };
  }
}
