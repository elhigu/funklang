# funklang Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the funklang web-based AmigaKlang editor end-to-end per the design at `funklang/docs/superpowers/specs/2026-05-24-klang-web-editor-design.md`.

**Architecture:** Single-page browser app (TypeScript + Vite), five modules (File I/O, Patch model, DSP engine, Audio player, UI) communicating via a one-way data flow. DSP is a bit-exact JS port of Klang's `synthnodes.h`, validated at test time against a small C harness (`tools/refrender`) that links the original C source. No backend, no UI framework — vanilla TS with a tiny reactive helper to keep the bundle minimal.

**Tech Stack:** TypeScript 5.x ESM • Vite 5.x (dev + build) • Vitest 1.x (unit) • Playwright 1.x (E2E) • Web Audio API • File System Access API (with `<input type=file>` + download fallback) • gcc/clang (C reference harness) • Node 20 LTS or newer.

**Test fixture:** `loctro5 3 chippisamplea.akp` (in repo root) is the canonical smoke-test patch. All round-trip / bit-exact / playback verifications include this file.

---

## Phase 0 — Repo and environment setup

### Task 0.1: Initialize git and ignore the upstream artifacts

**Files:**
- Create: `.gitignore`

- [ ] **Step 1:** Initialize git at the repo root and add a `.gitignore` that excludes the original AmigaKlang artifacts (we never want to commit the .exe, prefix, patches binaries, etc.) plus node + build dirs:

```bash
cd /home/elhigu/projects/AMIGA/AmigaKlangGUI_V1-00
git init -b main
```

Create `.gitignore`:

```
# original AmigaKlang artifacts (read-only black box, not ours to commit)
/AmigaKlangGUI.exe
/AmigaKlangGUI.exe.bak
/NAudio.dll
/*.cur
/*.akp
/exe_creator/
/intro_coder_notes/
/patches/
/songs/
/readme.nfo
/.vs/
/wineprefix/
/run.sh

# build / install
node_modules/
dist/
**/*.tsbuildinfo

# editor / OS
.vscode/
.DS_Store
```

- [ ] **Step 2:** First commit — only the new funklang/ tree (spec + mockup) goes in:

```bash
git add .gitignore funklang/
git status
git commit -m "chore: initial commit (funklang spec + mockup)"
```

Expected: `git status` shows nothing about `AmigaKlangGUI.exe`, `patches/`, etc.; commit succeeds.

---

### Task 0.2: Verify Node/npm available

- [ ] **Step 1:** Verify Node ≥ 20 and npm:

```bash
node --version    # expect v20.x or higher
npm --version     # expect 10.x or higher
```

If not present, abort and tell the user to install Node 20 LTS. Do not proceed.

- [ ] **Step 2:** Verify a C compiler is available (needed later for `refrender`):

```bash
gcc --version
```

Expect output starting with `gcc`. If missing, abort and tell the user.

---

### Task 0.3: Scaffold the TypeScript + Vite + Vitest project

**Files:**
- Create: `funklang/package.json`
- Create: `funklang/tsconfig.json`
- Create: `funklang/vite.config.ts`
- Create: `funklang/index.html` (entry HTML — will be filled in later)
- Create: `funklang/src/main.ts` (stub)

- [ ] **Step 1:** Create the package and install deps:

```bash
cd funklang
npm init -y
npm pkg set type=module
npm pkg set scripts.dev='vite'
npm pkg set scripts.build='vite build'
npm pkg set scripts.preview='vite preview'
npm pkg set scripts.test='vitest run'
npm pkg set scripts.'test:watch'='vitest'
npm pkg set scripts.e2e='playwright test'
npm pkg set scripts.typecheck='tsc --noEmit'
npm install --save-dev typescript@^5.6 vite@^5.4 vitest@^1.6 @types/node@^20 jsdom@^24
npm install --save-dev @playwright/test@^1.47
npx playwright install --with-deps chromium
```

- [ ] **Step 2:** Write `funklang/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vitest/globals", "node"],
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*.ts", "tests/**/*.ts", "vite.config.ts"]
}
```

- [ ] **Step 3:** Write `funklang/vite.config.ts`:

```ts
import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  build: { outDir: 'dist', target: 'es2022' },
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'node',           // most modules are pure; UI tests override per-file
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 4:** Write a minimal `funklang/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>funklang</title>
  </head>
  <body>
    <div id="app">loading…</div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 5:** Write `funklang/src/main.ts`:

```ts
document.getElementById('app')!.textContent = 'funklang scaffold ok';
```

- [ ] **Step 6:** Verify the toolchain works:

```bash
npm run typecheck                    # expect: no errors
npm run build                        # expect: dist/ written
npm run test                         # expect: "No test files found" — OK at this stage
```

- [ ] **Step 7:** Commit (the root `.gitignore` from Task 0.1 already excludes `node_modules/` and `dist/`; no need for a per-package one):

```bash
cd ..
git add funklang/package.json funklang/package-lock.json funklang/tsconfig.json \
        funklang/vite.config.ts funklang/index.html funklang/src/main.ts
git commit -m "chore(funklang): scaffold TS+Vite+Vitest+Playwright"
```

---

## Phase 1 — Format investigation

Before writing the parser, you must read the relevant slice of the decompiled C# in detail and write down the byte-level layout of `.akp` and `.aki`. The decompile is already extracted to `/tmp/form1.cs` from earlier in the project; if it is missing, regenerate:

```bash
nix-shell -p ilspycmd --run 'ilspycmd -t AmigaKlangGUI.Form1 AmigaKlangGUI.exe' > /tmp/form1.cs
```

### Task 1.1: Document the .akp byte layout

**Files:**
- Create: `funklang/docs/format-notes.md`

- [ ] **Step 1:** Read the `.akp` load loop in the decompile to confirm field order and types:

```bash
grep -n -A60 'akp (\*\.akp)' /tmp/form1.cs | head -100
```

You will see the load loop reading: `magic (Int32) → for each of 31 instruments: name (length-prefixed string), samplelength (Int32), for each of 20 slots: ... → for each of 9 imported samples: length (Int32) + data (Int8 × length)`. Capture the EXACT order of slot fields by reading lines around 4619 in `/tmp/form1.cs` (the BinaryReader sequence).

Also re-read the save loop to confirm symmetry — look for `BinaryWriter` calls around line 4419 and 4523.

- [ ] **Step 2:** Write `funklang/docs/format-notes.md` documenting what you found. Include:

```markdown
# .akp / .aki on-disk format

(Captured by reading the BinaryReader/BinaryWriter calls in the decompiled
AmigaKlangGUI.Form1 — see /tmp/form1.cs.)

## Magic numbers
- .akp = 0x02CEDA9F (47110815)
- .aki = 0x02CEDA9F + 1 (47110816)

## .akp file layout
[ Int32 magic = 0x02CEDA9F                                          ]
[ for i in 0..30 (31 instruments):                                  ]
[   <instrument record>                                             ]
[ for k in 0..8 (9 imported samples):                               ]
[   Int32 importedlength[k]                                         ]
[   Int8[importedlength[k]] sample data                             ]

## Instrument record
[ <name>  — TODO: capture how the name is encoded (length-prefix? null-term?) ]
[ Int32 samplelength[i]                                             ]
[ for j in 0..19 (20 slots):                                        ]
[   Int32  arrayvar[i,j]                                            ]
[   Int32  arrayfunction[i,j]                                       ]
[   Int16  arrayfrequency[i,j]                                      ]
[   Int16  arrayfrequencyval[i,j]                                   ]
[   Int16  arrayval1[i,j]                                           ]
[   Int16  arrayval1value[i,j]                                      ]
[   Int16  arrayval2[i,j]                                           ]
[   Int16  arrayval2value[i,j]                                      ]
[   <verify: arraygain/arraygainval (UByte pair) — needed by clone op> ]
[   <verify: arraywidth/arraywidthval, arrayinstance — may or may not be on disk> ]
[ Int32 loopoffset[i]                                               ]
[ Int32 looplength[i]                                               ]
```

If the decompile shows clone source-instrument stored in `arraygain`, then `arraygain`/`arraygainval` MUST appear in the disk format (otherwise clone slots couldn't be persisted). Confirm by grepping for `arraygain` in the load-loop block.

- [ ] **Step 3:** Commit:

```bash
git add funklang/docs/format-notes.md
git commit -m "docs(funklang): document .akp/.aki byte layout from decompile"
```

---

### Task 1.2: Smoke-test format understanding against loctro5

**Files:**
- Create: `funklang/tools/inspect-akp.mjs` (a temporary throwaway probe; will be deleted at end of Phase 1)

- [ ] **Step 1:** Write a tiny Node script that reads the loctro5 file and prints the magic + first instrument's samplelength + first slot's outVar + fn, to verify the layout in `format-notes.md` matches reality:

```js
// funklang/tools/inspect-akp.mjs
import { readFileSync } from 'node:fs';
const buf = readFileSync(process.argv[2]);
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
let off = 0;
const u32 = () => { const v = dv.getUint32(off, true); off += 4; return v; };
const i32 = () => { const v = dv.getInt32(off, true); off += 4; return v; };
const i16 = () => { const v = dv.getInt16(off, true); off += 2; return v; };
const u8  = () => { const v = dv.getUint8(off);       off += 1; return v; };
// BinaryWriter.Write(string) is length-prefixed with a 7-bit-encoded length byte(s)
const str = () => {
  let len = 0, shift = 0, b;
  do { b = u8(); len |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
  const s = new TextDecoder().decode(new Uint8Array(buf.buffer, buf.byteOffset + off, len));
  off += len; return s;
};
console.log('magic:', '0x' + u32().toString(16));
for (let i = 0; i < 3; i++) {
  console.log(`--- instrument ${i} ---`);
  console.log('  name:', JSON.stringify(str()));
  console.log('  samplelength:', i32());
  for (let j = 0; j < 2; j++) {
    console.log(`  slot ${j}: outVar=${i32()} fn=${i32()} freq=${i16()} freqVal=${i16()} val1=${i16()} val1Val=${i16()} val2=${i16()} val2Val=${i16()}`);
  }
  // skip rest to keep output short
  off += 18 * 8 * 2; // 18 remaining slots × 8 fields × 2 bytes-avg ... approximate
  console.log('  …(skipped remaining slots)…');
  console.log('  loopoffset:', i32());
  console.log('  looplength:', i32());
}
```

- [ ] **Step 2:** Run against loctro5:

```bash
node funklang/tools/inspect-akp.mjs "loctro5 3 chippisamplea.akp"
```

Expected: `magic: 0x2ceda9f`, the first instrument's name printed sensibly (e.g. "saw saw"), reasonable Int32 sample lengths (a few thousand), Int16 slot field values in plausible ranges.

If the slot field math is off (you see garbage values), the field order or types in `format-notes.md` are wrong. Re-read the decompile and update. **Do not proceed to Phase 2 until inspect-akp produces sensible output.**

- [ ] **Step 3:** Now adjust `format-notes.md` if you discovered missing fields (most likely you'll need to add `arraygain`/`arraygainval` as a UByte pair somewhere in the slot field order). Commit the updated notes:

```bash
git add funklang/docs/format-notes.md
git commit -m "docs(funklang): correct .akp slot field layout from loctro5 probe"
```

- [ ] **Step 4:** Delete the throwaway probe:

```bash
rm funklang/tools/inspect-akp.mjs
git add funklang/tools/
git commit -m "chore(funklang): remove .akp inspection probe"
```

---

## Phase 2 — Patch model (types + event bus + mutators)

### Task 2.1: Type definitions

**Files:**
- Create: `funklang/src/patch/types.ts`

- [ ] **Step 1:** Write the types from the spec, **plus any fields you confirmed in Phase 1**:

```ts
// funklang/src/patch/types.ts

export const AKP_MAGIC = 0x02CEDA9F as const;
export const AKI_MAGIC = (AKP_MAGIC + 1) as const;

export const N_INSTRUMENTS = 31;
export const N_SLOTS_MAX   = 20;
export const N_IMPORTS     = 9;

export type VarRef = 0 | 1 | 2 | 3 | 4;   // 0 = unused, 1..4 = v1..v4

export interface Slot {
  outVar:    VarRef;
  fn:        number;     // index into op table
  freq:      number;     // Int16 — source-type
  freqVal:   number;     // Int16 — literal value
  gain:      number;     // UByte — source-type (also: clone source instrument index)
  gainVal:   number;     // UByte — literal value (also: clone reverse flag)
  val1:      number;     // Int16 — source-type
  val1Value: number;     // Int16 — literal value
  val2:      number;     // Int16 — source-type
  val2Value: number;     // Int16 — literal value (also: clone offset)
}

export interface Instrument {
  name:         string;
  sampleLength: number;     // Int32
  loopOffset:   number;     // Int32
  loopLength:   number;     // Int32
  slots:        Slot[];     // length 0..20
}

export interface ImportedSample {
  data: Int8Array;          // length = data.length serialized as Int32
}

export interface Patch {
  instruments:     Instrument[];     // length === N_INSTRUMENTS
  importedSamples: ImportedSample[]; // length === N_IMPORTS
}

export function emptySlot(): Slot {
  return { outVar: 0, fn: 0, freq: 0, freqVal: 0, gain: 0, gainVal: 0,
           val1: 0, val1Value: 0, val2: 0, val2Value: 0 };
}

export function emptyInstrument(name = ''): Instrument {
  return { name, sampleLength: 0, loopOffset: 0, loopLength: 0, slots: [] };
}

export function emptyPatch(): Patch {
  return {
    instruments: Array.from({ length: N_INSTRUMENTS }, () => emptyInstrument()),
    importedSamples: Array.from({ length: N_IMPORTS }, () => ({ data: new Int8Array(0) })),
  };
}
```

- [ ] **Step 2:** Typecheck:

```bash
cd funklang && npm run typecheck && cd ..
```

Expect: clean.

- [ ] **Step 3:** Commit:

```bash
git add funklang/src/patch/types.ts
git commit -m "feat(funklang): patch type definitions and empty constructors"
```

---

### Task 2.2: Event bus

**Files:**
- Create: `funklang/src/patch/events.ts`
- Create: `funklang/tests/patch/events.test.ts`

- [ ] **Step 1:** Write the test first:

```ts
// funklang/tests/patch/events.test.ts
import { describe, it, expect, vi } from 'vitest';
import { EventBus, type PatchChange } from '../../src/patch/events.ts';

describe('EventBus', () => {
  it('delivers events to subscribers', () => {
    const bus = new EventBus<PatchChange>();
    const a = vi.fn(); const b = vi.fn();
    bus.on(a); bus.on(b);
    bus.emit({ instrIdx: 3, kind: 'param' });
    expect(a).toHaveBeenCalledWith({ instrIdx: 3, kind: 'param' });
    expect(b).toHaveBeenCalledWith({ instrIdx: 3, kind: 'param' });
  });
  it('unsubscribes via returned disposer', () => {
    const bus = new EventBus<PatchChange>();
    const a = vi.fn();
    const off = bus.on(a);
    off();
    bus.emit({ instrIdx: 0, kind: 'meta' });
    expect(a).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2:** Run, expect FAIL (module not found):

```bash
cd funklang && npx vitest run tests/patch/events.test.ts ; cd ..
```

Expected: Vitest reports the test file failed to load because `events.ts` does not exist.

- [ ] **Step 3:** Implement:

```ts
// funklang/src/patch/events.ts
export type PatchChange =
  | { instrIdx: number; kind: 'param' }
  | { instrIdx: number; kind: 'structure' }   // slot added/removed/moved
  | { instrIdx: number; kind: 'meta' };       // name, sampleLength, loop fields

export class EventBus<T> {
  private listeners = new Set<(e: T) => void>();
  on(fn: (e: T) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  emit(e: T): void {
    for (const fn of this.listeners) fn(e);
  }
}
```

- [ ] **Step 4:** Run, expect PASS:

```bash
cd funklang && npx vitest run tests/patch/events.test.ts ; cd ..
```

- [ ] **Step 5:** Commit:

```bash
git add funklang/src/patch/events.ts funklang/tests/patch/events.test.ts
git commit -m "feat(funklang): event bus for patch changes"
```

---

### Task 2.3: Patch model with mutators

**Files:**
- Create: `funklang/src/patch/model.ts`
- Create: `funklang/tests/patch/model.test.ts`

- [ ] **Step 1:** Write the test:

```ts
// funklang/tests/patch/model.test.ts
import { describe, it, expect, vi } from 'vitest';
import { PatchModel } from '../../src/patch/model.ts';
import { emptyPatch, emptySlot } from '../../src/patch/types.ts';

describe('PatchModel', () => {
  it('setSlotParam emits a param change for the affected instrument', () => {
    const m = new PatchModel(emptyPatch());
    m.insertSlot(2, 0, emptySlot());
    const cb = vi.fn();
    m.events.on(cb);
    m.setSlotParam(2, 0, 'gainVal', 99);
    expect(m.patch.instruments[2]!.slots[0]!.gainVal).toBe(99);
    expect(cb).toHaveBeenCalledWith({ instrIdx: 2, kind: 'param' });
  });

  it('moveSlot reorders within the same instrument and emits structure change', () => {
    const m = new PatchModel(emptyPatch());
    const a = { ...emptySlot(), fn: 1 };
    const b = { ...emptySlot(), fn: 2 };
    const c = { ...emptySlot(), fn: 3 };
    m.insertSlot(0, 0, a); m.insertSlot(0, 1, b); m.insertSlot(0, 2, c);
    const cb = vi.fn();
    m.events.on(cb);
    m.moveSlot(0, 0, 2);     // a → between b and c (final order: b,a,c) ... or end? clarify
    expect(m.patch.instruments[0]!.slots.map(s => s.fn)).toEqual([2, 3, 1]);
    expect(cb).toHaveBeenCalledWith({ instrIdx: 0, kind: 'structure' });
  });

  it('insertSlot beyond N_SLOTS_MAX throws', () => {
    const m = new PatchModel(emptyPatch());
    for (let i = 0; i < 20; i++) m.insertSlot(0, i, emptySlot());
    expect(() => m.insertSlot(0, 20, emptySlot())).toThrow(/20.?slot/i);
  });

  it('setInstrumentField emits meta change', () => {
    const m = new PatchModel(emptyPatch());
    const cb = vi.fn();
    m.events.on(cb);
    m.setInstrumentField(0, 'name', 'kick');
    expect(m.patch.instruments[0]!.name).toBe('kick');
    expect(cb).toHaveBeenCalledWith({ instrIdx: 0, kind: 'meta' });
  });
});
```

`moveSlot(0, 0, 2)` semantics: removes element at index 0, then inserts at the **destination index in the post-removal array**. So with `[a,b,c]`, remove `a` → `[b,c]`, insert at 2 → `[b,c,a]`. The test expects `[2,3,1]` = `[b,c,a]` — consistent.

- [ ] **Step 2:** Run, expect FAIL (module missing):

```bash
cd funklang && npx vitest run tests/patch/model.test.ts ; cd ..
```

- [ ] **Step 3:** Implement:

```ts
// funklang/src/patch/model.ts
import { EventBus, type PatchChange } from './events.ts';
import {
  type Patch, type Slot, type Instrument,
  N_SLOTS_MAX,
} from './types.ts';

type ParamKey = Exclude<keyof Slot, never>;
type InstrField = 'name' | 'sampleLength' | 'loopOffset' | 'loopLength';

export class PatchModel {
  readonly events = new EventBus<PatchChange>();
  constructor(public patch: Patch) {}

  private instr(i: number): Instrument {
    const v = this.patch.instruments[i];
    if (!v) throw new RangeError(`instrument index ${i} out of range`);
    return v;
  }

  setSlotParam<K extends ParamKey>(instrIdx: number, slotIdx: number, key: K, value: Slot[K]): void {
    const slot = this.instr(instrIdx).slots[slotIdx];
    if (!slot) throw new RangeError(`slot ${slotIdx} of instrument ${instrIdx} does not exist`);
    slot[key] = value;
    this.events.emit({ instrIdx, kind: 'param' });
  }

  insertSlot(instrIdx: number, at: number, slot: Slot): void {
    const ins = this.instr(instrIdx);
    if (ins.slots.length >= N_SLOTS_MAX) {
      throw new RangeError(`instrument ${instrIdx} already has ${N_SLOTS_MAX} slots`);
    }
    const idx = Math.max(0, Math.min(at, ins.slots.length));
    ins.slots.splice(idx, 0, slot);
    this.events.emit({ instrIdx, kind: 'structure' });
  }

  removeSlot(instrIdx: number, at: number): void {
    const ins = this.instr(instrIdx);
    if (at < 0 || at >= ins.slots.length) return;
    ins.slots.splice(at, 1);
    this.events.emit({ instrIdx, kind: 'structure' });
  }

  moveSlot(instrIdx: number, from: number, to: number): void {
    const ins = this.instr(instrIdx);
    if (from < 0 || from >= ins.slots.length) return;
    const [moved] = ins.slots.splice(from, 1);
    const idx = Math.max(0, Math.min(to, ins.slots.length));
    ins.slots.splice(idx, 0, moved!);
    this.events.emit({ instrIdx, kind: 'structure' });
  }

  setInstrumentField<K extends InstrField>(instrIdx: number, key: K, value: Instrument[K]): void {
    const ins = this.instr(instrIdx);
    ins[key] = value;
    this.events.emit({ instrIdx, kind: 'meta' });
  }
}
```

- [ ] **Step 4:** Run, expect PASS:

```bash
cd funklang && npx vitest run tests/patch/model.test.ts ; cd ..
```

- [ ] **Step 5:** Commit:

```bash
git add funklang/src/patch/model.ts funklang/tests/patch/model.test.ts
git commit -m "feat(funklang): patch model with mutators and change events"
```

---

## Phase 3 — File I/O (parser + serializer + round-trip)

### Task 3.1: BinaryReader / BinaryWriter helpers

**Files:**
- Create: `funklang/src/fileio/binio.ts`
- Create: `funklang/tests/fileio/binio.test.ts`

- [ ] **Step 1:** Write tests:

```ts
// funklang/tests/fileio/binio.test.ts
import { describe, it, expect } from 'vitest';
import { BinReader, BinWriter } from '../../src/fileio/binio.ts';

describe('BinReader/BinWriter', () => {
  it('round-trips Int32 LE', () => {
    const w = new BinWriter(); w.i32(-12345); w.i32(0x7fffffff);
    const r = new BinReader(w.toUint8());
    expect(r.i32()).toBe(-12345);
    expect(r.i32()).toBe(0x7fffffff);
  });
  it('round-trips Int16 LE', () => {
    const w = new BinWriter(); w.i16(-1); w.i16(32767);
    const r = new BinReader(w.toUint8());
    expect(r.i16()).toBe(-1);
    expect(r.i16()).toBe(32767);
  });
  it('round-trips UByte', () => {
    const w = new BinWriter(); w.u8(0); w.u8(255);
    const r = new BinReader(w.toUint8());
    expect(r.u8()).toBe(0);
    expect(r.u8()).toBe(255);
  });
  it('round-trips C# BinaryWriter length-prefixed string', () => {
    const w = new BinWriter(); w.cstr('hello');
    const r = new BinReader(w.toUint8());
    expect(r.cstr()).toBe('hello');
  });
  it('handles strings >127 bytes (multi-byte 7-bit length prefix)', () => {
    const s = 'x'.repeat(200);
    const w = new BinWriter(); w.cstr(s);
    const r = new BinReader(w.toUint8());
    expect(r.cstr()).toBe(s);
  });
  it('throws with byte offset on truncated input', () => {
    const r = new BinReader(new Uint8Array([1, 2]));
    expect(() => r.i32()).toThrow(/offset 0/);
  });
});
```

- [ ] **Step 2:** Run, expect FAIL:

```bash
cd funklang && npx vitest run tests/fileio/binio.test.ts ; cd ..
```

- [ ] **Step 3:** Implement:

```ts
// funklang/src/fileio/binio.ts

export class BinReader {
  private dv: DataView;
  private td = new TextDecoder('utf-8', { fatal: true });
  off = 0;
  constructor(public bytes: Uint8Array) {
    this.dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  private need(n: number): void {
    if (this.off + n > this.bytes.length) {
      throw new RangeError(`unexpected EOF: needed ${n} bytes at offset ${this.off}`);
    }
  }
  u8 (): number { this.need(1); const v = this.dv.getUint8(this.off);            this.off += 1; return v; }
  i8 (): number { this.need(1); const v = this.dv.getInt8 (this.off);            this.off += 1; return v; }
  i16(): number { this.need(2); const v = this.dv.getInt16(this.off, true);      this.off += 2; return v; }
  u16(): number { this.need(2); const v = this.dv.getUint16(this.off, true);     this.off += 2; return v; }
  i32(): number { this.need(4); const v = this.dv.getInt32(this.off, true);      this.off += 4; return v; }
  u32(): number { this.need(4); const v = this.dv.getUint32(this.off, true);     this.off += 4; return v; }
  bytes_(n: number): Uint8Array { this.need(n); const s = this.bytes.subarray(this.off, this.off + n); this.off += n; return s; }
  // .NET BinaryWriter string: 7-bit-encoded length prefix, then UTF-8 bytes
  cstr(): string {
    let len = 0, shift = 0;
    while (true) {
      const b = this.u8();
      len |= (b & 0x7f) << shift;
      if ((b & 0x80) === 0) break;
      shift += 7;
      if (shift > 35) throw new Error(`bad 7-bit length at offset ${this.off}`);
    }
    return this.td.decode(this.bytes_(len));
  }
}

export class BinWriter {
  private chunks: Uint8Array[] = [];
  private te = new TextEncoder();
  private push(buf: ArrayBuffer): void { this.chunks.push(new Uint8Array(buf)); }
  u8 (v: number): void { const b = new Uint8Array(1);  b[0] = v & 0xff; this.chunks.push(b); }
  i8 (v: number): void { const b = new Int8Array(1);   b[0] = v;        this.chunks.push(new Uint8Array(b.buffer)); }
  i16(v: number): void { const b = new ArrayBuffer(2); new DataView(b).setInt16(0, v, true); this.push(b); }
  u16(v: number): void { const b = new ArrayBuffer(2); new DataView(b).setUint16(0, v, true); this.push(b); }
  i32(v: number): void { const b = new ArrayBuffer(4); new DataView(b).setInt32(0, v, true); this.push(b); }
  u32(v: number): void { const b = new ArrayBuffer(4); new DataView(b).setUint32(0, v, true); this.push(b); }
  bytes_(arr: Uint8Array): void { this.chunks.push(arr); }
  cstr(s: string): void {
    const utf8 = this.te.encode(s);
    let len = utf8.length;
    while (len >= 0x80) { this.u8((len & 0x7f) | 0x80); len >>>= 7; }
    this.u8(len);
    this.chunks.push(utf8);
  }
  toUint8(): Uint8Array {
    const total = this.chunks.reduce((s, c) => s + c.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const c of this.chunks) { out.set(c, off); off += c.length; }
    return out;
  }
}
```

- [ ] **Step 4:** Run, expect PASS:

```bash
cd funklang && npx vitest run tests/fileio/binio.test.ts ; cd ..
```

- [ ] **Step 5:** Commit:

```bash
git add funklang/src/fileio/binio.ts funklang/tests/fileio/binio.test.ts
git commit -m "feat(funklang): little-endian + 7-bit-string binary I/O helpers"
```

---

### Task 3.2: Parse .akp / serialize .akp

**Files:**
- Create: `funklang/src/fileio/akp.ts`
- Create: `funklang/tests/fileio/akp.test.ts`

> **Important:** The exact slot field order MUST match `funklang/docs/format-notes.md`. If your Phase-1 investigation revealed additional fields (e.g. `arraygain`/`arraygainval` UByte pair), include them in the order the decompile shows. The code below assumes the field order: `outVar(i32), fn(i32), freq(i16), freqVal(i16), gain(u8), gainVal(u8), val1(i16), val1Value(i16), val2(i16), val2Value(i16)` per the spec — adjust if Phase 1 disagrees.

- [ ] **Step 1:** Write tests that round-trip against the loctro5 file:

```ts
// funklang/tests/fileio/akp.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseAkp, serializeAkp } from '../../src/fileio/akp.ts';
import { AKP_MAGIC, N_INSTRUMENTS, N_IMPORTS } from '../../src/patch/types.ts';

const ROOT = new URL('../../..', import.meta.url).pathname;

describe('parseAkp / serializeAkp', () => {
  it('parses the loctro5 fixture', () => {
    const bytes = new Uint8Array(readFileSync(join(ROOT, 'loctro5 3 chippisamplea.akp')));
    const p = parseAkp(bytes);
    expect(p.instruments.length).toBe(N_INSTRUMENTS);
    expect(p.importedSamples.length).toBe(N_IMPORTS);
    // first instrument has a non-empty name and a non-zero sample length
    expect(p.instruments[0]!.name.length).toBeGreaterThan(0);
    expect(p.instruments[0]!.sampleLength).toBeGreaterThan(0);
  });

  it('round-trips loctro5 byte-for-byte', () => {
    const bytes = new Uint8Array(readFileSync(join(ROOT, 'loctro5 3 chippisamplea.akp')));
    const p = parseAkp(bytes);
    const out = serializeAkp(p);
    expect(out.length).toBe(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      if (out[i] !== bytes[i]) {
        throw new Error(`byte mismatch at offset 0x${i.toString(16)}: ` +
                        `got 0x${out[i]!.toString(16)} expected 0x${bytes[i]!.toString(16)}`);
      }
    }
  });

  it('round-trips every patch in patches/ byte-for-byte', () => {
    const dir = join(ROOT, 'patches');
    const files = readdirSync(dir).filter(f => f.endsWith('.akp'));
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const bytes = new Uint8Array(readFileSync(join(dir, f)));
      const p = parseAkp(bytes);
      const out = serializeAkp(p);
      expect({ file: f, len: out.length }).toEqual({ file: f, len: bytes.length });
      for (let i = 0; i < bytes.length; i++) {
        if (out[i] !== bytes[i]) {
          throw new Error(`${f}: byte mismatch at offset 0x${i.toString(16)}`);
        }
      }
    }
  });

  it('rejects wrong magic', () => {
    const bad = new Uint8Array(4); bad[0] = 1;
    expect(() => parseAkp(bad)).toThrow(/magic/i);
  });
});
```

- [ ] **Step 2:** Run, expect FAIL:

```bash
cd funklang && npx vitest run tests/fileio/akp.test.ts ; cd ..
```

- [ ] **Step 3:** Implement (adjust the slot field order if Phase 1 produced a different order):

```ts
// funklang/src/fileio/akp.ts
import { BinReader, BinWriter } from './binio.ts';
import {
  AKP_MAGIC, N_INSTRUMENTS, N_IMPORTS, N_SLOTS_MAX,
  emptyPatch, emptySlot, emptyInstrument,
  type Patch, type Slot, type Instrument, type VarRef,
} from '../patch/types.ts';

function readSlot(r: BinReader): Slot {
  // Field order per docs/format-notes.md. ADJUST if your Phase-1 investigation
  // revealed a different order/types.
  const outVar    = r.i32() as VarRef;
  const fn        = r.i32();
  const freq      = r.i16();
  const freqVal   = r.i16();
  const gain      = r.u8();
  const gainVal   = r.u8();
  const val1      = r.i16();
  const val1Value = r.i16();
  const val2      = r.i16();
  const val2Value = r.i16();
  return { outVar, fn, freq, freqVal, gain, gainVal, val1, val1Value, val2, val2Value };
}

function writeSlot(w: BinWriter, s: Slot): void {
  w.i32(s.outVar);  w.i32(s.fn);
  w.i16(s.freq);    w.i16(s.freqVal);
  w.u8 (s.gain);    w.u8 (s.gainVal);
  w.i16(s.val1);    w.i16(s.val1Value);
  w.i16(s.val2);    w.i16(s.val2Value);
}

function isSlotEmpty(s: Slot): boolean {
  return s.outVar === 0 && s.fn === 0 && s.freq === 0 && s.freqVal === 0 &&
         s.gain === 0 && s.gainVal === 0 && s.val1 === 0 && s.val1Value === 0 &&
         s.val2 === 0 && s.val2Value === 0;
}

export function parseAkp(bytes: Uint8Array): Patch {
  const r = new BinReader(bytes);
  const magic = r.u32();
  if (magic !== AKP_MAGIC) {
    throw new Error(`bad magic 0x${magic.toString(16)} (expected 0x${AKP_MAGIC.toString(16)})`);
  }
  const p = emptyPatch();
  for (let i = 0; i < N_INSTRUMENTS; i++) {
    const name = r.cstr();
    const sampleLength = r.i32();
    const slots: Slot[] = [];
    for (let j = 0; j < N_SLOTS_MAX; j++) slots.push(readSlot(r));
    const loopOffset = r.i32();
    const loopLength = r.i32();
    // Trim trailing empty slots so the editor displays only filled ones
    while (slots.length && isSlotEmpty(slots[slots.length - 1]!)) slots.pop();
    p.instruments[i] = { name, sampleLength, loopOffset, loopLength, slots };
  }
  for (let k = 0; k < N_IMPORTS; k++) {
    const len = r.i32();
    const buf = r.bytes_(len);
    p.importedSamples[k] = { data: new Int8Array(buf.buffer, buf.byteOffset, len) };
  }
  return p;
}

export function serializeAkp(p: Patch): Uint8Array {
  const w = new BinWriter();
  w.u32(AKP_MAGIC);
  for (let i = 0; i < N_INSTRUMENTS; i++) {
    const ins = p.instruments[i] ?? emptyInstrument();
    w.cstr(ins.name);
    w.i32(ins.sampleLength);
    for (let j = 0; j < N_SLOTS_MAX; j++) {
      writeSlot(w, ins.slots[j] ?? emptySlot());
    }
    w.i32(ins.loopOffset);
    w.i32(ins.loopLength);
  }
  for (let k = 0; k < N_IMPORTS; k++) {
    const imp = p.importedSamples[k] ?? { data: new Int8Array(0) };
    w.i32(imp.data.length);
    w.bytes_(new Uint8Array(imp.data.buffer, imp.data.byteOffset, imp.data.length));
  }
  return w.toUint8();
}
```

- [ ] **Step 4:** Run, expect PASS for loctro5 and (most likely) the other patches. **If any patch fails round-trip**: open it in a hex editor (or write a one-off script) and find the first divergent byte. Update the slot field order in `readSlot`/`writeSlot` accordingly. Re-test until ALL 17 patches plus loctro5 round-trip cleanly:

```bash
cd funklang && npx vitest run tests/fileio/akp.test.ts ; cd ..
```

Do not move on until all `.akp` files in `patches/` round-trip byte-for-byte.

- [ ] **Step 5:** Commit:

```bash
git add funklang/src/fileio/akp.ts funklang/tests/fileio/akp.test.ts funklang/docs/format-notes.md
git commit -m "feat(funklang): .akp parser and serializer with byte-exact round-trip"
```

---

### Task 3.3: Parse .aki / serialize .aki

**Files:**
- Create: `funklang/src/fileio/aki.ts`
- Create: `funklang/tests/fileio/aki.test.ts`

`.aki` is a single instrument with its own magic. Use the same per-instrument layout you confirmed in Task 3.2.

- [ ] **Step 1:** Write a synth-test (no real `.aki` fixture in the project, so we construct one):

```ts
// funklang/tests/fileio/aki.test.ts
import { describe, it, expect } from 'vitest';
import { parseAki, serializeAki } from '../../src/fileio/aki.ts';
import { emptyInstrument, emptySlot } from '../../src/patch/types.ts';

describe('parseAki / serializeAki', () => {
  it('round-trips a synthetic instrument', () => {
    const ins = emptyInstrument('test kick');
    ins.sampleLength = 4096;
    ins.loopOffset = 0;
    ins.loopLength = 0;
    ins.slots.push({ ...emptySlot(), outVar: 1, fn: 4, freq: 0, freqVal: 880, gainVal: 200 });
    ins.slots.push({ ...emptySlot(), outVar: 4, fn: 1, gainVal: 128 });
    const bytes = serializeAki(ins);
    const round = parseAki(bytes);
    expect(round).toEqual(ins);
  });
  it('rejects wrong magic', () => {
    expect(() => parseAki(new Uint8Array(4))).toThrow(/magic/i);
  });
});
```

- [ ] **Step 2:** Run, expect FAIL.

- [ ] **Step 3:** Implement:

```ts
// funklang/src/fileio/aki.ts
import { BinReader, BinWriter } from './binio.ts';
import { AKI_MAGIC, N_SLOTS_MAX, emptySlot, type Instrument, type Slot, type VarRef } from '../patch/types.ts';

function readSlot(r: BinReader): Slot {
  const outVar    = r.i32() as VarRef;
  const fn        = r.i32();
  const freq      = r.i16(); const freqVal = r.i16();
  const gain      = r.u8 (); const gainVal = r.u8 ();
  const val1      = r.i16(); const val1Value = r.i16();
  const val2      = r.i16(); const val2Value = r.i16();
  return { outVar, fn, freq, freqVal, gain, gainVal, val1, val1Value, val2, val2Value };
}
function writeSlot(w: BinWriter, s: Slot): void {
  w.i32(s.outVar);  w.i32(s.fn);
  w.i16(s.freq);    w.i16(s.freqVal);
  w.u8 (s.gain);    w.u8 (s.gainVal);
  w.i16(s.val1);    w.i16(s.val1Value);
  w.i16(s.val2);    w.i16(s.val2Value);
}
function isEmpty(s: Slot): boolean {
  return s.outVar === 0 && s.fn === 0 && s.freq === 0 && s.freqVal === 0 &&
         s.gain === 0 && s.gainVal === 0 && s.val1 === 0 && s.val1Value === 0 &&
         s.val2 === 0 && s.val2Value === 0;
}

export function parseAki(bytes: Uint8Array): Instrument {
  const r = new BinReader(bytes);
  const magic = r.u32();
  if (magic !== AKI_MAGIC) throw new Error(`bad .aki magic 0x${magic.toString(16)}`);
  const name = r.cstr();
  const sampleLength = r.i32();
  const slots: Slot[] = [];
  for (let j = 0; j < N_SLOTS_MAX; j++) slots.push(readSlot(r));
  const loopOffset = r.i32();
  const loopLength = r.i32();
  while (slots.length && isEmpty(slots[slots.length - 1]!)) slots.pop();
  return { name, sampleLength, loopOffset, loopLength, slots };
}

export function serializeAki(ins: Instrument): Uint8Array {
  const w = new BinWriter();
  w.u32(AKI_MAGIC);
  w.cstr(ins.name);
  w.i32(ins.sampleLength);
  for (let j = 0; j < N_SLOTS_MAX; j++) writeSlot(w, ins.slots[j] ?? emptySlot());
  w.i32(ins.loopOffset);
  w.i32(ins.loopLength);
  return w.toUint8();
}
```

- [ ] **Step 4:** Run, expect PASS:

```bash
cd funklang && npx vitest run tests/fileio/aki.test.ts ; cd ..
```

- [ ] **Step 5:** Commit:

```bash
git add funklang/src/fileio/aki.ts funklang/tests/fileio/aki.test.ts
git commit -m "feat(funklang): .aki single-instrument parser and serializer"
```

---

## Phase 4 — Reference C render harness

The C harness lets the bit-exact tests compute their expected output from Klang's own source rather than from checked-in golden files. Lives under `funklang/tools/refrender/`.

### Task 4.1: Understand the Klang render driver

**Files:** (none yet — investigation step)

- [ ] **Step 1:** Read `exe_creator/synthnodes.h`, `exe_creator/main-binary.c`, and `exe_creator/main-executable.c`. Identify:
  - The per-op function signatures (`osc_saw`, `osc_tri`, `osc_sine`, `osc_pulse`, `osc_noise`, `vol`, `enva`, `envd`, `adsr`, `add`, `mul`, `sh`, `distortion`, `onepole_flt`, `sv_flt_n`, `cmb_flt_n`, `reverb`, `dly_cyc`, `ctrl`, `chordgen`, `vocoder`, and the clone / imported-sample ops).
  - Any per-op state arrays (`counter_saw[]`, `counter_sine[]`, etc.).
  - The driver loop that walks slots 0..19 of an instrument and writes a sample per tick.
  - Where the imported sample data plugs in.
  - Where the clone op resolves its source-instrument sample (this might be done at the AmigaKlang2asm codegen step rather than synth time; if so, the harness must emulate it).

```bash
wc -l exe_creator/synthnodes.h exe_creator/main-binary.c exe_creator/main-executable.c
head -200 exe_creator/main-binary.c
```

Capture the relevant function names and the driver loop pseudocode in `funklang/docs/dsp-reference.md`:

- [ ] **Step 2:** Write `funklang/docs/dsp-reference.md`:

```markdown
# Klang DSP reference (from synthnodes.h + main-*.c)

## Op signatures (from synthnodes.h)
- short osc_saw  (BYTE instance, short freq, UBYTE gain)
- short osc_tri  (BYTE instance, short freq, UBYTE gain)
- short osc_sine (BYTE instance, short freq, UBYTE gain)
- short osc_pulse(BYTE instance, short freq, UBYTE gain, UBYTE dutycycle)
- short osc_noise(int sample, UBYTE gain)
- short vol      (short val, UBYTE gain)
- short distortion(int val, UBYTE gain)
- short sh       (BYTE instance, short val1, UBYTE step)
- … (fill in the remaining ops you found)

## Per-op state arrays
- counter_saw[…], counter_tri[…], counter_sine[…], counter_pulse[…], counter_sh[…], buffer_sh[…], …

## Driver loop (paraphrase from main-binary.c / main-executable.c)
For each instrument i in 0..30:
  For each sample t in 0..sampleLength[i]-1:
    initialize variable[1..4] = 0
    For each slot j in 0..19:
      dispatch on arrayfunction[i,j]:
        ...
    write final variable[<configured output>] as int16 sample
```

- [ ] **Step 3:** Commit:

```bash
git add funklang/docs/dsp-reference.md
git commit -m "docs(funklang): capture Klang DSP reference signatures and driver"
```

---

### Task 4.2: refrender C harness

**Files:**
- Create: `funklang/tools/refrender/refrender.c`
- Create: `funklang/tools/refrender/Makefile`

- [ ] **Step 1:** Write the harness. It takes a `.akp` path and an instrument index on the command line and writes raw little-endian Int16 samples to stdout. It MUST link to `exe_creator/synthnodes.h` so that any future fix to the upstream synth is automatically reflected:

```c
// funklang/tools/refrender/refrender.c
// Usage: refrender <patch.akp> <instrument-index>
// Writes Int16 LE samples to stdout, no header.

#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>

typedef int8_t   BYTE;
typedef uint8_t  UBYTE;

// REQUIRED: synthnodes.h needs these symbols as globals
static int    counter_saw   [32];
static int    counter_tri   [32];
static int    counter_sine  [32];
static int    counter_pulse [32];
static int    counter_sh    [32];
static short  buffer_sh     [32];
// … add additional per-op state arrays the included file references …

static int mulsw(int a, int b) { return a * b; }      // wide mul — verify upstream definition

#include "../../../exe_creator/synthnodes.h"

// Minimal .akp loader — must match funklang/docs/format-notes.md
typedef struct {
  int16_t outVar, fn;
  int16_t freq, freqVal;
  uint8_t gain, gainVal;
  int16_t val1, val1Value;
  int16_t val2, val2Value;
} Slot;
typedef struct {
  char    name[256];
  int32_t sampleLength;
  Slot    slots[20];
  int32_t loopOffset, loopLength;
} Instr;

static uint32_t rd_u32(FILE* f) { uint32_t v; fread(&v, 4, 1, f); return v; }
static int32_t  rd_i32(FILE* f) { int32_t v; fread(&v, 4, 1, f); return v; }
static int16_t  rd_i16(FILE* f) { int16_t v; fread(&v, 2, 1, f); return v; }
static uint8_t  rd_u8 (FILE* f) { uint8_t v; fread(&v, 1, 1, f); return v; }
static void rd_cstr(FILE* f, char* out, size_t cap) {
  int len = 0, shift = 0, b;
  do { b = rd_u8(f); len |= (b & 0x7f) << shift; shift += 7; } while (b & 0x80);
  fread(out, 1, len, f); out[len < (int)cap ? len : (int)cap - 1] = 0;
}

int main(int argc, char** argv) {
  if (argc != 3) { fprintf(stderr, "usage: %s <patch.akp> <instr-index>\n", argv[0]); return 2; }
  FILE* f = fopen(argv[1], "rb");
  if (!f) { perror(argv[1]); return 1; }
  int wantIdx = atoi(argv[2]);
  if (rd_u32(f) != 0x02CEDA9Fu) { fprintf(stderr, "bad magic\n"); return 1; }

  Instr instrs[31];
  for (int i = 0; i < 31; i++) {
    rd_cstr(f, instrs[i].name, sizeof(instrs[i].name));
    instrs[i].sampleLength = rd_i32(f);
    for (int j = 0; j < 20; j++) {
      Slot* s = &instrs[i].slots[j];
      s->outVar = rd_i32(f); s->fn = rd_i32(f);
      s->freq = rd_i16(f); s->freqVal = rd_i16(f);
      s->gain = rd_u8 (f); s->gainVal = rd_u8 (f);
      s->val1 = rd_i16(f); s->val1Value = rd_i16(f);
      s->val2 = rd_i16(f); s->val2Value = rd_i16(f);
    }
    instrs[i].loopOffset = rd_i32(f);
    instrs[i].loopLength = rd_i32(f);
  }
  // imported samples: 9 length-prefixed blobs — read but discard for now
  for (int k = 0; k < 9; k++) { int32_t L = rd_i32(f); fseek(f, L, SEEK_CUR); }
  fclose(f);

  if (wantIdx < 0 || wantIdx >= 31) { fprintf(stderr, "bad instr index\n"); return 1; }
  Instr* ins = &instrs[wantIdx];

  // Driver loop — paraphrase from main-binary.c. The exact mapping of
  // arrayfunction codes to op calls must match what you captured in
  // funklang/docs/dsp-reference.md.
  short variable[5] = {0};
  int   smp = ins->sampleLength;
  for (int t = 0; t < smp; t++) {
    variable[1] = variable[2] = variable[3] = variable[4] = 0;
    for (int j = 0; j < 20; j++) {
      Slot* s = &ins->slots[j];
      if (s->fn == 0 || s->outVar == 0) continue;
      short out = 0;
      switch (s->fn) {
        // numeric codes match arrayfunctiontext indices in Form1:
        case  1: out = vol     (variable[s->val1], s->gainVal); break;
        case  2: out = osc_saw (j, s->freqVal, s->gainVal);     break;
        case  3: out = osc_tri (j, s->freqVal, s->gainVal);     break;
        case  4: out = osc_sine(j, s->freqVal, s->gainVal);     break;
        case  5: out = osc_pulse(j, s->freqVal, s->gainVal, s->val1Value); break;
        case  6: out = osc_noise(t, s->gainVal);                break;
        // … add all remaining op dispatches per dsp-reference.md …
        default: out = 0; break;
      }
      variable[s->outVar] = out;
    }
    // final output = the variable referenced by the LAST non-empty slot's outVar
    short final = 0;
    for (int j = 19; j >= 0; j--) if (ins->slots[j].fn != 0) { final = variable[ins->slots[j].outVar]; break; }
    fwrite(&final, 2, 1, stdout);
  }
  return 0;
}
```

> **Note for the implementer:** the `case` dispatch above is intentionally incomplete. You will fill in each op as you port it to JS (one task per op in Phase 5). The harness MUST cover every op before Phase 6's integration test passes.

- [ ] **Step 2:** Write the Makefile:

```makefile
# funklang/tools/refrender/Makefile
CC      ?= gcc
CFLAGS  ?= -O2 -std=c11 -Wall -Wno-unused-function -Wno-unused-variable
TARGET  := refrender

$(TARGET): refrender.c ../../../exe_creator/synthnodes.h
	$(CC) $(CFLAGS) -o $@ refrender.c

clean:
	rm -f $(TARGET)

.PHONY: clean
```

- [ ] **Step 3:** Try to build. If it fails, fix the missing globals / function signatures in `refrender.c` (e.g. add more `counter_*` arrays, declare any helpers `synthnodes.h` expects):

```bash
make -C funklang/tools/refrender
```

Iterate until it compiles. Expect: an executable at `funklang/tools/refrender/refrender`.

- [ ] **Step 4:** Smoke-run against loctro5:

```bash
funklang/tools/refrender/refrender "loctro5 3 chippisamplea.akp" 0 | wc -c
```

Expect: a non-zero byte count equal to `2 × sampleLength[0]`. The output will likely contain wrong samples for ops you haven't dispatched yet — that's OK; it'll be fixed as Phase 5 adds them.

- [ ] **Step 5:** Commit:

```bash
git add funklang/tools/refrender/
git commit -m "feat(funklang): C reference render harness for bit-exact tests"
```

---

### Task 4.3: Node wrapper that invokes refrender

**Files:**
- Create: `funklang/tests/_helpers/refrender.ts`

- [ ] **Step 1:** Write a helper that spawns the harness and returns Int16Array. Tests use this to compute the expected JS-DSP output for any (patch path, instrument index):

```ts
// funklang/tests/_helpers/refrender.ts
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const BIN = resolve(__dirname, '../../tools/refrender/refrender');

export function refrender(patchPath: string, instrIdx: number): Int16Array {
  const buf = execFileSync(BIN, [patchPath, String(instrIdx)], {
    encoding: 'buffer',
    maxBuffer: 64 * 1024 * 1024,
  });
  return new Int16Array(buf.buffer, buf.byteOffset, buf.length / 2).slice();
}
```

- [ ] **Step 2:** Quick test that the helper works:

```ts
// funklang/tests/_helpers/refrender.test.ts
import { describe, it, expect } from 'vitest';
import { refrender } from './refrender.ts';
import { resolve } from 'node:path';
const ROOT = resolve(__dirname, '../../..');

describe('refrender helper', () => {
  it('runs against loctro5 instrument 0 and returns Int16 samples', () => {
    const out = refrender(resolve(ROOT, 'loctro5 3 chippisamplea.akp'), 0);
    expect(out.length).toBeGreaterThan(0);
    expect(out.BYTES_PER_ELEMENT).toBe(2);
  });
});
```

- [ ] **Step 3:** Run:

```bash
cd funklang && npx vitest run tests/_helpers/refrender.test.ts ; cd ..
```

Expect PASS (output content doesn't matter yet — just that the harness runs).

- [ ] **Step 4:** Commit:

```bash
git add funklang/tests/_helpers/
git commit -m "test(funklang): node helper to invoke C refrender harness"
```

---

## Phase 5 — JS DSP engine (op-by-op, bit-exact)

### Task 5.0: DSP skeleton

**Files:**
- Create: `funklang/src/dsp/types.ts`
- Create: `funklang/src/dsp/state.ts`
- Create: `funklang/src/dsp/engine.ts`
- Create: `funklang/src/dsp/ops/index.ts`

- [ ] **Step 1:** Define DSP types and per-op state container:

```ts
// funklang/src/dsp/types.ts
export interface RenderResult {
  sample:   Int16Array;
  slotTaps: Int16Array[];   // one Int16Array per slot in the rendered instrument
}

// Op functions are pure (apart from per-op state); they take inputs and
// produce one Int16 sample.
export type OpFn = (
  state:    OpState,
  slotIdx:  number,
  freqVal:  number,
  gainVal:  number,
  val1Val:  number,
  val2Val:  number,
  input:    number,
) => number;

export interface OpState {
  counter_saw:   Int32Array;   // one entry per slot index 0..19
  counter_tri:   Int32Array;
  counter_sine:  Int32Array;
  counter_pulse: Int32Array;
  counter_sh:    Int32Array;
  buffer_sh:     Int16Array;
  // add more as ops require
  noise_x1: number; noise_x2: number; noise_x3: number;
}
```

- [ ] **Step 2:** State factory:

```ts
// funklang/src/dsp/state.ts
import type { OpState } from './types.ts';
import { N_SLOTS_MAX } from '../patch/types.ts';

export function newOpState(): OpState {
  return {
    counter_saw:   new Int32Array(N_SLOTS_MAX),
    counter_tri:   new Int32Array(N_SLOTS_MAX),
    counter_sine:  new Int32Array(N_SLOTS_MAX),
    counter_pulse: new Int32Array(N_SLOTS_MAX),
    counter_sh:    new Int32Array(N_SLOTS_MAX),
    buffer_sh:     new Int16Array(N_SLOTS_MAX),
    noise_x1: 0x67452301 | 0,
    noise_x2: 0xefcdab89 | 0,
    noise_x3: 0,
  };
}
```

- [ ] **Step 3:** Op-table skeleton (filled in op-by-op below):

```ts
// funklang/src/dsp/ops/index.ts
import type { OpFn } from '../types.ts';
// import each op as it lands:
// import { op_vol } from './vol.ts';
// import { op_osc_saw } from './osc_saw.ts';

export const OPS: Record<number, OpFn> = {
  // 0 reserved (empty)
  // 1: op_vol,
  // 2: op_osc_saw,
  // …
};
```

- [ ] **Step 4:** Engine entry point:

```ts
// funklang/src/dsp/engine.ts
import type { Patch } from '../patch/types.ts';
import { N_SLOTS_MAX } from '../patch/types.ts';
import { OPS } from './ops/index.ts';
import { newOpState } from './state.ts';
import type { RenderResult } from './types.ts';

export class CyclicCloneError extends Error {
  constructor(public chain: number[]) {
    super(`cyclic clone through instruments ${chain.join('→')}`);
  }
}

export function renderInstrument(
  patch: Patch,
  instrIdx: number,
  _resolving: Set<number> = new Set(),
): RenderResult {
  if (_resolving.has(instrIdx)) {
    throw new CyclicCloneError([..._resolving, instrIdx]);
  }
  _resolving.add(instrIdx);

  const ins = patch.instruments[instrIdx];
  if (!ins) throw new RangeError(`instrument ${instrIdx} does not exist`);
  const N = ins.sampleLength;
  const sample = new Int16Array(N);
  const slotTaps = ins.slots.map(() => new Int16Array(N));
  const state = newOpState();
  const variable = new Int16Array(5);

  for (let t = 0; t < N; t++) {
    variable[0] = variable[1] = variable[2] = variable[3] = variable[4] = 0;
    for (let j = 0; j < ins.slots.length; j++) {
      const s = ins.slots[j]!;
      if (s.fn === 0 || s.outVar === 0) continue;
      const fn = OPS[s.fn];
      if (!fn) { slotTaps[j]![t] = 0; continue; }
      const input = variable[s.val1] ?? 0;
      const out = fn(state, j, s.freqVal, s.gainVal, s.val1Value, s.val2Value, input);
      variable[s.outVar] = out;
      slotTaps[j]![t] = out;
    }
    // final-output rule: the LAST non-empty slot's outVar
    let final = 0;
    for (let j = ins.slots.length - 1; j >= 0; j--) {
      const s = ins.slots[j]!;
      if (s.fn !== 0 && s.outVar !== 0) { final = variable[s.outVar] ?? 0; break; }
    }
    sample[t] = final;
  }

  _resolving.delete(instrIdx);
  return { sample, slotTaps };
}
```

- [ ] **Step 5:** Typecheck:

```bash
cd funklang && npm run typecheck && cd ..
```

- [ ] **Step 6:** Commit:

```bash
git add funklang/src/dsp/
git commit -m "feat(funklang): DSP engine skeleton (op table, driver loop, cycle detection)"
```

---

### Tasks 5.x — Port one op per task

For **each** Klang operator listed below, do ALL of: write a per-op JS implementation, add a per-op `*.test.ts` that compares against the C harness, wire it into `OPS`, run, commit. The pattern is identical; Task 5.1 below is the explicit template — repeat the structure for every other op.

**Op list to port (one task each):** `vol`, `osc_saw`, `osc_tri`, `osc_sine`, `osc_pulse`, `osc_noise`, `enva`, `envd`, `adsr`, `add`, `mul`, `sh`, `distortion`, `onepole_flt`, `sv_flt_n`, `cmb_flt_n`, `reverb`, `dly_cyc`, `ctrl`, `chordgen`, `vocoder`, `imported_sample`, `clone`.

That's 23 tasks (Tasks 5.1 … 5.23).

**Porting patterns** — apply uniformly when translating C → JS:

| C construct                       | JS equivalent                                       |
|-----------------------------------|-----------------------------------------------------|
| `short` (16-bit signed)           | `number`; clamp with `(v << 16) >> 16` when storing |
| `int` (32-bit signed)             | `number`; force with `v | 0`                        |
| `UBYTE` (8-bit unsigned)          | `number`; mask with `v & 0xff`                      |
| `a * b` (potentially-wide signed) | `Math.imul(a | 0, b | 0)`                           |
| `mulsw(a, b)` (Klang helper)      | `Math.imul(a | 0, b | 0)` (verify it is the same)   |
| `a >> n` (arithmetic shift)       | `a >> n` (works on Int32 in JS)                     |
| `a >>> n` (logical shift)         | `a >>> n`                                           |
| static C local (per-op state)     | Field on `OpState`; init in `newOpState()`          |
| `counter_X[instance]` (state)     | `state.counter_X[slotIdx]` (slot index IS instance) |

Per-op state arrays grow as new ops are added: each task that needs a new array adds it to `OpState` (in `funklang/src/dsp/types.ts`) and to `newOpState()` (in `funklang/src/dsp/state.ts`), then references it as `state.<name>`. The `refrender.c` harness must declare the matching global with the same name + size — keep them in sync.

---

### Task 5.1: Port `vol`

**Files:**
- Create: `funklang/src/dsp/ops/vol.ts`
- Create: `funklang/tests/dsp/vol.test.ts`
- Modify: `funklang/src/dsp/ops/index.ts` (register op code `1`)
- Modify: `funklang/tools/refrender/refrender.c` (ensure `case 1` calls `vol`)

- [ ] **Step 1:** Write the per-op JS implementation, mirroring `vol` in `synthnodes.h` (`return mulsw(val, gain) >> 7;` — a signed-multiply with a 7-bit shift):

```ts
// funklang/src/dsp/ops/vol.ts
import type { OpFn } from '../types.ts';

// short vol(short val, UBYTE gain) { return mulsw(val, gain) >> 7; }
export const op_vol: OpFn = (_s, _j, _freqVal, gainVal, _v1, _v2, input) => {
  const result = Math.imul(input | 0, gainVal & 0xff) >> 7;
  return result | 0;            // ensure Int16 semantics on assignment
};
```

- [ ] **Step 2:** Register in the op table:

```ts
// funklang/src/dsp/ops/index.ts
import type { OpFn } from '../types.ts';
import { op_vol } from './vol.ts';

export const OPS: Record<number, OpFn> = {
  1: op_vol,
};
```

- [ ] **Step 3:** Write the per-op test. It constructs a 1-instrument patch that uses ONLY this op, renders both in JS and in C, asserts sha256 equality:

```ts
// funklang/tests/dsp/vol.test.ts
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serializeAkp } from '../../src/fileio/akp.ts';
import { emptyPatch, emptySlot } from '../../src/patch/types.ts';
import { renderInstrument } from '../../src/dsp/engine.ts';
import { refrender } from '../_helpers/refrender.ts';

const sha = (buf: ArrayBufferView) =>
  createHash('sha256').update(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)).digest('hex');

describe('vol op', () => {
  it.each([
    { gain:   0, sampleLength: 64 },
    { gain:   1, sampleLength: 64 },
    { gain: 128, sampleLength: 256 },
    { gain: 255, sampleLength: 256 },
  ])('matches C reference for gain=$gain sampleLength=$sampleLength', ({ gain, sampleLength }) => {
    const p = emptyPatch();
    const ins = p.instruments[0]!;
    ins.sampleLength = sampleLength;
    // Build a v1 source then apply vol; without a source op, vol has 0 input.
    // Use osc_saw at fixed freq/gain to provide an input — BUT osc_saw isn't
    // ported yet at Task 5.1. Workaround: write an op-table that injects a
    // ramp into v1 directly for THIS test only — or skip the source until
    // Task 5.2 lands and back-fill this test. Easiest: assert that with no
    // source op, vol produces silence (all zeros) for any gain.
    ins.slots.push({ ...emptySlot(), outVar: 4, fn: 1, gainVal: gain });

    const jsBytes = renderInstrument(p, 0).sample;

    const dir = mkdtempSync(join(tmpdir(), 'funklang-'));
    const path = join(dir, 'test.akp');
    writeFileSync(path, serializeAkp(p));
    const cBytes = refrender(path, 0);

    expect({ len: jsBytes.length, sha: sha(jsBytes) })
      .toEqual({ len: cBytes.length, sha: sha(cBytes) });
  });
});
```

- [ ] **Step 4:** Ensure the C harness's switch has the same case (it does — `case 1: out = vol(variable[s->val1], s->gainVal); break;`). Rebuild:

```bash
make -C funklang/tools/refrender
```

- [ ] **Step 5:** Run, expect PASS:

```bash
cd funklang && npx vitest run tests/dsp/vol.test.ts ; cd ..
```

If the JS and C differ, the C reference is authoritative — debug your JS port. Common pitfalls: forgetting `Math.imul`, missing the `| 0` to clamp to Int32, applying `>> 7` to an already-shifted value.

- [ ] **Step 6:** Commit:

```bash
git add funklang/src/dsp/ops/vol.ts funklang/src/dsp/ops/index.ts funklang/tests/dsp/vol.test.ts
git commit -m "feat(funklang): port vol op, bit-exact vs refrender"
```

---

### Tasks 5.2 … 5.23: Port each remaining op

Repeat the Task-5.1 template for every op below. Each task uses the SAME structure: write the JS implementation matching the C source in `exe_creator/synthnodes.h`; register the op code; add per-op `*.test.ts`; ensure `refrender.c`'s `case` dispatches correctly (rebuild the harness); run and commit.

**Op code mapping** (from `Form1.arrayfunctiontext` — indices into the dropdown):

| Code | Op             | Source signature                                              |
|------|----------------|---------------------------------------------------------------|
| 1    | `vol`          | `vol(short val, UBYTE gain)`                                  |
| 2    | `osc_saw`      | `osc_saw(BYTE instance, short freq, UBYTE gain)`              |
| 3    | `osc_tri`      | `osc_tri(BYTE instance, short freq, UBYTE gain)`              |
| 4    | `osc_sine`     | `osc_sine(BYTE instance, short freq, UBYTE gain)`             |
| 5    | `osc_pulse`    | `osc_pulse(BYTE instance, short freq, UBYTE gain, UBYTE duty)`|
| 6    | `osc_noise`    | `osc_noise(int sample, UBYTE gain)`                           |
| 7    | `enva`         | `enva(...)` — read signature from synthnodes.h                |
| 8    | `envd`         | `envd(...)`                                                   |
| 9    | `add`          | `add(short v1, short v2)`                                     |
| 10   | `mul`          | `mul(short v1, short v2)`                                     |
| 11   | `dly_cyc`      | `dly_cyc(...)`                                                |
| 12   | `cmb_flt_n`    | `cmb_flt_n(...)`                                              |
| 13   | `reverb`       | `reverb(...)`                                                 |
| 14   | `ctrl`         | `ctrl(...)`                                                   |
| 15   | `sv_flt_n`     | `sv_flt_n(...)`                                               |
| 16   | `distortion`   | `distortion(int val, UBYTE gain)`                             |
| 18   | `chordgen`     | `chordgen(...)`                                               |
| 19   | `sh`           | `sh(BYTE instance, short val1, UBYTE step)`                   |
| 21   | `onepole_flt`  | `onepole_flt(...)`                                            |
| 23   | `adsr`         | `adsr(...)`                                                   |
| 24   | `vocoder`      | `vocoder(...)`                                                |
| 17 / 20 / 22 | possibly `clone`, `imported_sample`, or reserved — verify in Form1's edit-panel switch and dsp-reference.md before assigning codes |

For **Task 5.x**, the deliverables are:

- [ ] **Step 1:** Read the function in `exe_creator/synthnodes.h`. Note any new global state arrays it requires (extend `OpState` and `newOpState()` accordingly).
- [ ] **Step 2:** Write `funklang/src/dsp/ops/<op>.ts`, port faithfully — use `Math.imul`, `| 0`, `>>` / `>>>` to mirror C int semantics; clamp to Int16 if the C source does.
- [ ] **Step 3:** Register in `OPS` table with the correct code.
- [ ] **Step 4:** Ensure the matching `case` in `refrender.c` dispatches the same op with the same param mapping. Rebuild the harness.
- [ ] **Step 5:** Write `funklang/tests/dsp/<op>.test.ts` — for ops that need an audio source, chain a small upstream op already-ported (e.g. `osc_saw → vol`). Vary 3–5 param combinations.
- [ ] **Step 6:** Run, expect PASS. If JS and C differ, the C reference wins — debug the JS port.
- [ ] **Step 7:** Commit with `feat(funklang): port <op> op, bit-exact vs refrender`.

**Important:** the `clone` op is special — its JS implementation needs to recurse via `renderInstrument(patch, sourceIdx, _resolving)` to obtain the source instrument's sample stream, then sample it according to the transpose/reverse/offset params. The C harness must do the same (it can build a per-instrument sample cache during the load step). Save `clone` for **last** in the op list so all dependency ops are in place.

---

### Task 5.24: All-patches × all-instruments bit-exact integration test

**Files:**
- Create: `funklang/tests/dsp/bit-exact.test.ts`

- [ ] **Step 1:** Write a test that walks every `.akp` in `patches/` plus the loctro5 file, renders every non-empty instrument in BOTH the JS engine and the C harness, and asserts byte-equality. This is the gate on Phase 5:

```ts
// funklang/tests/dsp/bit-exact.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseAkp } from '../../src/fileio/akp.ts';
import { renderInstrument } from '../../src/dsp/engine.ts';
import { refrender } from '../_helpers/refrender.ts';

const ROOT = resolve(__dirname, '../../..');
const sha = (buf: ArrayBufferView) =>
  createHash('sha256').update(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)).digest('hex');

function pickFixtures(): string[] {
  const out: string[] = [];
  const dir = join(ROOT, 'patches');
  for (const f of readdirSync(dir)) if (f.endsWith('.akp')) out.push(join(dir, f));
  out.push(join(ROOT, 'loctro5 3 chippisamplea.akp'));
  return out;
}

describe('bit-exact: every patch × every non-empty instrument matches C', () => {
  for (const path of pickFixtures()) {
    const name = path.split('/').pop()!;
    const patch = parseAkp(new Uint8Array(readFileSync(path)));
    for (let i = 0; i < patch.instruments.length; i++) {
      const ins = patch.instruments[i]!;
      if (ins.slots.length === 0 || ins.sampleLength === 0) continue;
      it(`${name} · instrument ${i} (${ins.name})`, () => {
        const js = renderInstrument(patch, i).sample;
        const c  = refrender(path, i);
        expect({ len: js.length, sha: sha(js) })
          .toEqual({ len: c.length, sha: sha(c) });
      });
    }
  }
});
```

- [ ] **Step 2:** Run:

```bash
cd funklang && npx vitest run tests/dsp/bit-exact.test.ts ; cd ..
```

Expect: all assertions PASS. Failures point at a specific instrument; cross-reference its slot list to find the offending op and revisit that op's task.

- [ ] **Step 3:** Commit:

```bash
git add funklang/tests/dsp/bit-exact.test.ts
git commit -m "test(funklang): bit-exact integration test across all patches and instruments"
```

---

### Task 5.25: Performance smoke test

**Files:**
- Create: `funklang/tests/dsp/perf.test.ts`

- [ ] **Step 1:** Bench the largest patch — assert render time < 50ms:

```ts
// funklang/tests/dsp/perf.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { parseAkp } from '../../src/fileio/akp.ts';
import { renderInstrument } from '../../src/dsp/engine.ts';

const ROOT = resolve(__dirname, '../../..');

describe('DSP performance', () => {
  it('renders the largest patch instrument in under 50ms', () => {
    const path = join(ROOT, 'patches', 'Tecon - disco transmission.akp');
    const p = parseAkp(new Uint8Array(readFileSync(path)));
    const largest = p.instruments
      .map((ins, i) => ({ i, n: ins.slots.length * ins.sampleLength }))
      .sort((a, b) => b.n - a.n)[0]!;
    // warm up
    renderInstrument(p, largest.i);
    const t0 = performance.now();
    renderInstrument(p, largest.i);
    const dt = performance.now() - t0;
    expect(dt).toBeLessThan(50);
  });
});
```

- [ ] **Step 2:** Run, expect PASS. If it fails, profile and optimize hot loops (typed arrays already; avoid object allocations inside the inner loop):

```bash
cd funklang && npx vitest run tests/dsp/perf.test.ts ; cd ..
```

- [ ] **Step 3:** Commit:

```bash
git add funklang/tests/dsp/perf.test.ts
git commit -m "test(funklang): DSP performance smoke test (<50ms for largest patch)"
```

---

## Phase 6 — Audio player

### Task 6.1: Web Audio wrapper

**Files:**
- Create: `funklang/src/audio/player.ts`
- Create: `funklang/tests/audio/player.test.ts`

- [ ] **Step 1:** Tests use a mock AudioContext (jsdom doesn't ship one):

```ts
// funklang/tests/audio/player.test.ts
/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Player } from '../../src/audio/player.ts';

class FakeBufferSrc { buffer: any = null; connected = false; started = false; stopped = false;
  connect = vi.fn(() => this);
  start  = vi.fn(() => { this.started = true; });
  stop   = vi.fn(() => { this.stopped = true; });
  onended: (() => void) | null = null;
}
class FakeBuffer { constructor(public n: number, public rate: number) {} copyToChannel = vi.fn(); }
class FakeCtx {
  destination = {} as any;
  state = 'running';
  createBuffer = (_ch: number, n: number, rate: number) => new FakeBuffer(n, rate);
  createBufferSource = () => new FakeBufferSrc();
  createGain = () => ({ gain: { value: 1 }, connect: vi.fn(() => this) });
  resume = vi.fn(async () => {});
}

beforeEach(() => {
  (globalThis as any).AudioContext = FakeCtx;
  (globalThis as any).webkitAudioContext = FakeCtx;
});

describe('Player', () => {
  it('plays a sample', () => {
    const p = new Player();
    const sample = new Int16Array([0, 16384, -16384, 0]);
    p.play(sample, 22050);
    // No throw, internal source.start called
    expect(p.isPlaying()).toBe(true);
  });
  it('stops the previous voice on re-trigger', () => {
    const p = new Player();
    p.play(new Int16Array(64), 22050);
    const first = p['currentSrc'] as any;
    p.play(new Int16Array(64), 22050);
    expect(first.stop).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2:** Run, expect FAIL.

- [ ] **Step 3:** Implement:

```ts
// funklang/src/audio/player.ts
type Ctor = { new (...args: any[]): AudioContext };
function getACtor(): Ctor {
  const w = window as any;
  return w.AudioContext ?? w.webkitAudioContext;
}

export class Player {
  private ctx?: AudioContext;
  private gain?: GainNode;
  private currentSrc?: AudioBufferSourceNode;
  private playing = false;

  private ensure(): AudioContext {
    if (!this.ctx) {
      const C = getACtor(); if (!C) throw new Error('Web Audio API not available');
      this.ctx = new C();
      this.gain = this.ctx.createGain();
      this.gain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  setMaster(g: number): void { if (this.gain) this.gain.gain.value = g; }

  isPlaying(): boolean { return this.playing; }

  play(sample: Int16Array, sampleRate: number): void {
    const ctx = this.ensure();
    this.stop();
    const buf = ctx.createBuffer(1, sample.length, sampleRate);
    const ch  = new Float32Array(sample.length);
    for (let i = 0; i < sample.length; i++) ch[i] = sample[i]! / 32768;
    buf.copyToChannel(ch, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.gain!);
    src.onended = () => { if (this.currentSrc === src) { this.playing = false; this.currentSrc = undefined; } };
    src.start();
    this.currentSrc = src;
    this.playing = true;
  }

  stop(): void {
    if (this.currentSrc) {
      try { this.currentSrc.stop(); } catch { /* already stopped */ }
      this.currentSrc = undefined;
    }
    this.playing = false;
  }
}
```

- [ ] **Step 4:** Run, expect PASS:

```bash
cd funklang && npx vitest run tests/audio/player.test.ts ; cd ..
```

- [ ] **Step 5:** Commit:

```bash
git add funklang/src/audio/player.ts funklang/tests/audio/player.test.ts
git commit -m "feat(funklang): Web Audio player with clean re-trigger"
```

---

## Phase 7 — UI scaffolding

### Task 7.1: Tiny reactive helpers

**Files:**
- Create: `funklang/src/ui/reactive.ts`
- Create: `funklang/tests/ui/reactive.test.ts`

- [ ] **Step 1:** Write the test:

```ts
// funklang/tests/ui/reactive.test.ts
import { describe, it, expect, vi } from 'vitest';
import { signal, effect } from '../../src/ui/reactive.ts';

describe('signal/effect', () => {
  it('runs effect on initial subscribe and on every change', () => {
    const s = signal(0);
    const cb = vi.fn();
    effect(() => cb(s.get()));
    s.set(1); s.set(2);
    expect(cb).toHaveBeenCalledTimes(3);
    expect(cb).toHaveBeenLastCalledWith(2);
  });
});
```

- [ ] **Step 2:** Implement:

```ts
// funklang/src/ui/reactive.ts
type Reader = () => void;
let CURRENT: Reader | null = null;

export interface Signal<T> { get(): T; set(v: T): void; }

export function signal<T>(initial: T): Signal<T> {
  let value = initial;
  const subs = new Set<Reader>();
  return {
    get() { if (CURRENT) subs.add(CURRENT); return value; },
    set(v: T) { if (Object.is(v, value)) return; value = v; for (const r of [...subs]) r(); },
  };
}

export function effect(fn: () => void): () => void {
  const run: Reader = () => { CURRENT = run; try { fn(); } finally { CURRENT = null; } };
  run();
  return () => { /* no-op: signals hold weak refs via Set; effect lifetime tied to caller */ };
}
```

- [ ] **Step 3:** Run, expect PASS. Commit:

```bash
cd funklang && npx vitest run tests/ui/reactive.test.ts ; cd ..
git add funklang/src/ui/reactive.ts funklang/tests/ui/reactive.test.ts
git commit -m "feat(funklang): tiny signal/effect reactive helpers"
```

---

### Task 7.2: Replace index.html scaffolding and bootstrap

**Files:**
- Modify: `funklang/index.html` (use the mockup's HTML structure as a starting point)
- Replace: `funklang/src/main.ts`
- Create: `funklang/src/ui/styles.css`

- [ ] **Step 1:** Copy the mockup's `<style>` block to `funklang/src/ui/styles.css`. Replace `funklang/index.html` to import the CSS and the new `main.ts`. Keep the same DOM structure as the mockup (header, sidebar, main, footer), but with empty containers that JS will fill.

You can lift large chunks from `funklang/editor-mockup.html` — that's its purpose.

- [ ] **Step 2:** Write a minimal `main.ts` that boots an empty patch and displays a "no patch loaded" placeholder:

```ts
// funklang/src/main.ts
import './ui/styles.css';
import { PatchModel } from './patch/model.ts';
import { emptyPatch } from './patch/types.ts';

const model = new PatchModel(emptyPatch());
document.getElementById('app')!.textContent = `funklang ready — ${model.patch.instruments.length} instrument slots`;
```

- [ ] **Step 3:** Verify in headless browser via the dev server:

```bash
cd funklang && (npm run dev &) ; sleep 3
curl -s http://localhost:5173/ | grep -q 'funklang' && echo OK || echo FAIL
pkill -f 'vite' ; cd ..
```

- [ ] **Step 4:** Commit:

```bash
git add funklang/index.html funklang/src/main.ts funklang/src/ui/styles.css
git commit -m "feat(funklang): bootstrap UI with shared CSS from mockup"
```

---

### Task 7.3: File-open + sidebar + minimal playback (E2E baseline)

**Files:**
- Create: `funklang/src/ui/app.ts`
- Create: `funklang/src/ui/sidebar.ts`
- Create: `funklang/src/ui/file-dialog.ts`
- Modify: `funklang/src/main.ts`
- Create: `funklang/playwright.config.ts`
- Create: `funklang/tests-e2e/smoke.spec.ts`

- [ ] **Step 1:** Write `funklang/src/ui/file-dialog.ts`:

```ts
// funklang/src/ui/file-dialog.ts
export async function openFileBytes(accept: string): Promise<{ name: string; bytes: Uint8Array } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = accept;
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      resolve({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
    };
    input.click();
  });
}
```

- [ ] **Step 2:** Write `funklang/src/ui/sidebar.ts`:

```ts
// funklang/src/ui/sidebar.ts
import type { Patch } from '../patch/types.ts';

export function renderSidebar(root: HTMLElement, patch: Patch, onPick: (i: number) => void): void {
  root.innerHTML = '';
  for (let i = 0; i < patch.instruments.length; i++) {
    const ins = patch.instruments[i]!;
    const li = document.createElement('li');
    li.className = 'instr-row' + (ins.slots.length ? '' : ' empty');
    li.innerHTML = `<span class="num">${String(i+1).padStart(2,'0')}</span>` +
                   `<span class="name">${ins.name || '—'}</span>`;
    li.dataset['idx'] = String(i);
    if (ins.slots.length) li.addEventListener('click', () => onPick(i));
    root.appendChild(li);
  }
}
```

- [ ] **Step 3:** Wire it up in `funklang/src/ui/app.ts`:

```ts
// funklang/src/ui/app.ts
import { PatchModel } from '../patch/model.ts';
import { emptyPatch } from '../patch/types.ts';
import { parseAkp } from '../fileio/akp.ts';
import { renderInstrument } from '../dsp/engine.ts';
import { Player } from '../audio/player.ts';
import { openFileBytes } from './file-dialog.ts';
import { renderSidebar } from './sidebar.ts';

export function bootApp(root: HTMLElement): void {
  const model  = new PatchModel(emptyPatch());
  const player = new Player();
  let activeIdx = 0;

  root.innerHTML = `
    <header><button id="btn-open">OPEN PATCH</button>
            <button id="btn-play">PLAY</button>
            <button id="btn-stop">STOP</button>
            <span id="file-name">(no patch loaded)</span></header>
    <aside><ul id="instr-list"></ul></aside>
    <main id="main-area">Pick an instrument from the left.</main>
  `;
  const listEl = root.querySelector('#instr-list') as HTMLElement;
  const nameEl = root.querySelector('#file-name')  as HTMLElement;

  const repaint = () => renderSidebar(listEl, model.patch, (i) => { activeIdx = i; });

  (root.querySelector('#btn-open') as HTMLButtonElement).addEventListener('click', async () => {
    const f = await openFileBytes('.akp');
    if (!f) return;
    model.patch = parseAkp(f.bytes);
    nameEl.textContent = f.name;
    repaint();
  });
  (root.querySelector('#btn-play') as HTMLButtonElement).addEventListener('click', () => {
    if (!model.patch.instruments[activeIdx]?.slots.length) return;
    const { sample } = renderInstrument(model.patch, activeIdx);
    player.play(sample, 22050);
  });
  (root.querySelector('#btn-stop') as HTMLButtonElement).addEventListener('click', () => player.stop());

  repaint();
}
```

- [ ] **Step 4:** Update `funklang/src/main.ts`:

```ts
import './ui/styles.css';
import { bootApp } from './ui/app.ts';
bootApp(document.getElementById('app')!);
```

- [ ] **Step 5:** Write Playwright config:

```ts
// funklang/playwright.config.ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests-e2e',
  webServer: { command: 'npm run dev', port: 5173, reuseExistingServer: true },
  use: { baseURL: 'http://localhost:5173' },
});
```

- [ ] **Step 6:** Write the smoke E2E. To avoid the native file-picker dialog (which Playwright cannot drive), the app exposes a hidden `<input type=file id="hidden-file-input">` that the OPEN button forwards `.click()` calls to; the test sets files on that input directly:

First, modify `funklang/src/ui/app.ts` to include the hidden input and use it instead of creating one dynamically:

```ts
// inside bootApp(), replace the OPEN handler with:
const hidden = document.createElement('input');
hidden.type = 'file'; hidden.accept = '.akp'; hidden.id = 'hidden-file-input';
hidden.style.display = 'none';
root.appendChild(hidden);
hidden.addEventListener('change', async () => {
  const f = hidden.files?.[0]; if (!f) return;
  model.patch = parseAkp(new Uint8Array(await f.arrayBuffer()));
  nameEl.textContent = f.name;
  repaint();
});
(root.querySelector('#btn-open') as HTMLButtonElement).addEventListener('click', () => hidden.click());
```

Then the E2E:

```ts
// funklang/tests-e2e/smoke.spec.ts
import { test, expect } from '@playwright/test';
import { resolve } from 'node:path';

const FIXTURE = resolve(__dirname, '../../loctro5 3 chippisamplea.akp');

test('open loctro5, sidebar populates, file name displayed', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#instr-list')).toBeVisible();
  await page.setInputFiles('#hidden-file-input', FIXTURE);
  await expect(page.locator('#file-name')).toHaveText('loctro5 3 chippisamplea.akp');
  // First non-empty instrument should now appear in the sidebar
  await expect(page.locator('#instr-list .instr-row:not(.empty)').first()).toBeVisible();
});
```

> The E2E above is intentionally minimal; the rich editing tests come in Phase 8. The goal here is to prove the dev server + Playwright + a real `.akp` cycle all work.

- [ ] **Step 7:** Run:

```bash
cd funklang && npx playwright test ; cd ..
```

Expect PASS. Commit:

```bash
git add funklang/playwright.config.ts funklang/tests-e2e/ funklang/src/ui/
git commit -m "feat(funklang): minimal UI scaffold + Playwright smoke test"
```

---

## Phase 8 — Editor UI (per spec UX section)

> Each task below corresponds to one UX element from the spec. After each, run `npm run test`, `npm run typecheck`, AND the Playwright smoke test to be sure nothing regressed. Commit per task.

### Task 8.1: Instrument header + meta fields

**Files:**
- Create: `funklang/src/ui/instr-header.ts`
- Modify: `funklang/src/ui/app.ts`

- [ ] **Step 1:** Implement a component that renders an instrument's name, sampleLength, loopOffset, loopLength as editable inputs; calls `model.setInstrumentField(...)` on change.

```ts
// funklang/src/ui/instr-header.ts
import type { PatchModel } from '../patch/model.ts';

export function renderInstrHeader(root: HTMLElement, model: PatchModel, instrIdx: number): void {
  const ins = model.patch.instruments[instrIdx]!;
  root.innerHTML = `
    <div class="instr-header">
      <input class="ih-name" value="${ins.name}">
      <label>length <input class="ih-len" type="number" value="${ins.sampleLength}"></label>
      <label>loop ofs <input class="ih-lo"  type="number" value="${ins.loopOffset}"></label>
      <label>loop len <input class="ih-ll" type="number" value="${ins.loopLength}"></label>
    </div>`;
  (root.querySelector('.ih-name') as HTMLInputElement).addEventListener('input', e => model.setInstrumentField(instrIdx, 'name', (e.target as HTMLInputElement).value));
  (root.querySelector('.ih-len')  as HTMLInputElement).addEventListener('input', e => model.setInstrumentField(instrIdx, 'sampleLength', Number((e.target as HTMLInputElement).value)));
  (root.querySelector('.ih-lo')   as HTMLInputElement).addEventListener('input', e => model.setInstrumentField(instrIdx, 'loopOffset',   Number((e.target as HTMLInputElement).value)));
  (root.querySelector('.ih-ll')   as HTMLInputElement).addEventListener('input', e => model.setInstrumentField(instrIdx, 'loopLength',   Number((e.target as HTMLInputElement).value)));
}
```

- [ ] **Step 2:** Wire it into `app.ts` (render on instrument pick).
- [ ] **Step 3:** Commit.

### Task 8.2: Slot grid (show only filled slots; `[+]` insertion targets)

**Files:**
- Create: `funklang/src/ui/slot-grid.ts`
- Create: `funklang/src/ui/op-picker.ts`
- Modify: `funklang/src/ui/app.ts`

- [ ] **Step 1:** Implement `renderSlotGrid(root, model, instrIdx, onSlotClick)` that:
  - Renders each filled slot as a row (slot#, output var, fn name, [params placeholder], waveform placeholder, drag handle).
  - Shows `[+]` hover-revealed insertion targets before/between/after rows.
  - Hides `[+]` once `slots.length === N_SLOTS_MAX` and shows a `20/20` badge.
- [ ] **Step 2:** Implement `op-picker.ts`: a small modal listing all op codes grouped by category (oscillators, envelopes, filters, mix, fx, clone). Click selects → calls a callback with the chosen code; close on outside-click or Escape.
- [ ] **Step 3:** Add a Playwright test that opens loctro5, picks instrument 0, asserts the rendered slot count matches the JS-loaded patch's filled slots, clicks `[+]`, picks `osc_saw` from the picker, asserts a new row appears.
- [ ] **Step 4:** Commit.

### Task 8.3: Knob component

**Files:**
- Create: `funklang/src/ui/knob.ts`
- Create: `funklang/tests/ui/knob.test.ts`

- [ ] **Step 1:** A reusable Knob component supporting all the input methods from the spec (drag, shift-drag, wheel, arrows, double-click, right-click).
- [ ] **Step 2:** Tests cover keyboard arrows, wheel, drag math (jsdom env).
- [ ] **Step 3:** Wire it into the slot row so each Slot field (`freqVal`, `gainVal`, `val1Value`, `val2Value`) becomes a knob that mutates the model.
- [ ] **Step 4:** Commit.

### Task 8.4: Per-slot waveform tap

**Files:**
- Create: `funklang/src/ui/waveform.ts`

- [ ] **Step 1:** A small canvas component. Given an `Int16Array` and width/height, draws the waveform as an amber stroke on dark background.
- [ ] **Step 2:** Hook into the change-event bus: on a `param` or `structure` change for the displayed instrument, re-call `renderInstrument()` (debounced 80ms) and update all per-slot taps from `slotTaps`.
- [ ] **Step 3:** Commit.

### Task 8.5: Audition + transport

**Files:**
- Modify: `funklang/src/ui/app.ts`
- Modify: `funklang/src/ui/slot-grid.ts`

- [ ] **Step 1:** Track audition target (`{instrIdx, slotIdx}`). Click a slot → set as target, paint magenta indicator.
- [ ] **Step 2:** On any change for the audition's instrument, re-render and `player.play(slotTaps[slotIdx], rate)`. Debounce 80ms.
- [ ] **Step 3:** Wire PLAY/STOP/RETRIG buttons.
- [ ] **Step 4:** Commit.

### Task 8.6: Drag-to-reorder slots

**Files:**
- Modify: `funklang/src/ui/slot-grid.ts`

- [ ] **Step 1:** Port the HTML5 drag-and-drop logic from `editor-mockup.html` into the real slot grid; on drop, call `model.moveSlot(...)`.
- [ ] **Step 2:** Playwright test: drag slot 0 to slot 2, assert the post-drop order matches expectations.
- [ ] **Step 3:** Commit.

### Task 8.7: Clone-block expansion

**Files:**
- Modify: `funklang/src/ui/slot-grid.ts`
- Create: `funklang/src/ui/clone-block.ts`

- [ ] **Step 1:** For a slot whose `fn` is the clone op code, render an `▶`/`▼` expand toggle.
- [ ] **Step 2:** When expanded, recursively render the source instrument's slot grid inline below the row, prefixed with `↪ from instrument ${idx} "${name}"` chrome. Edits in the inner grid call `model.setSlotParam` etc. with the source instrument index (write-through).
- [ ] **Step 3:** Depth-2 default-collapsed: track current depth and only auto-expand depth 1; deeper levels start collapsed.
- [ ] **Step 4:** Catch `CyclicCloneError`; render a red chip on the offending slot.
- [ ] **Step 5:** Playwright test: open a constructed patch with `instr 1 → clones instr 0`, expand the clone, edit a knob in the inner block, assert instr 0's data changed.
- [ ] **Step 6:** Commit.

### Task 8.8: Dedicated waveform viewer with zoom/pan/loop overlay

**Files:**
- Create: `funklang/src/ui/wave-viewer.ts`
- Modify: `funklang/src/ui/app.ts`

- [ ] **Step 1:** Bigger canvas component. Shows the instrument's final-output sample (or a chosen tap). Mouse wheel zoom, drag pan, magenta translucent loop band with draggable edges that updates `loopOffset`/`loopLength` via the model.
- [ ] **Step 2:** Commit.

### Task 8.9: File operations (Save, Import .aki, Export .aki, Save As)

**Files:**
- Modify: `funklang/src/ui/file-dialog.ts` (add `saveFileBytes`)
- Modify: `funklang/src/ui/app.ts`

- [ ] **Step 1:** Implement `saveFileBytes(bytes, suggestedName)` using `window.showSaveFilePicker` with download fallback (anchor + `URL.createObjectURL`).
- [ ] **Step 2:** Add toolbar buttons: NEW, OPEN PATCH, IMPORT INSTRUMENT, EXPORT INSTRUMENT, SAVE, SAVE AS .AKP — wire each to the model + I/O modules per the spec's File Operations section.
- [ ] **Step 3:** Playwright test that opens loctro5, modifies a knob, saves, re-opens the saved file, asserts the modification persisted.
- [ ] **Step 4:** Commit.

---

## Phase 9 — Final acceptance

### Task 9.1: Full test suite + manual smoke

**Files:** (no new files — pure verification)

- [ ] **Step 1:** Run everything:

```bash
cd funklang
npm run typecheck
npm run test           # all unit + integration tests
npx playwright test    # all E2E
cd ..
```

All green. If anything fails, return to the relevant phase task.

- [ ] **Step 2:** Build the production bundle:

```bash
cd funklang && npm run build && cd ..
```

Expect: `funklang/dist/` populated with `index.html` + hashed JS/CSS.

- [ ] **Step 3:** Serve the build and load loctro5 in a real browser:

```bash
cd funklang && (npm run preview &) ; sleep 3
xdg-open http://localhost:4173/ 2>/dev/null || firefox http://localhost:4173/ &
cd ..
```

(If running headless, skip this step. The Playwright suite in 9.1 step 1 already exercises the UI.)

- [ ] **Step 4:** Final commit:

```bash
git add -A
git commit --allow-empty -m "release(funklang): v1 complete — loctro5 round-trips, bit-exact DSP, full editor"
```

---

## Verification matrix (all must be green to ship v1)

| What                                                              | Verified by                                                    |
|-------------------------------------------------------------------|----------------------------------------------------------------|
| .akp / .aki parse and round-trip byte-for-byte                    | `tests/fileio/akp.test.ts`, `tests/fileio/aki.test.ts`         |
| Patch model mutators emit correct events                          | `tests/patch/model.test.ts`                                    |
| Every Klang op is bit-exact vs the C reference                    | `tests/dsp/*.test.ts`                                          |
| Every patch × instrument renders bit-exact                        | `tests/dsp/bit-exact.test.ts`                                  |
| Render performance under budget                                   | `tests/dsp/perf.test.ts`                                       |
| Audio player triggers without errors                              | `tests/audio/player.test.ts`                                   |
| UI scaffolds + loads loctro5                                      | `tests-e2e/smoke.spec.ts`                                      |
| Slot grid renders only filled slots; `[+]` adds new               | Task 8.2 Playwright test                                       |
| Knobs support drag/wheel/keys/double-click                        | `tests/ui/knob.test.ts`                                        |
| Drag-to-reorder mutates slot order                                | Task 8.6 Playwright test                                       |
| Clone-block expansion writes through to source instrument         | Task 8.7 Playwright test                                       |
| Save-modify-reopen preserves changes                              | Task 8.9 Playwright test                                       |
| Production build succeeds                                         | Task 9.1 step 2                                                |
