// Autosave to localStorage so a refresh / crash doesn't lose work.
//
// Format:
//   funklang.autosave.index   → JSON array of timestamps (ms epoch), oldest first
//   funklang.autosave.<ts>    → base64-encoded .akp bytes for that snapshot
//
// Cap at MAX_ENTRIES — old entries are trimmed off the front. We keep a
// minute's resolution (one save every AUTOSAVE_INTERVAL_MS) so the
// resulting list spans MAX_ENTRIES minutes of history.
//
// Snapshots are deduplicated by content: if the patch hasn't changed
// since the last save we just refresh the timestamp index rather than
// pile up identical bytes.

import { serializeAkp, parseAkp } from '../fileio/akp';
import type { Patch } from '../patch/types';

const INDEX_KEY = 'funklang.autosave.index';
const ENTRY_PREFIX = 'funklang.autosave.';
const MAX_ENTRIES = 30;
export const AUTOSAVE_INTERVAL_MS = 60_000;

export interface AutosaveEntry {
  /** ms epoch — also the localStorage key suffix. */
  timestamp: number;
  /** Raw .akp bytes (lazy: only read when this entry is restored). */
  bytes: Uint8Array;
}

/** Lightweight storage adapter so tests can inject an in-memory shim. */
export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const browserStorage = (): StorageLike | null => {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
};

function readIndex(s: StorageLike): number[] {
  const raw = s.getItem(INDEX_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === 'number') : [];
  } catch { return []; }
}

function writeIndex(s: StorageLike, ix: number[]): void {
  s.setItem(INDEX_KEY, JSON.stringify(ix));
}

function bytesToBase64(b: Uint8Array): string {
  // Use chunks to dodge the spread-arg stack limit on big inputs.
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < b.length; i += CHUNK) {
    s += String.fromCharCode(...b.subarray(i, i + CHUNK));
  }
  // Browser: btoa. Node (vitest): Buffer.
  return typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64');
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Save `patch` as a new autosave entry, unless its bytes are identical
 * to the latest entry (in which case we noop — no point piling on
 * duplicate snapshots). Trims the index to MAX_ENTRIES.
 */
export function saveAutosave(patch: Patch, storage: StorageLike | null = browserStorage(), now = Date.now): number | null {
  if (!storage) return null;
  const bytes = serializeAkp(patch);
  const ix = readIndex(storage);
  // Dedupe against most-recent snapshot.
  if (ix.length > 0) {
    const lastTs = ix[ix.length - 1]!;
    const lastRaw = storage.getItem(ENTRY_PREFIX + lastTs);
    if (lastRaw) {
      try {
        const lastBytes = base64ToBytes(lastRaw);
        if (bytesEqual(lastBytes, bytes)) return lastTs;
      } catch { /* fall through to a fresh save */ }
    }
  }
  const ts = now();
  try {
    storage.setItem(ENTRY_PREFIX + ts, bytesToBase64(bytes));
  } catch {
    // Storage full — drop the oldest entry and try once.
    if (ix.length > 0) {
      const oldest = ix.shift()!;
      storage.removeItem(ENTRY_PREFIX + oldest);
      writeIndex(storage, ix);
      try { storage.setItem(ENTRY_PREFIX + ts, bytesToBase64(bytes)); }
      catch { return null; }
    } else { return null; }
  }
  ix.push(ts);
  while (ix.length > MAX_ENTRIES) {
    const oldest = ix.shift()!;
    storage.removeItem(ENTRY_PREFIX + oldest);
  }
  writeIndex(storage, ix);
  return ts;
}

/** List autosaves newest first. Each entry's bytes are read eagerly. */
export function listAutosaves(storage: StorageLike | null = browserStorage()): AutosaveEntry[] {
  if (!storage) return [];
  const ix = readIndex(storage);
  const out: AutosaveEntry[] = [];
  for (const ts of ix) {
    const raw = storage.getItem(ENTRY_PREFIX + ts);
    if (!raw) continue;
    try { out.push({ timestamp: ts, bytes: base64ToBytes(raw) }); }
    catch { /* skip corrupted entry */ }
  }
  out.reverse();
  return out;
}

/** Parse an entry's bytes back into a Patch. */
export function restoreAutosave(entry: AutosaveEntry): Patch {
  return parseAkp(entry.bytes);
}

/**
 * Start a recurring autosave loop. Returns a stop function. Pass a
 * `getPatch` closure rather than the patch itself so the loop always
 * sees the latest model state.
 *
 * Idle-tick fast path: the loop keeps the most-recently-serialized
 * bytes in closure scope. If a tick's serialized bytes match the
 * cache it skips the entire save call — no storage read, no base64
 * decode. `saveAutosave` ALSO dedupes against storage, so duplicates
 * still can't sneak in even when the cache is cold (HMR re-mount,
 * loop restart, etc.).
 */
export function startAutosaveLoop(
  getPatch: () => Patch,
  storage: StorageLike | null = browserStorage(),
  intervalMs: number = AUTOSAVE_INTERVAL_MS,
): () => void {
  if (!storage) return () => {};
  let lastBytes: Uint8Array | null = null;
  const id = setInterval(() => {
    try {
      const bytes = serializeAkp(getPatch());
      if (lastBytes && bytesEqual(lastBytes, bytes)) return;
      const ts = saveAutosave(getPatch(), storage);
      if (ts != null) lastBytes = bytes;
    } catch { /* swallow — autosave should never crash the app */ }
  }, intervalMs);
  return () => clearInterval(id);
}

/** Most recent autosave entry, or null. Useful for "restore on refresh". */
export function latestAutosave(storage: StorageLike | null = browserStorage()): AutosaveEntry | null {
  const all = listAutosaves(storage);
  return all[0] ?? null;
}

/**
 * Wipe every autosave entry from storage. Mainly for tests and the
 * "fresh project" use case where the user explicitly wants a clean
 * slate.
 */
export function clearAutosaves(storage: StorageLike | null = browserStorage()): void {
  if (!storage) return;
  const ix = readIndex(storage);
  for (const ts of ix) storage.removeItem(ENTRY_PREFIX + ts);
  storage.removeItem(INDEX_KEY);
}
