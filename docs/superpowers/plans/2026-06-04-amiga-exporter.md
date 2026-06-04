# Amiga Exporter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A pure-TS, Node-only module under `funklang/sizelab/` that turns a funklang `Patch` into the six Amiga build artifacts (`ilen.h`, `inst.h`, `Iset.h`, `support/Iswitch.h`, `Isamp.raw`, `empty.mod`) byte-for-byte identical to the original GUI's exe-export.

**Architecture:** A data-driven `inst.h` codegen (op→arg-spec table + generic renderer, with bespoke renderers for clone/imported/adsr) plus mechanical emitters for the other five files, orchestrated by one pure `exportPatch(patch)` function. Verified byte-exact against GUI reference captures (P01–P07). Fully isolated from the Vite app: `sizelab/` may import from `src/`, never the reverse.

**Tech Stack:** TypeScript, Vitest (Node environment), the existing `src/patch/types.ts`, `src/schema/op-metadata.ts`, `src/fileio/akp.ts`.

**Spec:** `funklang/docs/superpowers/specs/2026-06-04-amiga-exporter-design.md`
**Codegen oracle:** `/home/elhigu/projects/AMIGA/reference/AmigaKlangGUI-decompiled/Form1.cs` (out of git). Amiga export method: lines 4801–5670. Op switch cases: 4853–5532.

---

## Field mapping (Form1.cs arrays → funklang `Slot`)

The GUI iterates `l = 0..15` over a fixed 16-slot array; **the codegen's `instance` argument is the slot position `l`, not `slot.instance`.** Our `Patch.slots` positions correspond to `l`.

| Form1 array | `Slot` field | meaning |
|---|---|---|
| `arrayfunction[k,l]` | `fn` | op code (0 = empty) |
| `arrayvar[k,l]` | `outVar` | output var 0..4 (0 = slot not emitted) |
| `arrayfrequency[k,l]` / `arrayfrequencyval[k,l]` | `freq` / `freqVal` | freq: selector >0 ⇒ use var `v<freq>`, else literal `freqVal` |
| `arraygain[k,l]` / `arraygainval[k,l]` | `gain` / `gainVal` | gain selector / literal |
| `arraywidth[k,l]` / `arraywidthval[k,l]` | `width` / `widthVal` | width selector / literal |
| `arrayval1[k,l]` / `arrayval1value[k,l]` | `val1` / `val1Value` | val1 selector / literal |
| `arrayval2[k,l]` / `arrayval2value[k,l]` | `val2` / `val2Value` | val2 selector / literal |

`arrayvartext = ["", "v1", "v2", "v3", "v4"]` (index by selector). `samplelength[k]` = `instrument.sampleLength`; `loopoffset`/`looplength` = `loopOffset`/`loopLength`.

## File Structure

```
funklang/sizelab/
  exporter/
    hex.ts              # csHex(): C# ToString("X")
    arg-emit.ts         # ArgSpec model + renderArgs() generic renderer
    op-args.ts          # OP_ARGS: per-op ArgSpec table (regular ops)
    emit-inst.ts        # instrument/slot loop + clone/imported/adsr bespoke + emit()
    emit-ilen.ts        # ilen.h text
    emit-iset.ts        # Iset.h + Iswitch.h text
    emit-isamp.ts       # Isamp.raw bytes (concat + delta-encode)
    minimal-mod.ts      # synthesize the 2108-byte canonical mod
    emit-mod.ts         # patch sample-length/loop words into a mod copy
    export-patch.ts     # exportPatch(patch): ExportedArtifacts
    write-artifacts.ts  # writeArtifacts(artifacts, dir)
  fixtures/
    minimal.mod
    reference/<id>/...  # GUI-captured oracles (added in Task 12 handoff)
  tools/
    gen-verification-patches.ts
  isolation.test.ts     # src/ must not import sizelab/
```

Tests live beside sources as `*.test.ts` under `sizelab/` (matches repo convention of `tests/` but co-located is fine for the Node-only lab; vitest picks up `**/*.test.ts`).

---

## Task 1: `sizelab/` scaffold + isolation guard

**Files:**
- Create: `funklang/sizelab/exporter/.gitkeep` (placeholder so the dir exists)
- Create: `funklang/sizelab/isolation.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// funklang/sizelab/isolation.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

describe('isolation: src/ must not import sizelab/', () => {
  it('no file under src/ references sizelab', () => {
    const srcDir = join(__dirname, '..', 'src');
    const offenders = walk(srcDir).filter((f) =>
      /from ['"].*sizelab/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it passes immediately**

Run: `cd funklang && npx vitest run sizelab/isolation.test.ts`
Expected: PASS (no src file imports sizelab yet). This guard stays green forever.

- [ ] **Step 3: Ensure Vite never bundles sizelab**

Read `funklang/vite.config.ts`. Confirm the app entry is `index.html`/`src/main.ts` and `sizelab/` is not referenced. Add a comment in `vite.config.ts` near the top: `// NOTE: funklang/sizelab/ is Node-only (offline tooling) and must never be imported by src/ — see sizelab/isolation.test.ts`. No build-config change is needed (nothing imports it), only the comment.

- [ ] **Step 4: Commit**

```bash
git add funklang/sizelab funklang/vite.config.ts
git commit -m "feat(sizelab): scaffold + src↛sizelab isolation guard"
```

---

## Task 2: C# hex formatter

**Files:**
- Create: `funklang/sizelab/exporter/hex.ts`
- Create: `funklang/sizelab/exporter/hex.test.ts`

C#'s `int.ToString("X")` = uppercase hex, no leading zeros, and (critically) for negative `int` it prints the 8-digit two's-complement (e.g. `-1` → `FFFFFFFF`). Sample lengths/lengths are non-negative here, but match the semantics.

- [ ] **Step 1: Write the failing test**

```typescript
// funklang/sizelab/exporter/hex.test.ts
import { describe, it, expect } from 'vitest';
import { csHex } from './hex';

describe('csHex (C# ToString("X"))', () => {
  it('uppercase, no leading zeros', () => {
    expect(csHex(0)).toBe('0');
    expect(csHex(12288)).toBe('3000');
    expect(csHex(255)).toBe('FF');
    expect(csHex(2748)).toBe('ABC');
  });
  it('negative ints print 8-digit twos-complement', () => {
    expect(csHex(-1)).toBe('FFFFFFFF');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd funklang && npx vitest run sizelab/exporter/hex.test.ts`
Expected: FAIL — cannot resolve `./hex`.

- [ ] **Step 3: Write the implementation**

```typescript
// funklang/sizelab/exporter/hex.ts
/** Mirrors C# int.ToString("X"): uppercase, no leading zeros, 8-digit
 *  two's-complement for negatives. */
export function csHex(n: number): string {
  const i = n | 0;
  if (i < 0) return (i >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return i.toString(16).toUpperCase();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd funklang && npx vitest run sizelab/exporter/hex.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add funklang/sizelab/exporter/hex.ts funklang/sizelab/exporter/hex.test.ts
git commit -m "feat(sizelab): C# ToString(X) hex formatter"
```

---

## Task 3: minimal canonical mod

**Files:**
- Create: `funklang/sizelab/exporter/minimal-mod.ts`
- Create: `funklang/sizelab/exporter/minimal-mod.test.ts`

A valid ProTracker `M.K.` module: 1084-byte header + one 1024-byte empty pattern = 2108 bytes. Order table (offset 952..1079) all zero ⇒ highest pattern index 0 ⇒ 1 pattern. `songlength` (byte 950) = 1, restart (byte 951) = 127, `"M.K."` at 1080.

- [ ] **Step 1: Write the failing test**

```typescript
// funklang/sizelab/exporter/minimal-mod.test.ts
import { describe, it, expect } from 'vitest';
import { minimalMod, MOD_LENGTH_EMPTY } from './minimal-mod';

describe('minimalMod', () => {
  it('is a 2108-byte valid M.K. module', () => {
    const m = minimalMod();
    expect(m.length).toBe(2108);
    expect(MOD_LENGTH_EMPTY).toBe(2108);
    expect(String.fromCharCode(m[1080]!, m[1081]!, m[1082]!, m[1083]!)).toBe('M.K.');
    expect(m[950]).toBe(1);   // songlength
    expect(m[951]).toBe(127); // restart
  });
  it('order table is all zero (one pattern)', () => {
    const m = minimalMod();
    for (let i = 952; i <= 1079; i++) expect(m[i]).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd funklang && npx vitest run sizelab/exporter/minimal-mod.test.ts`
Expected: FAIL — cannot resolve `./minimal-mod`.

- [ ] **Step 3: Write the implementation**

```typescript
// funklang/sizelab/exporter/minimal-mod.ts
// Smallest valid ProTracker M.K. module: 1084-byte header + one empty
// 1024-byte pattern. All silence. nPatterns = 1.
export const MOD_LENGTH_EMPTY = 1084 + 1024; // 2108

export function minimalMod(): Uint8Array {
  const m = new Uint8Array(MOD_LENGTH_EMPTY); // zero-filled: title, 31 sample headers, order table
  m[950] = 1;    // song length (1 position)
  m[951] = 127;  // restart byte (ProTracker default)
  m[1080] = 0x4d; m[1081] = 0x2e; m[1082] = 0x4b; m[1083] = 0x2e; // "M.K."
  // sample headers (offset 20 + 30*n): length/finetune/volume left 0 — patched per-instrument later.
  // one empty pattern (1084..2107) stays all-zero.
  return m;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd funklang && npx vitest run sizelab/exporter/minimal-mod.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add funklang/sizelab/exporter/minimal-mod.ts funklang/sizelab/exporter/minimal-mod.test.ts
git commit -m "feat(sizelab): synthesize minimal canonical M.K. mod"
```

---

## Task 4: `empty.mod` patcher

**Files:**
- Create: `funklang/sizelab/exporter/emit-mod.ts`
- Create: `funklang/sizelab/exporter/emit-mod.test.ts`

Per Form1.cs 5646–5666: for each instrument `n` 0..30, write `sampleLength[n] >> 1` as **big-endian** u16 at mod offset `42 + 30*n` (hi) / `43 + 30*n` (lo). If slot 15's `fn == 22`: also write `loopOffset[n] >> 1` BE-u16 at `46/47 + 30*n` and `loopLength[n] >> 1` BE-u16 at `48/49 + 30*n`. Truncate to `MOD_LENGTH_EMPTY`.

- [ ] **Step 1: Write the failing test**

```typescript
// funklang/sizelab/exporter/emit-mod.test.ts
import { describe, it, expect } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import { minimalMod } from './minimal-mod';
import { patchMod } from './emit-mod';

describe('patchMod', () => {
  it('writes sampleLength>>1 as big-endian u16 at 42+30n / 43+30n', () => {
    const p = emptyPatch();
    p.instruments[0]!.sampleLength = 0x3000; // >>1 = 0x1800
    const out = patchMod(minimalMod(), p);
    expect(out[42]).toBe(0x18); // hi
    expect(out[43]).toBe(0x00); // lo
    expect(out.length).toBe(2108);
  });

  it('writes loop offset/length only when slot 15 is loop_gen (fn 22)', () => {
    const p = emptyPatch();
    const ins = p.instruments[1]!;
    ins.sampleLength = 0x2000;
    ins.loopOffset = 0x100; ins.loopLength = 0x80;
    ins.slots = Array.from({ length: 16 }, () => ({ ...emptySlot() }));
    ins.slots[15] = { ...emptySlot(), fn: 22 };
    const out = patchMod(minimalMod(), p);
    const base = 30 * 1;
    expect(out[46 + base]).toBe(0x00); expect(out[47 + base]).toBe(0x80); // 0x100>>1=0x80
    expect(out[48 + base]).toBe(0x00); expect(out[49 + base]).toBe(0x40); // 0x80>>1=0x40
  });

  it('does not write loop words when slot 15 is not loop_gen', () => {
    const p = emptyPatch();
    p.instruments[2]!.sampleLength = 0x10;
    p.instruments[2]!.loopOffset = 0x100;
    const out = patchMod(minimalMod(), p);
    const base = 30 * 2;
    expect(out[46 + base]).toBe(0); expect(out[47 + base]).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd funklang && npx vitest run sizelab/exporter/emit-mod.test.ts`
Expected: FAIL — cannot resolve `./emit-mod`.

- [ ] **Step 3: Write the implementation**

```typescript
// funklang/sizelab/exporter/emit-mod.ts
import type { Patch } from '../../src/patch/types';

/** Patch instrument sample-length (and loop, when slot 15 is loop_gen) words
 *  into a copy of `mod`, big-endian u16, mirroring Form1.cs 5646-5666. */
export function patchMod(mod: Uint8Array, patch: Patch): Uint8Array {
  const out = mod.slice();
  const beU16 = (off: number, v: number): void => {
    const w = (v >> 1) & 0xffff;
    out[off] = (w >> 8) & 0xff;
    out[off + 1] = w & 0xff;
  };
  for (let n = 0; n < 31; n++) {
    const ins = patch.instruments[n];
    if (!ins) continue;
    const base = 30 * n;
    beU16(42 + base, Math.max(0, ins.sampleLength | 0));
    if (ins.slots[15]?.fn === 22) {
      beU16(46 + base, Math.max(0, ins.loopOffset | 0));
      beU16(48 + base, Math.max(0, ins.loopLength | 0));
    }
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd funklang && npx vitest run sizelab/exporter/emit-mod.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add funklang/sizelab/exporter/emit-mod.ts funklang/sizelab/exporter/emit-mod.test.ts
git commit -m "feat(sizelab): empty.mod sample-length/loop patcher"
```

---

## Task 5: `Isamp.raw` (concat + delta-encode)

**Files:**
- Create: `funklang/sizelab/exporter/emit-isamp.ts`
- Create: `funklang/sizelab/exporter/emit-isamp.test.ts`

Per Form1.cs 5628–5644 + `delta_encode` (8180): concatenate the 8 imported samples in order (each `data.length` bytes), then delta-encode in place: `out[i] = buf[i] - prev; prev = buf[i]` (prev starts 0), bytes wrap mod 256.

- [ ] **Step 1: Write the failing test**

```typescript
// funklang/sizelab/exporter/emit-isamp.test.ts
import { describe, it, expect } from 'vitest';
import { emptyPatch } from '../../src/patch/types';
import { emitIsamp } from './emit-isamp';

describe('emitIsamp', () => {
  it('concatenates the 8 imports then successive-delta-encodes', () => {
    const p = emptyPatch();
    p.importedSamples[0]!.data = Int8Array.from([10, 13, 13, 8]);
    p.importedSamples[1]!.data = Int8Array.from([8]); // continues the delta chain
    const out = emitIsamp(p);
    // raw = [10,13,13,8, 8]; delta = [10,3,0,-5, 0] → bytes 0x0A,0x03,0x00,0xFB,0x00
    expect(Array.from(out)).toEqual([0x0a, 0x03, 0x00, 0xfb, 0x00]);
  });

  it('round-trips against the runtime delta-decode', () => {
    const p = emptyPatch();
    p.importedSamples[0]!.data = Int8Array.from([5, -7, 100, -100, 42]);
    const enc = emitIsamp(p);
    const dec = new Int8Array(enc.length);
    let last = 0;
    for (let i = 0; i < enc.length; i++) { last = (last + enc[i]!) << 24 >> 24; dec[i] = last; }
    expect(Array.from(dec)).toEqual([5, -7, 100, -100, 42]);
  });

  it('is empty when no imports', () => {
    expect(emitIsamp(emptyPatch()).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd funklang && npx vitest run sizelab/exporter/emit-isamp.test.ts`
Expected: FAIL — cannot resolve `./emit-isamp`.

- [ ] **Step 3: Write the implementation**

```typescript
// funklang/sizelab/exporter/emit-isamp.ts
import type { Patch } from '../../src/patch/types';

/** Concatenate the 8 imported samples then successive-delta-encode
 *  (Form1.cs delta_encode, 8180). Inverse of main-executable.c:510-515. */
export function emitIsamp(patch: Patch): Uint8Array {
  let total = 0;
  for (const s of patch.importedSamples) total += s.data.length;
  const raw = new Uint8Array(total);
  let off = 0;
  for (const s of patch.importedSamples) {
    raw.set(new Uint8Array(s.data.buffer, s.data.byteOffset, s.data.byteLength), off);
    off += s.data.length;
  }
  const out = new Uint8Array(total);
  let prev = 0;
  for (let i = 0; i < total; i++) {
    out[i] = (raw[i]! - prev) & 0xff;
    prev = raw[i]!;
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd funklang && npx vitest run sizelab/exporter/emit-isamp.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add funklang/sizelab/exporter/emit-isamp.ts funklang/sizelab/exporter/emit-isamp.test.ts
git commit -m "feat(sizelab): Isamp.raw concat + delta-encode"
```

---

## Task 6: `ilen.h` emitter

**Files:**
- Create: `funklang/sizelab/exporter/emit-ilen.ts`
- Create: `funklang/sizelab/exporter/emit-ilen.test.ts`

Per Form1.cs 4821–4835. `highestInstrument()` = (max index with `sampleLength > 2`) + 1 (Form1.cs 1037–1047; returns 0+1=1 if none — but our P-patches always have one). Loop `i < highestInstrument()`. Per instrument emit (with `// <name>` comment), then 8 `ImpLength[j]` lines. Note: `0x` prefix + `csHex`. `\r\n` throughout. Blank line after each instrument and after each ImpLength.

- [ ] **Step 1: Write the failing test**

```typescript
// funklang/sizelab/exporter/emit-ilen.test.ts
import { describe, it, expect } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import { emitIlen, highestInstrument } from './emit-ilen';

describe('highestInstrument', () => {
  it('is highest index with sampleLength>2, plus one', () => {
    const p = emptyPatch();
    p.instruments[0]!.sampleLength = 100;
    p.instruments[3]!.sampleLength = 100;
    p.instruments[5]!.sampleLength = 2; // not counted (<=2)
    expect(highestInstrument(p)).toBe(4);
  });
});

describe('emitIlen', () => {
  it('emits SmpLength/repeat/flag per instrument + 8 ImpLength, CRLF + 0xHEX', () => {
    const p = emptyPatch();
    p.instruments[0]!.name = 'lead';
    p.instruments[0]!.sampleLength = 0x3000;
    p.importedSamples[0]!.data = new Int8Array(0x10);
    const out = emitIlen(p);
    expect(out).toContain('// lead\r\n');
    expect(out).toContain('SmpLength[0] = 0x3000;\r\n');
    expect(out).toContain('repeat_offset[0] = 0x0;\r\n');
    expect(out).toContain('repeat_length[0] = 0x0;\r\n');
    expect(out).toContain("samplename_flag[0] = ' ';\r\n");
    expect(out).toContain('ImpLength[0] = 0x10;\r\n');
    expect(out).toContain('ImpLength[7] = 0x0;\r\n');
  });

  it("flags loop_gen instruments with 'l'", () => {
    const p = emptyPatch();
    p.instruments[0]!.sampleLength = 0x100;
    p.instruments[0]!.slots = Array.from({ length: 16 }, () => ({ ...emptySlot() }));
    p.instruments[0]!.slots[15] = { ...emptySlot(), fn: 22 };
    expect(emitIlen(p)).toContain("samplename_flag[0] = 'l';\r\n");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd funklang && npx vitest run sizelab/exporter/emit-ilen.test.ts`
Expected: FAIL — cannot resolve `./emit-ilen`.

- [ ] **Step 3: Write the implementation**

```typescript
// funklang/sizelab/exporter/emit-ilen.ts
import type { Patch } from '../../src/patch/types';
import { csHex } from './hex';

/** (max index with sampleLength>2) + 1. Form1.cs getnumberofhighestinstrument. */
export function highestInstrument(patch: Patch): number {
  let hi = 0;
  for (let i = 0; i < 31; i++) {
    if ((patch.instruments[i]?.sampleLength ?? 0) > 2) hi = i;
  }
  return hi + 1;
}

export function emitIlen(patch: Patch): string {
  let s = '';
  const n = highestInstrument(patch);
  for (let i = 0; i < n; i++) {
    const ins = patch.instruments[i]!;
    const flag = ins.slots[15]?.fn === 22 ? 'l' : ' ';
    s += `// ${ins.name}\r\n`;
    s += `SmpLength[${i}] = 0x${csHex(ins.sampleLength)};\r\n`;
    s += `repeat_offset[${i}] = 0x${csHex(ins.loopOffset)};\r\n`;
    s += `repeat_length[${i}] = 0x${csHex(ins.loopLength)};\r\n`;
    s += `samplename_flag[${i}] = '${flag}';\r\n`;
    s += `\r\n`;
  }
  for (let j = 0; j < 8; j++) {
    s += `ImpLength[${j}] = 0x${csHex(patch.importedSamples[j]?.data.length ?? 0)};\r\n`;
    s += `\r\n`;
  }
  return s;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd funklang && npx vitest run sizelab/exporter/emit-ilen.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add funklang/sizelab/exporter/emit-ilen.ts funklang/sizelab/exporter/emit-ilen.test.ts
git commit -m "feat(sizelab): ilen.h emitter"
```

---

## Task 7: `Iset.h` + `Iswitch.h` emitter

**Files:**
- Create: `funklang/sizelab/exporter/emit-iset.ts`
- Create: `funklang/sizelab/exporter/emit-iset.test.ts`

Per Form1.cs 5589–5626. `numinstruments` = `highestInstrument`. `mod_length_empty` = `MOD_LENGTH_EMPTY` (2108, since our mod has 1 pattern). `imp_length` = Σ import lengths. `gen_length` = Σ `sampleLength` over all instruments (the GUI's `labelTotalSize`). Decimal (not hex) for these three.

- [ ] **Step 1: Write the failing test**

```typescript
// funklang/sizelab/exporter/emit-iset.test.ts
import { describe, it, expect } from 'vitest';
import { emptyPatch } from '../../src/patch/types';
import { emitIset, emitIswitch } from './emit-iset';

describe('emitIset', () => {
  it('emits the fixed header with computed numinstruments/lengths', () => {
    const p = emptyPatch();
    p.instruments[0]!.sampleLength = 1000;
    p.instruments[1]!.sampleLength = 2000;
    p.importedSamples[0]!.data = new Int8Array(50);
    const out = emitIset(p);
    expect(out).toBe(
      '#define executable\r\n' +
      '#define numinstruments 2\r\n' +
      'const void * protrackermod;\r\n' +
      'INCBIN(protrackermod, "empty.mod");\r\n' +
      'const void * importedsamples;\r\n' +
      'INCBIN(importedsamples, "Isamp.raw");\r\n' +
      'int mod_length_empty = 2108;\r\n' +
      'int imp_length = 50;\r\n' +
      'long gen_length = 3000;\r\n',
    );
  });
});

describe('emitIswitch', () => {
  it('is exactly the executable define', () => {
    expect(emitIswitch()).toBe('#define executable\r\n');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd funklang && npx vitest run sizelab/exporter/emit-iset.test.ts`
Expected: FAIL — cannot resolve `./emit-iset`.

- [ ] **Step 3: Write the implementation**

```typescript
// funklang/sizelab/exporter/emit-iset.ts
import type { Patch } from '../../src/patch/types';
import { highestInstrument } from './emit-ilen';
import { MOD_LENGTH_EMPTY } from './minimal-mod';

export function emitIset(patch: Patch): string {
  const numinstruments = highestInstrument(patch);
  let imp = 0;
  for (const s of patch.importedSamples) imp += s.data.length;
  let gen = 0;
  for (const ins of patch.instruments) gen += Math.max(0, ins.sampleLength | 0);
  return (
    '#define executable\r\n' +
    `#define numinstruments ${numinstruments}\r\n` +
    'const void * protrackermod;\r\n' +
    'INCBIN(protrackermod, "empty.mod");\r\n' +
    'const void * importedsamples;\r\n' +
    'INCBIN(importedsamples, "Isamp.raw");\r\n' +
    `int mod_length_empty = ${MOD_LENGTH_EMPTY};\r\n` +
    `int imp_length = ${imp};\r\n` +
    `long gen_length = ${gen};\r\n`
  );
}

export function emitIswitch(): string {
  return '#define executable\r\n';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd funklang && npx vitest run sizelab/exporter/emit-iset.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add funklang/sizelab/exporter/emit-iset.ts funklang/sizelab/exporter/emit-iset.test.ts
git commit -m "feat(sizelab): Iset.h + Iswitch.h emitter"
```

---

## Task 8: `inst.h` arg model + generic renderer

**Files:**
- Create: `funklang/sizelab/exporter/arg-emit.ts`
- Create: `funklang/sizelab/exporter/arg-emit.test.ts`

The argument primitives observed across cases 1–21 (Form1.cs 4853–5489). Each arg renders to a string; args are joined with `", "`.

- `INSTANCE` → the slot position `l` (decimal)
- `SMP` → `"smp"`
- `ZERO` → `"0"`
- `VAR(field)` → `arrayvartext[slot[field]]` i.e. `v<sel>` (selector 1..4) or `""` if 0
- `VARLIT(sel, lit)` → if `slot[sel] > 0` then `v<sel>`, else decimal `slot[lit]`
- `RAW(field)` → decimal `slot[field]` (raw number, e.g. sv_flt_n gain, chordgen indices)
- `BASEADR(field)` → `BaseAdr[<slot[field]>]`

`arrayvartext` = `['', 'v1', 'v2', 'v3', 'v4']`.

- [ ] **Step 1: Write the failing test**

```typescript
// funklang/sizelab/exporter/arg-emit.test.ts
import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { renderArgs, VARTEXT } from './arg-emit';

describe('renderArgs', () => {
  it('VARTEXT table', () => {
    expect(VARTEXT).toEqual(['', 'v1', 'v2', 'v3', 'v4']);
  });

  it('renders instance(l), VARLIT var vs literal, joined by ", "', () => {
    const slot = { ...emptySlot(), freq: 2, freqVal: 999, gain: 0, gainVal: 64 };
    // osc_saw shape: INSTANCE, VARLIT(freq,freqVal), VARLIT(gain,gainVal)
    const s = renderArgs(slot, 3, [
      { kind: 'instance' },
      { kind: 'varlit', sel: 'freq', lit: 'freqVal' },
      { kind: 'varlit', sel: 'gain', lit: 'gainVal' },
    ]);
    expect(s).toBe('3, v2, 64'); // freq selector 2 → v2; gain selector 0 → literal 64
  });

  it('VAR emits only the var name; RAW emits raw decimal; SMP/ZERO literal', () => {
    const slot = { ...emptySlot(), val1: 1, gain: 5 };
    expect(renderArgs(slot, 0, [{ kind: 'smp' }])).toBe('smp');
    expect(renderArgs(slot, 0, [{ kind: 'zero' }])).toBe('0');
    expect(renderArgs(slot, 0, [{ kind: 'var', field: 'val1' }])).toBe('v1');
    expect(renderArgs(slot, 0, [{ kind: 'raw', field: 'gain' }])).toBe('5');
    expect(renderArgs(slot, 0, [{ kind: 'baseadr', field: 'gain' }])).toBe('BaseAdr[5]');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd funklang && npx vitest run sizelab/exporter/arg-emit.test.ts`
Expected: FAIL — cannot resolve `./arg-emit`.

- [ ] **Step 3: Write the implementation**

```typescript
// funklang/sizelab/exporter/arg-emit.ts
import type { Slot } from '../../src/patch/types';

export const VARTEXT = ['', 'v1', 'v2', 'v3', 'v4'] as const;

export type ArgSpec =
  | { kind: 'instance' }
  | { kind: 'smp' }
  | { kind: 'zero' }
  | { kind: 'var'; field: keyof Slot }
  | { kind: 'varlit'; sel: keyof Slot; lit: keyof Slot }
  | { kind: 'raw'; field: keyof Slot }
  | { kind: 'baseadr'; field: keyof Slot };

function vartext(sel: number): string {
  return VARTEXT[sel] ?? '';
}

export function renderArg(slot: Slot, l: number, a: ArgSpec): string {
  switch (a.kind) {
    case 'instance': return String(l);
    case 'smp': return 'smp';
    case 'zero': return '0';
    case 'var': return vartext(slot[a.field] as number);
    case 'varlit': {
      const sel = slot[a.sel] as number;
      return sel > 0 ? vartext(sel) : String(slot[a.lit] as number);
    }
    case 'raw': return String(slot[a.field] as number);
    case 'baseadr': return `BaseAdr[${slot[a.field] as number}]`;
  }
}

export function renderArgs(slot: Slot, l: number, specs: ArgSpec[]): string {
  return specs.map((a) => renderArg(slot, l, a)).join(', ');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd funklang && npx vitest run sizelab/exporter/arg-emit.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add funklang/sizelab/exporter/arg-emit.ts funklang/sizelab/exporter/arg-emit.test.ts
git commit -m "feat(sizelab): inst.h arg-spec model + generic renderer"
```

---

## Task 9: per-op arg-spec table (regular ops)

**Files:**
- Create: `funklang/sizelab/exporter/op-args.ts`
- Create: `funklang/sizelab/exporter/op-args.test.ts`

The arg-spec for each regular op, transcribed from Form1.cs cases (cited). Ops 17/20/23 are bespoke (Task 11) and are NOT in this table. `fn` keys are op codes.

| fn | op | Form1 case (line) | arg specs |
|---|---|---|---|
| 1 | vol | 4855 | `var(val1), varlit(gain,gainVal)` |
| 2 | osc_saw | 4873 | `instance, varlit(freq,freqVal), varlit(gain,gainVal)` |
| 3 | osc_tri | 4903 | same as 2 |
| 4 | osc_sine | 4933 | same as 2 |
| 5 | osc_pulse | 4963 | `instance, varlit(freq,freqVal), varlit(gain,gainVal), varlit(width,widthVal)` |
| 6 | osc_noise | 5005 | `smp, varlit(gain,gainVal)` |
| 7 | enva | 5023 | `smp, varlit(val1,val1Value), zero, varlit(gain,gainVal)` |
| 8 | envd | 5055 | `smp, varlit(val1,val1Value), varlit(val2,val2Value), varlit(gain,gainVal)` |
| 9 | add | 5097 | `var(val1), varlit(val2,val2Value)` |
| 10 | mul | 5117 | `var(val1), varlit(val2,val2Value)` |
| 11 | dly_cyc | 5137 | `instance, var(val1)+err, varlit(freq,freqVal), varlit(gain,gainVal)` |
| 12 | cmb_flt_n | 5176 | `instance, var(val1), varlit(freq,freqVal), varlit(val2,val2Value), varlit(gain,gainVal)` |
| 13 | reverb | 5222 | `var(val1)+err, varlit(val2,val2Value), varlit(gain,gainVal)` |
| 14 | ctrl | 5259 | `var(val1)` |
| 15 | sv_flt_n | 5267 | `instance, var(val1)+err, varlit(freq,freqVal), varlit(val2,val2Value), raw(gain)` |
| 16 | distortion | 5310 | `var(val1), varlit(gain,gainVal)` |
| 18 | chordgen | 5396 | `smp, baseadr(gain), raw(freq), raw(width), raw(val1), varlit(val2,val2Value)` |
| 19 | sh | 5430 | `instance, var(val1)+err, varlit(gain,gainVal)` |
| 21 | onepole_flt | 5465 | `instance, var(val1), varlit(freq,freqVal), raw(gain)` |

`+err` = the GUI shows an error and aborts if `val1 selector == 0` (cases 11/13/15/19, lines 5143/5226/5273/5436). Model as an `errIfVal1Zero: true` flag on the op entry.

- [ ] **Step 1: Write the failing test**

```typescript
// funklang/sizelab/exporter/op-args.test.ts
import { describe, it, expect } from 'vitest';
import { OP_ARGS } from './op-args';

describe('OP_ARGS table', () => {
  it('osc_saw (2) is instance + 2 varlits', () => {
    expect(OP_ARGS[2]!.specs).toEqual([
      { kind: 'instance' },
      { kind: 'varlit', sel: 'freq', lit: 'freqVal' },
      { kind: 'varlit', sel: 'gain', lit: 'gainVal' },
    ]);
  });
  it('sv_flt_n (15) ends in a RAW gain and flags val1-zero error', () => {
    const e = OP_ARGS[15]!;
    expect(e.specs.at(-1)).toEqual({ kind: 'raw', field: 'gain' });
    expect(e.errIfVal1Zero).toBe(true);
  });
  it('omits bespoke ops 17, 20, 23 and skipped/absent 22, 24', () => {
    for (const fn of [17, 20, 22, 23, 24]) expect(OP_ARGS[fn]).toBeUndefined();
  });
  it('covers every regular op 1-21 except 17/20', () => {
    for (const fn of [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,18,19,21]) {
      expect(OP_ARGS[fn], `fn ${fn}`).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd funklang && npx vitest run sizelab/exporter/op-args.test.ts`
Expected: FAIL — cannot resolve `./op-args`.

- [ ] **Step 3: Write the implementation**

```typescript
// funklang/sizelab/exporter/op-args.ts
import type { ArgSpec } from './arg-emit';

export interface OpArgs {
  specs: ArgSpec[];
  /** Form1 aborts with an error if val1 selector is 0 (cases 11/13/15/19). */
  errIfVal1Zero?: boolean;
}

const I: ArgSpec = { kind: 'instance' };
const SMP: ArgSpec = { kind: 'smp' };
const ZERO: ArgSpec = { kind: 'zero' };
const v = (field: ArgSpec extends { field: infer F } ? F : never): ArgSpec => ({ kind: 'var', field });
const vl = (sel: 'freq' | 'gain' | 'width' | 'val1' | 'val2',
            lit: 'freqVal' | 'gainVal' | 'widthVal' | 'val1Value' | 'val2Value'): ArgSpec =>
  ({ kind: 'varlit', sel, lit });
const raw = (field: 'gain' | 'freq' | 'width' | 'val1'): ArgSpec => ({ kind: 'raw', field });
const VAR = (field: 'val1'): ArgSpec => ({ kind: 'var', field });

export const OP_ARGS: Record<number, OpArgs | undefined> = {
  1:  { specs: [VAR('val1'), vl('gain', 'gainVal')] },
  2:  { specs: [I, vl('freq', 'freqVal'), vl('gain', 'gainVal')] },
  3:  { specs: [I, vl('freq', 'freqVal'), vl('gain', 'gainVal')] },
  4:  { specs: [I, vl('freq', 'freqVal'), vl('gain', 'gainVal')] },
  5:  { specs: [I, vl('freq', 'freqVal'), vl('gain', 'gainVal'), vl('width', 'widthVal')] },
  6:  { specs: [SMP, vl('gain', 'gainVal')] },
  7:  { specs: [SMP, vl('val1', 'val1Value'), ZERO, vl('gain', 'gainVal')] },
  8:  { specs: [SMP, vl('val1', 'val1Value'), vl('val2', 'val2Value'), vl('gain', 'gainVal')] },
  9:  { specs: [VAR('val1'), vl('val2', 'val2Value')] },
  10: { specs: [VAR('val1'), vl('val2', 'val2Value')] },
  11: { specs: [I, VAR('val1'), vl('freq', 'freqVal'), vl('gain', 'gainVal')], errIfVal1Zero: true },
  12: { specs: [I, VAR('val1'), vl('freq', 'freqVal'), vl('val2', 'val2Value'), vl('gain', 'gainVal')] },
  13: { specs: [VAR('val1'), vl('val2', 'val2Value'), vl('gain', 'gainVal')], errIfVal1Zero: true },
  14: { specs: [VAR('val1')] },
  15: { specs: [I, VAR('val1'), vl('freq', 'freqVal'), vl('val2', 'val2Value'), raw('gain')], errIfVal1Zero: true },
  16: { specs: [VAR('val1'), vl('gain', 'gainVal')] },
  18: { specs: [SMP, { kind: 'baseadr', field: 'gain' }, raw('freq'), raw('width'), raw('val1'), vl('val2', 'val2Value')] },
  19: { specs: [I, VAR('val1'), vl('gain', 'gainVal')], errIfVal1Zero: true },
  21: { specs: [I, VAR('val1'), vl('freq', 'freqVal'), raw('gain')] },
};
```

> If the `v`/typing helpers cause TS friction, inline the `{ kind: 'var', field: 'val1' }` literals directly — the table values are what matter, not the helper sugar. Keep `VAR`/`vl`/`raw` only if they typecheck cleanly.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd funklang && npx vitest run sizelab/exporter/op-args.test.ts`
Expected: PASS. Run `npm run typecheck` too; if the helper generics complain, inline the literals per the note.

- [ ] **Step 5: Commit**

```bash
git add funklang/sizelab/exporter/op-args.ts funklang/sizelab/exporter/op-args.test.ts
git commit -m "feat(sizelab): per-op arg-spec table for regular ops"
```

---

## Task 10: `inst.h` instrument/slot driver + regular-op emission

**Files:**
- Create: `funklang/sizelab/exporter/emit-inst.ts`
- Create: `funklang/sizelab/exporter/emit-inst.test.ts`

Driver per Form1.cs 4837–5534: loop `k` 0..30, skip `sampleLength <= 2`; emit `// <name>\r\n` + `if (instrument == k) {\r\n`; loop `l` 0..15, skip `outVar == 0 || fn == 22`; emit `<vN> = <opname>(<args>);\r\n`; close `}\r\n`. `opname` from the 25-entry table (17/20 blank). This task wires the driver + regular ops (via `OP_ARGS`); bespoke 17/20/23 land in Task 11 (here they throw "not yet implemented" so the driver is testable now).

- [ ] **Step 1: Write the failing test**

```typescript
// funklang/sizelab/exporter/emit-inst.test.ts
import { describe, it, expect } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import { emitInst, OPNAME } from './emit-inst';

function instr(p: ReturnType<typeof emptyPatch>, k: number, sampleLength: number, slots: Array<Partial<import('../../src/patch/types').Slot>>) {
  const ins = p.instruments[k]!;
  ins.sampleLength = sampleLength;
  ins.slots = Array.from({ length: 16 }, () => ({ ...emptySlot() }));
  slots.forEach((s, i) => { ins.slots[i] = { ...emptySlot(), ...s }; });
}

describe('emitInst', () => {
  it('wraps each non-trivial instrument and emits regular-op slot lines', () => {
    const p = emptyPatch();
    p.instruments[0]!.name = 'lead';
    // slot0: v1 = osc_saw(0, 1000, 64)   freq literal 1000, gain literal 64
    instr(p, 0, 5000, [{ fn: 2, outVar: 1, freqVal: 1000, gainVal: 64 }]);
    const out = emitInst(p);
    expect(out).toContain('// lead\r\n');
    expect(out).toContain('if (instrument == 0) {\r\n');
    expect(out).toContain('v1 = osc_saw(0, 1000, 64);\r\n');
    expect(out.endsWith('}\r\n')).toBe(true);
  });

  it('skips instruments with sampleLength<=2 and slots with outVar 0 or fn 22', () => {
    const p = emptyPatch();
    instr(p, 0, 2, [{ fn: 2, outVar: 1 }]);          // whole instrument skipped
    instr(p, 1, 5000, [
      { fn: 2, outVar: 0, freqVal: 5 },               // outVar 0 → skipped
      { fn: 22, outVar: 1 },                          // loop_gen → skipped
      { fn: 1, outVar: 2, val1: 1, gainVal: 10 },     // v2 = vol(v1, 10)
    ]);
    const out = emitInst(p);
    expect(out).not.toContain('instrument == 0');
    expect(out).toContain('if (instrument == 1) {\r\n');
    expect(out).toContain('v2 = vol(v1, 10);\r\n');
    expect(out).not.toContain('osc_saw');
  });

  it('uses variable args when a selector is set', () => {
    const p = emptyPatch();
    instr(p, 0, 5000, [{ fn: 2, outVar: 3, freq: 2, freqVal: 999, gain: 0, gainVal: 50 }]);
    expect(emitInst(p)).toContain('v3 = osc_saw(0, v2, 50);\r\n');
  });

  it('throws on an unknown/unsupported op (e.g. vocoder 24)', () => {
    const p = emptyPatch();
    instr(p, 0, 5000, [{ fn: 24, outVar: 1 }]);
    expect(() => emitInst(p)).toThrow(/unsupported op/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd funklang && npx vitest run sizelab/exporter/emit-inst.test.ts`
Expected: FAIL — cannot resolve `./emit-inst`.

- [ ] **Step 3: Write the implementation**

```typescript
// funklang/sizelab/exporter/emit-inst.ts
import type { Patch, Slot } from '../../src/patch/types';
import { VARTEXT, renderArgs } from './arg-emit';
import { OP_ARGS } from './op-args';
import { emitClone, emitImported, emitAdsr } from './emit-inst-special';

/** 25-entry op-name table, Form1.cs line 41. 17 (clone) and 20 (imported) are
 *  blank because they emit a bare expression (prefix already opened a paren). */
export const OPNAME: string[] = [
  '', 'vol', 'osc_saw', 'osc_tri', 'osc_sine', 'osc_pulse', 'osc_noise',
  'enva', 'envd', 'add', 'mul', 'dly_cyc', 'cmb_flt_n', 'reverb', 'ctrl',
  'sv_flt_n', 'distortion', '', 'chordgen', 'sh', '', 'onepole_flt',
  '', 'adsr', 'vocoder',
];

function emitSlotArgs(slot: Slot, l: number, k: number): string {
  const fn = slot.fn;
  // Bespoke expression ops (Task 11).
  if (fn === 17) return emitClone(slot, k);
  if (fn === 20) return emitImported(slot);
  if (fn === 23) return emitAdsr(slot, l, k);
  const op = OP_ARGS[fn];
  if (!op) throw new Error(`unsupported op fn=${fn} (instrument ${k + 1}, slot ${l})`);
  if (op.errIfVal1Zero && slot.val1 === 0) {
    throw new Error(`Error in instrument ${k + 1}: ${OPNAME[fn]} requires a val1 variable`);
  }
  return renderArgs(slot, l, op.specs);
}

export function emitInst(patch: Patch): string {
  let s = '';
  for (let k = 0; k < 31; k++) {
    const ins = patch.instruments[k];
    if (!ins || ins.sampleLength <= 2) continue;
    s += `// ${ins.name}\r\n`;
    s += `if (instrument == ${k}) {\r\n`;
    for (let l = 0; l < 16; l++) {
      const slot = ins.slots[l];
      if (!slot || slot.outVar === 0 || slot.fn === 22) continue;
      const name = OPNAME[slot.fn] ?? '';
      s += `${VARTEXT[slot.outVar]} = ${name}(${emitSlotArgs(slot, l, k)});\r\n`;
    }
    s += `}\r\n`;
  }
  return s;
}
```

Also create a temporary `emit-inst-special.ts` stub so this task compiles (Task 11 fills it):

```typescript
// funklang/sizelab/exporter/emit-inst-special.ts
import type { Slot } from '../../src/patch/types';
export function emitClone(_slot: Slot, _k: number): string { throw new Error('clone: not yet implemented (Task 11)'); }
export function emitImported(_slot: Slot): string { throw new Error('imported: not yet implemented (Task 11)'); }
export function emitAdsr(_slot: Slot, _l: number, _k: number): string { throw new Error('adsr: not yet implemented (Task 11)'); }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd funklang && npx vitest run sizelab/exporter/emit-inst.test.ts`
Expected: PASS (the regular-op + driver tests; bespoke ops aren't exercised here).

- [ ] **Step 5: Commit**

```bash
git add funklang/sizelab/exporter/emit-inst.ts funklang/sizelab/exporter/emit-inst-special.ts funklang/sizelab/exporter/emit-inst.test.ts
git commit -m "feat(sizelab): inst.h driver + regular-op emission"
```

---

## Task 11: bespoke ops — clone (17), imported (20), adsr (23)

**Files:**
- Modify: `funklang/sizelab/exporter/emit-inst-special.ts` (replace stubs)
- Create: `funklang/sizelab/exporter/emit-inst-special.test.ts`

Transcribe Form1.cs case 17 (5328–5394), case 20 (5455–5463), case 23 (5491–5530). These emit raw expressions (clone/imported rely on the blank opname so the prefix `vN = (` opens the paren). Exact output strings below are the test oracles.

**imported (20)** — Form1.cs 5455–5463, args = `gain` (import index):
`smp < ImpLength[<gain>] ? *(BYTE*)(BaseImpAdr[<gain>]+smp)<<8 : 0`

**clone (17)** — Form1.cs 5328–5394. `freq`/`freqVal` = transpose (varlit), `val2Value` = offset literal, `gain` = source instrument index, `gainVal` selects forward (0) vs reverse (≠0). Let `F` = `freq>0 ? v<freq> : freqVal`. Forward (`gainVal == 0`):
`(((smp*(<F>+32768))>>15)+<val2Value>)< SmpLength[<gain>] ? *(BYTE*)(BaseAdr[<gain>]+((smp*(<F>+32768))>>15)+<val2Value>)<<8 : 0`
Reverse (`gainVal != 0`):
`(((smp*(<F>+32768))>>15)+<val2Value>)< SmpLength[<gain>] ? *(BYTE*)(BaseAdr[<gain+1>]-(((smp*(<F>+32768))>>15)+<val2Value>))<<8 : 0`

**adsr (23)** — Form1.cs 5491–5529. Precompute (C# int math), emit `<l>, <a8>, <a9>, <num7>, <num4>, <a10>, <num6>`:
```
num  = (val2Value<<8)+1
num2 = (val1Value<<8)+1
num3 = (freqVal<<8)+1
num4 = sampleLength[k] - num - num2 - num3
b    = gainVal              // byte
num5 = (widthVal<<8) | 0 as short
num6 = (32767*b)<<1
num7 = (num5*b)<<1
num8 = (num6/num) | 0
num9 = ((num6-num7)/num2) | 0
num10= (num7/num3) | 0
emit: `${l}, ${num8}, ${num9}, ${num7}, ${num4}, ${num10}, ${num6}`
```

- [ ] **Step 1: Write the failing test**

```typescript
// funklang/sizelab/exporter/emit-inst-special.test.ts
import { describe, it, expect } from 'vitest';
import { emptySlot } from '../../src/patch/types';
import { emitClone, emitImported, emitAdsr } from './emit-inst-special';

describe('imported (20)', () => {
  it('inline ImpLength ternary keyed on gain', () => {
    expect(emitImported({ ...emptySlot(), gain: 3 }))
      .toBe('smp < ImpLength[3] ? *(BYTE*)(BaseImpAdr[3]+smp)<<8 : 0');
  });
});

describe('clone (17)', () => {
  it('forward (gainVal 0), literal transpose', () => {
    const slot = { ...emptySlot(), freq: 0, freqVal: 100, val2Value: 5, gain: 2, gainVal: 0 };
    expect(emitClone(slot, 4)).toBe(
      '(((smp*(100+32768))>>15)+5)< SmpLength[2] ? ' +
      '*(BYTE*)(BaseAdr[2]+((smp*(100+32768))>>15)+5)<<8 : 0',
    );
  });
  it('reverse (gainVal != 0) uses BaseAdr[gain+1] and subtraction', () => {
    const slot = { ...emptySlot(), freq: 1, freqVal: 0, val2Value: 0, gain: 2, gainVal: 1 };
    expect(emitClone(slot, 4)).toBe(
      '(((smp*(v1+32768))>>15)+0)< SmpLength[2] ? ' +
      '*(BYTE*)(BaseAdr[3]-(((smp*(v1+32768))>>15)+0))<<8 : 0',
    );
  });
});

describe('adsr (23)', () => {
  it('precomputed rates as 7 comma args', () => {
    // val2Value=0→num=1, val1Value=0→num2=1, freqVal=0→num3=1, sampleLength=1000→num4=997
    // gainVal=100→b=100; widthVal=0→num5=0; num6=32767*100<<1=6553400; num7=0
    // num8=6553400/1=6553400; num9=(6553400-0)/1=6553400; num10=0/1=0
    const slot = { ...emptySlot(), val2Value: 0, val1Value: 0, freqVal: 0, gainVal: 100, widthVal: 0 };
    expect(emitAdsr(slot, 7, 0)).toBe('7, 6553400, 6553400, 0, 997, 0, 6553400');
  });
});
```

NOTE: `emitAdsr` needs `sampleLength[k]`. Pass it via a third param sourced by the caller (the driver passes `k`; update the signature to take the instrument's `sampleLength`). Adjust the stub/caller accordingly: `emitAdsr(slot, l, sampleLength)`. Update `emit-inst.ts` to call `emitAdsr(slot, l, ins.sampleLength)` and this test to pass `1000` as the third arg instead of `0`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd funklang && npx vitest run sizelab/exporter/emit-inst-special.test.ts`
Expected: FAIL — stubs throw "not yet implemented".

- [ ] **Step 3: Write the implementation**

```typescript
// funklang/sizelab/exporter/emit-inst-special.ts
import type { Slot } from '../../src/patch/types';
import { VARTEXT } from './arg-emit';

function freqExpr(slot: Slot): string {
  return slot.freq > 0 ? VARTEXT[slot.freq]! : String(slot.freqVal);
}

// case 20 (Form1.cs 5455-5463)
export function emitImported(slot: Slot): string {
  const g = slot.gain;
  return `smp < ImpLength[${g}] ? *(BYTE*)(BaseImpAdr[${g}]+smp)<<8 : 0`;
}

// case 17 (Form1.cs 5328-5394)
export function emitClone(slot: Slot, _k: number): string {
  const F = freqExpr(slot);
  const off = slot.val2Value;
  const g = slot.gain;
  const idx = `((smp*(${F}+32768))>>15)+${off}`;
  const cond = `(${idx})< SmpLength[${g}] ? `;
  if (slot.gainVal === 0) {
    return `${cond}*(BYTE*)(BaseAdr[${g}]+${idx})<<8 : 0`;
  }
  return `${cond}*(BYTE*)(BaseAdr[${g + 1}]-(${idx}))<<8 : 0`;
}

// case 23 (Form1.cs 5491-5529)
export function emitAdsr(slot: Slot, l: number, sampleLength: number): string {
  const num = (slot.val2Value << 8) + 1;
  const num2 = (slot.val1Value << 8) + 1;
  const num3 = (slot.freqVal << 8) + 1;
  const num4 = sampleLength - num - num2 - num3;
  const b = slot.gainVal & 0xff;
  const num5 = (slot.widthVal << 8) << 16 >> 16; // (short)(widthVal<<8)
  const num6 = (32767 * b) << 1;
  const num7 = (num5 * b) << 1;
  const num8 = Math.trunc(num6 / num);
  const num9 = Math.trunc((num6 - num7) / num2);
  const num10 = Math.trunc(num7 / num3);
  return `${l}, ${num8}, ${num9}, ${num7}, ${num4}, ${num10}, ${num6}`;
}
```

Then update `emit-inst.ts`: change the bespoke call to `if (fn === 23) return emitAdsr(slot, l, ins.sampleLength);` — but `emitSlotArgs` currently lacks `ins`. Pass `ins.sampleLength` through: change `emitSlotArgs(slot, l, k)` to `emitSlotArgs(slot, l, k, ins.sampleLength)` and the signature accordingly; the adsr branch uses it.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd funklang && npx vitest run sizelab/exporter/emit-inst-special.test.ts sizelab/exporter/emit-inst.test.ts`
Expected: PASS. Also `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add funklang/sizelab/exporter/emit-inst-special.ts funklang/sizelab/exporter/emit-inst-special.test.ts funklang/sizelab/exporter/emit-inst.ts
git commit -m "feat(sizelab): bespoke inst.h ops — clone, imported, adsr"
```

---

## Task 12: orchestrator + disk writer

**Files:**
- Create: `funklang/sizelab/exporter/export-patch.ts`
- Create: `funklang/sizelab/exporter/write-artifacts.ts`
- Create: `funklang/sizelab/exporter/export-patch.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// funklang/sizelab/exporter/export-patch.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import { exportPatch } from './export-patch';
import { writeArtifacts } from './write-artifacts';

function patch() {
  const p = emptyPatch();
  p.instruments[0]!.name = 'lead';
  p.instruments[0]!.sampleLength = 5000;
  p.instruments[0]!.slots = Array.from({ length: 16 }, () => ({ ...emptySlot() }));
  p.instruments[0]!.slots[0] = { ...emptySlot(), fn: 2, outVar: 1, freqVal: 1000, gainVal: 64 };
  return p;
}

describe('exportPatch', () => {
  it('returns all six artifacts with expected types', () => {
    const a = exportPatch(patch());
    expect(typeof a['ilen.h']).toBe('string');
    expect(typeof a['inst.h']).toBe('string');
    expect(typeof a['Iset.h']).toBe('string');
    expect(a['support/Iswitch.h']).toBe('#define executable\r\n');
    expect(a['Isamp.raw']).toBeInstanceOf(Uint8Array);
    expect(a['empty.mod']).toBeInstanceOf(Uint8Array);
    expect(a['empty.mod'].length).toBe(2108);
    expect(a['inst.h']).toContain('v1 = osc_saw(0, 1000, 64);\r\n');
  });

  it('writeArtifacts writes every file (incl. the support/ subdir)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sizelab-'));
    writeArtifacts(exportPatch(patch()), dir);
    for (const f of ['ilen.h', 'inst.h', 'Iset.h', 'support/Iswitch.h', 'Isamp.raw', 'empty.mod']) {
      expect(existsSync(join(dir, f)), f).toBe(true);
    }
    expect(readFileSync(join(dir, 'Iset.h'), 'utf8')).toContain('#define numinstruments 1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd funklang && npx vitest run sizelab/exporter/export-patch.test.ts`
Expected: FAIL — cannot resolve `./export-patch`.

- [ ] **Step 3: Write the implementations**

```typescript
// funklang/sizelab/exporter/export-patch.ts
import type { Patch } from '../../src/patch/types';
import { emitIlen } from './emit-ilen';
import { emitInst } from './emit-inst';
import { emitIset, emitIswitch } from './emit-iset';
import { emitIsamp } from './emit-isamp';
import { minimalMod } from './minimal-mod';
import { patchMod } from './emit-mod';

export interface ExportedArtifacts {
  'ilen.h': string;
  'inst.h': string;
  'Iset.h': string;
  'support/Iswitch.h': string;
  'Isamp.raw': Uint8Array;
  'empty.mod': Uint8Array;
}

export function exportPatch(patch: Patch): ExportedArtifacts {
  return {
    'ilen.h': emitIlen(patch),
    'inst.h': emitInst(patch),
    'Iset.h': emitIset(patch),
    'support/Iswitch.h': emitIswitch(),
    'Isamp.raw': emitIsamp(patch),
    'empty.mod': patchMod(minimalMod(), patch),
  };
}
```

```typescript
// funklang/sizelab/exporter/write-artifacts.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ExportedArtifacts } from './export-patch';

export function writeArtifacts(artifacts: ExportedArtifacts, dir: string): void {
  for (const [name, content] of Object.entries(artifacts)) {
    const target = join(dir, name);
    mkdirSync(dirname(target), { recursive: true });
    if (typeof content === 'string') writeFileSync(target, content, 'latin1');
    else writeFileSync(target, content);
  }
}
```

> `latin1` matches the GUI's single-byte text output (no BOM, `\r\n` preserved).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd funklang && npx vitest run sizelab/exporter/export-patch.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add funklang/sizelab/exporter/export-patch.ts funklang/sizelab/exporter/write-artifacts.ts funklang/sizelab/exporter/export-patch.test.ts
git commit -m "feat(sizelab): exportPatch orchestrator + disk writer"
```

---

## Task 13: verification-patch generator (P01–P07)

**Files:**
- Create: `funklang/sizelab/tools/gen-verification-patches.ts`
- Modify: `funklang/package.json` (add `gen-verification-patches` script)

Writes the P01–P07 `.akp` files (via `serializeAkp`, `src/fileio/akp.ts:156`) plus `minimal.mod` into `funklang/sizelab/fixtures/`, for the manual GUI capture. Each patch matches the spec's P01–P07 table.

- [ ] **Step 1: Add the npm script**

In `funklang/package.json` scripts: `"gen-verification-patches": "tsx sizelab/tools/gen-verification-patches.ts",`

- [ ] **Step 2: Write the generator**

```typescript
// funklang/sizelab/tools/gen-verification-patches.ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import type { Patch, Slot } from '../../src/patch/types';
import { serializeAkp } from '../../src/fileio/akp';
import { minimalMod } from '../exporter/minimal-mod';

const OUT = join(import.meta.dirname, '..', 'fixtures');

function ins(p: Patch, k: number, sampleLength: number, slots: Array<Partial<Slot>>, name = `i${k}`) {
  const I = p.instruments[k]!;
  I.name = name; I.sampleLength = sampleLength;
  I.slots = Array.from({ length: 16 }, () => ({ ...emptySlot() }));
  slots.forEach((s, i) => { I.slots[i] = { ...emptySlot(), ...s }; });
}

function P01(): Patch { const p = emptyPatch(); ins(p, 0, 5000, [{ fn: 2, outVar: 1, freqVal: 1000, gainVal: 64 }]); return p; }

function P02(): Patch {
  // each regular op once, one per instrument, params literal. Skip 17/20/22/23/24 (special/skip) here.
  const p = emptyPatch();
  const regular = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,18,19,21];
  regular.forEach((fn, k) => {
    // ops needing a val1 variable get a prior v1 producer in slot 0, op in slot 1.
    ins(p, k, 6000, [
      { fn: 2, outVar: 1, freqVal: 500, gainVal: 40 },
      { fn, outVar: 1, val1: 1, freqVal: 300, gainVal: 50, widthVal: 20, val2: 0, val2Value: 7 },
    ], `op${fn}`);
  });
  return p;
}

function P03(): Patch {
  const p = emptyPatch();
  ins(p, 0, 6000, [
    { fn: 2, outVar: 1, freq: 0, freqVal: 700, gain: 0, gainVal: 33 },  // all literal
    { fn: 2, outVar: 2, freq: 1, freqVal: 700, gain: 1, gainVal: 33 },  // freq/gain → v1
    { fn: 5, outVar: 3, width: 2, widthVal: 9, freqVal: 100, gainVal: 12 }, // width → v2
  ], 'modes');
  return p;
}

function P04(): Patch {
  const p = emptyPatch();
  ins(p, 0, 8000, [
    { fn: 2, outVar: 1, freqVal: 400, gainVal: 60 },
    { fn: 22, outVar: 0 }, // place loop_gen at slot 15 below
  ], 'loop');
  p.instruments[0]!.slots[15] = { ...emptySlot(), fn: 22 };
  p.instruments[0]!.loopOffset = 0x200; p.instruments[0]!.loopLength = 0x100;
  return p;
}

function P05(): Patch {
  const p = emptyPatch();
  ins(p, 0, 4000, [{ fn: 20, outVar: 1, gain: 0 }, { fn: 20, outVar: 2, gain: 1 }], 'imports');
  p.importedSamples[0]!.data = Int8Array.from(Array.from({ length: 64 }, (_, i) => (i % 200) - 100));
  p.importedSamples[1]!.data = Int8Array.from(Array.from({ length: 32 }, (_, i) => i - 16));
  return p;
}

function P06(): Patch {
  const p = emptyPatch();
  ins(p, 0, 5000, [{ fn: 2, outVar: 1, freqVal: 800, gainVal: 50 }], 'src');     // source
  ins(p, 1, 5000, [{ fn: 17, outVar: 1, freqVal: 50, val2Value: 3, gain: 0, gainVal: 0 }], 'clone'); // clone of instr 0
  ins(p, 2, 5000, [{ fn: 18, outVar: 1, gain: 0, freq: 1, width: 2, val1: 3, val2Value: 5 }], 'chord'); // chordgen of instr 0
  return p;
}

function P07(): Patch {
  const p = emptyPatch();
  ins(p, 0, 5000, [{ fn: 2, outVar: 1, freqVal: 400, gainVal: 60 }], 'a');
  ins(p, 1, 2, [{ fn: 2, outVar: 1, freqVal: 400, gainVal: 60 }], 'gap'); // <=2 → skipped
  ins(p, 2, 5000, [{ fn: 1, outVar: 1, val1: 1, gainVal: 20 }], 'b');
  return p;
}

const PATCHES: Record<string, Patch> = { P01: P01(), P02: P02(), P03: P03(), P04: P04(), P05: P05(), P06: P06(), P07: P07() };

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'minimal.mod'), minimalMod());
for (const [id, p] of Object.entries(PATCHES)) {
  writeFileSync(join(OUT, `${id}.akp`), serializeAkp(p));
}
console.log(`wrote minimal.mod + ${Object.keys(PATCHES).length} patches to ${OUT}`);
```

- [ ] **Step 3: Run it**

Run: `cd funklang && npm run gen-verification-patches`
Expected: writes `minimal.mod` + `P01.akp`..`P07.akp` into `sizelab/fixtures/`. Confirm with `ls funklang/sizelab/fixtures`.

- [ ] **Step 4: Sanity check round-trip**

Run a quick check that each generated `.akp` re-parses (guards against a malformed patch wasting a GUI session): `cd funklang && npx tsx -e "import('./src/fileio/akp').then(async m=>{const fs=await import('node:fs');for(const id of ['P01','P02','P03','P04','P05','P06','P07']){m.parseAkp(new Uint8Array(fs.readFileSync('sizelab/fixtures/'+id+'.akp')));console.log(id,'ok')}})"`
Expected: `P01 ok` … `P07 ok` (uses the existing `parseAkp`; if its name differs, check `src/fileio/akp.ts` exports and adjust).

- [ ] **Step 5: Commit (patches + mod are fixtures, allowed under sizelab)**

```bash
git add funklang/sizelab/tools/gen-verification-patches.ts funklang/package.json funklang/sizelab/fixtures
git commit -m "feat(sizelab): generate P01-P07 verification patches + minimal.mod"
```

> Note: the `no .akp in repo` rule covers instrument *content* patches; these are tiny synthetic test fixtures under `sizelab/fixtures/`. If you prefer them gitignored, add `sizelab/fixtures/*.akp` to `.gitignore` and regenerate on demand — but committing makes the byte-exact references reproducible. Confirm with the user at this step.

---

## Task 14: [MANUAL HANDOFF] capture GUI reference outputs

**Files:** none (human step) — produces `funklang/sizelab/fixtures/reference/<id>/{ilen.h,inst.h,Iset.h,support/Iswitch.h,Isamp.raw,empty.mod}`

- [ ] **Step 1: Stop and request the capture**

This task cannot be automated (the GUI is interactive). Report to the controller/user:

> "Verification patches are at `funklang/sizelab/fixtures/P01..P07.akp` and `minimal.mod`. Please, in the original AmigaKlangGUI: for each `P0x.akp`, load it, run the Amiga exe-export, and **when it asks for a mod file choose `minimal.mod`**. After each export, copy the six generated files from `exe_creator/` (`ilen.h`, `inst.h`, `Iset.h`, `support/Iswitch.h`, `Isamp.raw`, `empty.mod`) into `funklang/sizelab/fixtures/reference/P0x/`. The build batch may fail to compile (toolchain) — that's fine, the six source files are written before it runs."

- [ ] **Step 2: Verify captures landed**

Run: `cd funklang && ls sizelab/fixtures/reference/*/` — expect six files under each of P01..P07.

- [ ] **Step 3: Commit the references**

```bash
git add funklang/sizelab/fixtures/reference
git commit -m "test(sizelab): GUI byte-exact reference captures P01-P07"
```

---

## Task 15: byte-exact integration test vs references

**Files:**
- Create: `funklang/sizelab/exporter/byte-exact.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// funklang/sizelab/exporter/byte-exact.test.ts
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseAkp } from '../../src/fileio/akp';
import { exportPatch, type ExportedArtifacts } from './export-patch';

const FIX = join(__dirname, '..', 'fixtures');
const IDS = ['P01', 'P02', 'P03', 'P04', 'P05', 'P06', 'P07'];
const TEXT: Array<keyof ExportedArtifacts> = ['ilen.h', 'inst.h', 'Iset.h', 'support/Iswitch.h'];
const BIN: Array<keyof ExportedArtifacts> = ['Isamp.raw', 'empty.mod'];

describe('exportPatch byte-exact vs GUI references', () => {
  for (const id of IDS) {
    const refDir = join(FIX, 'reference', id);
    const akp = join(FIX, `${id}.akp`);
    const ready = existsSync(refDir) && existsSync(akp);
    it.runIf(ready)(`${id} matches GUI output`, () => {
      const patch = parseAkp(new Uint8Array(readFileSync(akp)));
      const got = exportPatch(patch);
      for (const f of TEXT) {
        const ref = readFileSync(join(refDir, f), 'latin1');
        expect(got[f], `${id}/${f}`).toBe(ref);
      }
      for (const f of BIN) {
        const ref = new Uint8Array(readFileSync(join(refDir, f)));
        expect(Array.from(got[f] as Uint8Array), `${id}/${f}`).toEqual(Array.from(ref));
      }
    });
  }
});
```

> Uses `it.runIf` so the suite stays green before captures exist; once Task 14 lands the references, these become hard assertions. If `it.runIf` is unavailable in the installed vitest, use a manual `(ready ? it : it.skip)(...)` shim.

- [ ] **Step 2: Run it**

Run: `cd funklang && npx vitest run sizelab/exporter/byte-exact.test.ts`
Expected: with references present, PASS for all P01–P07. **Any byte mismatch points at the exact file+patch** — fix the corresponding emitter (most likely an `inst.h` op case or a spacing/hex quirk) and re-run.

- [ ] **Step 3: Commit**

```bash
git add funklang/sizelab/exporter/byte-exact.test.ts
git commit -m "test(sizelab): byte-exact exporter verification vs GUI references"
```

---

## Task 16: full gate

**Files:** none (verification)

- [ ] **Step 1: Typecheck + full suite**

Run: `cd funklang && npm run typecheck && npx vitest run`
Expected: typecheck clean; all sizelab tests pass alongside the existing suite (the pre-existing `tests/dsp/perf.test.ts` may flap on timing under load — not a regression).

- [ ] **Step 2: Confirm isolation still holds**

Run: `cd funklang && npx vitest run sizelab/isolation.test.ts`
Expected: PASS (no `src/` file imports `sizelab/`).

- [ ] **Step 3: Commit any fixups**

```bash
git add -A && git commit -m "chore(sizelab): exporter gate green"
```

---

## Self-Review

**Spec coverage:**
- Six artifacts → Tasks 6 (ilen), 10/11 (inst), 7 (Iset/Iswitch), 5 (Isamp), 3+4 (minimal mod + empty.mod patch). ✓
- Byte-exact mirror (approach A) → Tasks 8–11 transcribe the codegen; Task 15 verifies. ✓
- Synthesized minimal mod, no external mod needed → Task 3; fed to GUI in Task 14. ✓
- Isolation (`src/` ↛ `sizelab/`, never bundled) → Task 1 guard + Task 16 recheck. ✓
- Verification flow (I generate patches → you GUI-export → byte-exact fixtures) → Tasks 13/14/15. ✓
- P01–P07 enumerated patches → Task 13 implements exactly that table. ✓
- Error handling (skip rules, val1==0 abort, unknown op throw) → Tasks 10 (driver skips, unknown throw) + 9 (`errIfVal1Zero`). ✓
- Out of scope (wine compile, corpus, fitter, user song) → not present. ✓

**Placeholder scan:** No "TBD"/"handle errors" placeholders. The two `>` notes (op-args helper typing fallback; fixtures gitignore choice) are explicit decisions with concrete fallbacks, not deferrals. `emitAdsr` signature change is called out in Task 11 with the exact edit.

**Type consistency:** `ExportedArtifacts` keys identical in Tasks 12 and 15. `emitInst`/`emitIlen`/`emitIset`/`emitIswitch`/`emitIsamp`/`patchMod`/`minimalMod`/`exportPatch`/`writeArtifacts`/`csHex`/`renderArgs`/`OP_ARGS`/`OPNAME`/`emitClone`/`emitImported`/`emitAdsr` names consistent across definition and call sites. `highestInstrument` defined in Task 6, reused in Task 7. `VARTEXT` defined Task 8, used Tasks 10/11. The `emitAdsr(slot,l,sampleLength)` signature is reconciled in Task 11 (caller updated to pass `ins.sampleLength`).

**Known risk:** `inst.h` byte-exactness (spacing/quirks) is the likely source of any mismatch; Task 15 localizes failures to file+patch+op so fixes are targeted. The arg-spec table (Task 9) was derived from cases 1–21; case 12 `cmb_flt_n` uses `var(val1)` with no error-abort (matches Form1 — only 11/13/15/19 abort).
