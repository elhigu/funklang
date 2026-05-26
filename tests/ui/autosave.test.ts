import { describe, it, expect, beforeEach } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import type { Patch } from '../../src/patch/types';
import {
  saveAutosave, listAutosaves, restoreAutosave,
  latestAutosave, clearAutosaves,
  type StorageLike,
} from '../../src/ui/autosave';

/** In-memory shim that mimics the localStorage API. */
function memStorage(): StorageLike {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => { m.set(k, v); },
    removeItem: (k) => { m.delete(k); },
  };
}

function variant(seed: number): Patch {
  const p = emptyPatch();
  // Each variant differs by one byte so the dedupe path doesn't
  // collapse them into one entry.
  p.instruments[0]!.sampleLength = seed * 2;
  p.instruments[0]!.slots.push({ ...emptySlot(), fn: 2, outVar: 1, freqVal: seed });
  return p;
}

let storage: StorageLike;
beforeEach(() => { storage = memStorage(); });

describe('autosave round-trip', () => {
  it('saves a patch and lists it back', () => {
    const p = variant(1);
    const ts = saveAutosave(p, storage, () => 1000);
    expect(ts).toBe(1000);
    const list = listAutosaves(storage);
    expect(list.length).toBe(1);
    expect(list[0]!.timestamp).toBe(1000);
    const restored = restoreAutosave(list[0]!);
    expect(restored.instruments[0]!.sampleLength).toBe(p.instruments[0]!.sampleLength);
  });

  it('lists entries newest first', () => {
    saveAutosave(variant(1), storage, () => 1000);
    saveAutosave(variant(2), storage, () => 2000);
    saveAutosave(variant(3), storage, () => 3000);
    const list = listAutosaves(storage);
    expect(list.map((e) => e.timestamp)).toEqual([3000, 2000, 1000]);
  });

  it('deduplicates identical consecutive snapshots', () => {
    const p = variant(7);
    const t1 = saveAutosave(p, storage, () => 1000);
    const t2 = saveAutosave(p, storage, () => 2000);   // same bytes
    expect(t1).toBe(1000);
    expect(t2).toBe(1000);     // dedup → reuses existing entry, NOT 2000
    expect(listAutosaves(storage).length).toBe(1);
  });

  it('trims to MAX_ENTRIES = 30', () => {
    for (let i = 0; i < 35; i++) {
      saveAutosave(variant(i + 1), storage, () => 1000 + i);
    }
    const list = listAutosaves(storage);
    expect(list.length).toBe(30);
    // Oldest 5 should have been dropped — newest first means index 29
    // is the 30th-newest, i.e. saved at ts 1000+5 = 1005.
    expect(list[list.length - 1]!.timestamp).toBe(1005);
  });

  it('latestAutosave returns the most recent entry', () => {
    saveAutosave(variant(1), storage, () => 1000);
    saveAutosave(variant(2), storage, () => 2000);
    const latest = latestAutosave(storage);
    expect(latest?.timestamp).toBe(2000);
  });

  it('clearAutosaves wipes the index and all entries', () => {
    saveAutosave(variant(1), storage, () => 1000);
    saveAutosave(variant(2), storage, () => 2000);
    clearAutosaves(storage);
    expect(listAutosaves(storage)).toEqual([]);
    expect(latestAutosave(storage)).toBeNull();
  });
});
