// Fully in-browser: funklang patch → exact Amiga .bin (and asm), via the
// byte-exact Aklang2Asm port (emitAkGenerate) + vasm-WASM. No toolchain, no
// server. The byte count is the EXACT ship size (deterministic asm build).
import type { Patch } from '../patch/types';
import { emitAkGenerate } from './akgen';
import { assembleM68k, type AssembleOptions } from './vasm';

export interface BinResult {
  ok: boolean;
  /** The generated m68k assembly (always present). */
  asm: string;
  /** Assembled bytes (present iff ok). */
  bytes?: Uint8Array;
  /** bytes.length — the exact .bin size. */
  size?: number;
  error?: string;
}

/** Patch → m68k asm (byte-exact port of Aklang2Asm) → assembled bytes (vasm-WASM). */
export async function assembleBin(patch: Patch, opts: AssembleOptions = {}): Promise<BinResult> {
  const asm = emitAkGenerate(patch);
  const r = await assembleM68k(asm, opts);
  if (!r.ok) return { ok: false, asm, error: r.error ?? 'assembly failed' };
  return { ok: true, asm, bytes: r.bytes!, size: r.bytes!.length };
}

/** Exact .bin code size in bytes, or null on failure. */
export async function exactBinSize(patch: Patch): Promise<number | null> {
  const r = await assembleBin(patch, { format: 'bin' });
  return r.ok ? r.size! : null;
}
