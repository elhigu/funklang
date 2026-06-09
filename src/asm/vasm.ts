// In-browser m68k assembler: vasm (Motorola syntax) compiled to WebAssembly via
// Emscripten. Assembles m68k source to raw binary (-Fbin) or Amiga hunk (-Fhunk)
// entirely client-side — no toolchain, no server.
//
// vasm is © Volker Barthelmann; see ./vasm/README.md for provenance + rebuild.
//
// Note: each call spins up a fresh module instance. vasm exits the runtime after
// main(), and re-using one instance across assemblies would leak global state —
// a fresh instance per call is correct and cheap (the .wasm compile is cached by
// the engine after first load).
// @ts-expect-error — emscripten ES module has no type declarations
import initVasm from './vasm/vasm-m68k.mjs';

interface VasmFS {
  writeFile(path: string, data: Uint8Array | string): void;
  readFile(path: string): Uint8Array;
}
interface VasmModule { FS: VasmFS; callMain(args: string[]): void; }

export interface AssembleResult {
  ok: boolean;
  /** Assembled output bytes (present iff ok). */
  bytes?: Uint8Array;
  error?: string;
}

export interface AssembleOptions {
  /** Output format: raw binary (default) or Amiga hunk object. */
  format?: 'bin' | 'hunk';
  /** Target CPU flag (default 68000). */
  cpu?: '-m68000' | '-m68010' | '-m68020' | '-m68030' | '-m68040' | '-m68060';
}

/** Assemble m68k (Motorola syntax) source. Resolves to bytes or an error. */
export async function assembleM68k(source: string, opts: AssembleOptions = {}): Promise<AssembleResult> {
  const m: VasmModule = await initVasm();
  const fmt = opts.format === 'hunk' ? 'hunk' : 'bin';
  m.FS.writeFile('/in.s', source);
  let exitStatus = 0;
  try {
    m.callMain([`-F${fmt}`, opts.cpu ?? '-m68000', '-quiet', '-o', '/out', '/in.s']);
  } catch (e) {
    // Emscripten throws ExitStatus to unwind main(); status 0 is a clean exit.
    exitStatus = (e && typeof e === 'object' && 'status' in e) ? Number((e as { status: number }).status) : 1;
  }
  if (exitStatus !== 0) return { ok: false, error: `vasm exited with status ${exitStatus} (assembly error)` };
  try {
    return { ok: true, bytes: m.FS.readFile('/out') };
  } catch {
    return { ok: false, error: 'vasm produced no output' };
  }
}
