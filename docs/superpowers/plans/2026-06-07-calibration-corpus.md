# Calibration Corpus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate a corpus of calibration patches, compile each through `compilePatch`, and write a `measurements.csv` of `(patch descriptor → uncompressed/shrinkled bytes)` that the fitter (sub-project 4) turns into `calibration-data.ts`.

**Architecture:** Pure generators under `funklang/sizelab/corpus/` build single-purpose patches (a standard sine producer feeds every variable input; modes derived automatically from op-metadata). A runner compiles them via the harness (one `nix-shell`) and records rich descriptors + both sizes. All fitting math is deferred to sub-project 4 — the corpus only gathers data.

**Tech Stack:** TypeScript, Vitest (Node), the exporter + `compilePatch` harness, `src/schema/op-metadata`, `src/patch/types`.

**Spec:** `funklang/docs/superpowers/specs/2026-06-06-calibration-corpus-design.md`

**v1 scope:** regular OP_ARGS ops (codes 1–16, 19, 21) auto-moded; a sine producer baseline; an all-ops scaffold; a few two-phase patches (separate per-type routine from per-phase cost); imports (covers `imported`/op 20); sample-length neutrality. **Deferred to a v2 follow-up:** the parameterized bespoke ops clone(17)/chordgen(18)/adsr(23) — they need cross-instrument sources / operand sweeps and get their own size functions per the design.

---

## File Structure
- Create `funklang/sizelab/corpus/producer.ts` — standard sine producer slot + constants.
- Create `funklang/sizelab/corpus/modes.ts` — op-metadata-driven param-mode derivation.
- Create `funklang/sizelab/corpus/op-instruments.ts` — `opInstrument(op, mode)` builder.
- Create `funklang/sizelab/corpus/corpus-spec.ts` — assembles `CorpusItem[]` (all families) + descriptor types.
- Create `funklang/sizelab/corpus/measurements-csv.ts` — CSV (de)serialization of measurement rows.
- Create `funklang/sizelab/corpus/run-corpus.ts` — runner: compile each item, write `measurements.csv`.
- Modify `funklang/package.json` — `corpus:run` script (wraps the runner in `nix-shell`).
- Commit the produced `funklang/sizelab/corpus/measurements.csv` (deterministic data; lets the fitter run without wine).

Field mapping reminder (exporter semantics): a var-source param's `field` holds a var index directly (e.g. `val1 = 2` ⇒ reads v2); a var-or-const param uses `selector` (0 = literal, 1..4 = vN) + value `field` (the literal). Producers write v2.., the op writes v1.

---

## Task 1: standard producer + mode derivation

**Files:**
- Create: `funklang/sizelab/corpus/producer.ts`
- Create: `funklang/sizelab/corpus/modes.ts`
- Test: `funklang/sizelab/corpus/modes.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// funklang/sizelab/corpus/modes.test.ts
import { describe, it, expect } from 'vitest';
import { producerSlot, PRODUCER_FREQ, PRODUCER_GAIN } from './producer';
import { varOrConstParams, varSourceParams, modesFor, modeId } from './modes';

describe('producerSlot', () => {
  it('is an osc_sine with const freq/gain writing to the given var', () => {
    const s = producerSlot(2);
    expect(s.fn).toBe(4);            // osc_sine
    expect(s.outVar).toBe(2);
    expect(s.freq).toBe(0); expect(s.freqVal).toBe(PRODUCER_FREQ);
    expect(s.gain).toBe(0); expect(s.gainVal).toBe(PRODUCER_GAIN);
  });
});

describe('param introspection (op-metadata driven)', () => {
  it('osc_saw (2) has freq+gain var-or-const, no var-source', () => {
    expect(varOrConstParams(2).map((p) => p.selector)).toEqual(['freq', 'gain']);
    expect(varSourceParams(2)).toEqual([]);
  });
  it('vol (1) has gain var-or-const and val1 var-source', () => {
    expect(varOrConstParams(1).map((p) => p.selector)).toEqual(['gain']);
    expect(varSourceParams(1)).toEqual(['val1']);
  });
});

describe('modesFor / modeId', () => {
  it('2-param op → all-const, each-single-var, all-var', () => {
    expect(modesFor(2)).toEqual([[false, false], [true, false], [false, true], [true, true]]);
    expect(modesFor(2).map(modeId)).toEqual(['cc', 'Vc', 'cV', 'VV']);
  });
  it('1-param op → const, var', () => {
    expect(modesFor(1).map(modeId)).toEqual(['c', 'V']);
  });
  it('0-var-or-const op → single empty mode', () => {
    // ctrl (14): only a var-source input, no var-or-const params
    expect(modesFor(14)).toEqual([[]]);
    expect(modeId([])).toBe('-');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd funklang && npx vitest run sizelab/corpus/modes.test.ts`
Expected: FAIL — cannot resolve `./producer`.

- [ ] **Step 3: Write the implementations**

```typescript
// funklang/sizelab/corpus/producer.ts
import { emptySlot, type Slot } from '../../src/patch/types';

/** Standard calibrated input producer: osc_sine (fn 4), fixed const freq+gain. */
export const PRODUCER_FREQ = 1000;
export const PRODUCER_GAIN = 64;

export function producerSlot(outVar: number): Slot {
  return { ...emptySlot(), fn: 4, outVar, freq: 0, freqVal: PRODUCER_FREQ, gain: 0, gainVal: PRODUCER_GAIN };
}
```

```typescript
// funklang/sizelab/corpus/modes.ts
import type { Slot } from '../../src/patch/types';
import { opByCode } from '../../src/schema/op-metadata';

/** A var-or-const parameter: its selector field (0=literal, 1..4=vN) + value field. */
export interface VocParam { selector: keyof Slot; value: keyof Slot; }

export function varOrConstParams(opCode: number): VocParam[] {
  const def = opByCode(opCode);
  if (!def) return [];
  const out: VocParam[] = [];
  for (const p of def.params) {
    if (p.type.kind === 'var-or-const' && p.selector) out.push({ selector: p.selector, value: p.field });
  }
  return out;
}

/** Pure var-source inputs (always a variable) — their `field` holds the var index. */
export function varSourceParams(opCode: number): Array<keyof Slot> {
  const def = opByCode(opCode);
  if (!def) return [];
  return def.params.filter((p) => p.type.kind === 'var-source').map((p) => p.field);
}

/** Modes to measure: all-const, each-single-var, all-var (all-var only when >1 param). */
export function modesFor(opCode: number): boolean[][] {
  const n = varOrConstParams(opCode).length;
  if (n === 0) return [[]];
  const modes: boolean[][] = [new Array(n).fill(false)];
  for (let i = 0; i < n; i++) { const m = new Array(n).fill(false); m[i] = true; modes.push(m); }
  if (n > 1) modes.push(new Array(n).fill(true));
  return modes;
}

export const modeId = (m: boolean[]): string => (m.length ? m.map((v) => (v ? 'V' : 'c')).join('') : '-');
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd funklang && npx vitest run sizelab/corpus/modes.test.ts` and `npm run typecheck`
Expected: PASS, typecheck clean. (If `varOrConstParams(1)`/`varSourceParams(1)` order differs from the test, fix the test to match op-metadata's actual param order — read `src/schema/op-metadata.ts` for vol/osc_saw and adjust expectations to the real order; the *logic* is what matters.)

- [ ] **Step 5: Commit**

```bash
git add funklang/sizelab/corpus/producer.ts funklang/sizelab/corpus/modes.ts funklang/sizelab/corpus/modes.test.ts
git commit -m "feat(sizelab): corpus producer + op-metadata-driven mode derivation"
```

---

## Task 2: op-instrument builder

**Files:**
- Create: `funklang/sizelab/corpus/op-instruments.ts`
- Test: `funklang/sizelab/corpus/op-instruments.test.ts`

Builds a single instrument exercising `(op, mode)`: producers (sine) for every var-source input and every variable param, placed first (so the var is written before read); the op writes v1. Var-or-const value fields get a mid const from op-metadata.

- [ ] **Step 1: Write the failing test**

```typescript
// funklang/sizelab/corpus/op-instruments.test.ts
import { describe, it, expect } from 'vitest';
import { opInstrument, CALIB_SAMPLE_LENGTH } from './op-instruments';

describe('opInstrument', () => {
  it('osc_saw all-const: one phase, no producers, v1 output, literal freq/gain', () => {
    const { instrument, producerCount } = opInstrument(2, [false, false]);
    expect(producerCount).toBe(0);
    expect(instrument.sampleLength).toBe(CALIB_SAMPLE_LENGTH);
    expect(instrument.slots).toHaveLength(1);
    const op = instrument.slots[0]!;
    expect(op.fn).toBe(2); expect(op.outVar).toBe(1);
    expect(op.freq).toBe(0); expect(op.gain).toBe(0);   // both literal (selectors 0)
  });

  it('osc_saw all-var: two sine producers feed v2/v3, op selectors point at them', () => {
    const { instrument, producerCount } = opInstrument(2, [true, true]);
    expect(producerCount).toBe(2);
    expect(instrument.slots).toHaveLength(3);
    expect(instrument.slots[0]!.fn).toBe(4); expect(instrument.slots[0]!.outVar).toBe(2); // producer v2
    expect(instrument.slots[1]!.fn).toBe(4); expect(instrument.slots[1]!.outVar).toBe(3); // producer v3
    const op = instrument.slots[2]!;
    expect(op.fn).toBe(2); expect(op.outVar).toBe(1);
    expect(op.freq).toBe(2);   // freq selector → v2
    expect(op.gain).toBe(3);   // gain selector → v3
  });

  it('vol: val1 var-source always gets a producer; gain const in cc-equivalent mode', () => {
    const { instrument, producerCount } = opInstrument(1, [false]); // gain literal
    expect(producerCount).toBe(1);                                  // the val1 producer
    const op = instrument.slots.at(-1)!;
    expect(op.fn).toBe(1); expect(op.outVar).toBe(1);
    expect(op.val1).toBe(2);   // val1 var-source → producer v2
    expect(op.gain).toBe(0);   // gain literal
    expect(op.gainVal).toBeGreaterThan(0);  // a mid const
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd funklang && npx vitest run sizelab/corpus/op-instruments.test.ts`
Expected: FAIL — cannot resolve `./op-instruments`.

- [ ] **Step 3: Write the implementation**

```typescript
// funklang/sizelab/corpus/op-instruments.ts
import { emptyInstrument, emptySlot, type Instrument, type Slot } from '../../src/patch/types';
import { opByCode } from '../../src/schema/op-metadata';
import { producerSlot } from './producer';
import { varOrConstParams, varSourceParams } from './modes';

export const CALIB_SAMPLE_LENGTH = 4096;

export interface OpInstrument { instrument: Instrument; producerCount: number; }

function midConst(opCode: number, valueField: keyof Slot): number {
  const def = opByCode(opCode);
  const p = def?.params.find((pp) => pp.field === valueField);
  if (p && p.type.kind === 'var-or-const') return Math.floor((p.type.min + p.type.max) / 2);
  return 1;
}

/** Build a single-instrument test for (op, mode). Producers (sine) feed every
 *  variable input from v2 up; the op writes v1. `mode[i]` = is var-or-const param i a variable. */
export function opInstrument(opCode: number, mode: boolean[], name = `op${opCode}`): OpInstrument {
  const voc = varOrConstParams(opCode);
  const vs = varSourceParams(opCode);
  const slots: Slot[] = [];
  let nextVar = 2; // v1 reserved for the op output
  const alloc = (): number => { const v = Math.min(nextVar, 4); nextVar += 1; return v; };

  const op: Slot = { ...emptySlot(), fn: opCode, outVar: 1 };

  for (const field of vs) {                 // var-source: always a producer
    const pv = alloc();
    slots.push(producerSlot(pv));
    (op[field] as number) = pv;
  }
  voc.forEach((vp, i) => {                   // var-or-const: mid const, or producer var in V mode
    (op[vp.value] as number) = midConst(opCode, vp.value);
    if (mode[i]) { const pv = alloc(); slots.push(producerSlot(pv)); (op[vp.selector] as number) = pv; }
    else (op[vp.selector] as number) = 0;
  });

  slots.push(op);
  const instrument = emptyInstrument(name);
  instrument.sampleLength = CALIB_SAMPLE_LENGTH;
  instrument.slots = slots;
  return { instrument, producerCount: slots.length - 1 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd funklang && npx vitest run sizelab/corpus/op-instruments.test.ts` and `npm run typecheck`
Expected: PASS. (`op[field] as number` assignments may need `(op as Record<keyof Slot, number>)[field] = pv` if TS objects to indexed assignment under `exactOptionalPropertyTypes`; adjust the cast minimally if so.)

- [ ] **Step 5: Commit**

```bash
git add funklang/sizelab/corpus/op-instruments.ts funklang/sizelab/corpus/op-instruments.test.ts
git commit -m "feat(sizelab): op-instrument builder (producers + mode)"
```

---

## Task 3: corpus spec (assemble all families)

**Files:**
- Create: `funklang/sizelab/corpus/corpus-spec.ts`
- Test: `funklang/sizelab/corpus/corpus-spec.test.ts`

Assembles the full `CorpusItem[]`. `REGULAR_OPS = [1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,19,21]` (OP_ARGS ops; bespoke 17/18/20/23 deferred, 22 loop_gen and 24 vocoder excluded). Families: producer-only; per-op-per-mode (single instrument each); a scaffold (all REGULAR_OPS const in one patch); two-phase (a few ops used twice in one instrument); imports; sample-length.

- [ ] **Step 1: Write the failing test**

```typescript
// funklang/sizelab/corpus/corpus-spec.test.ts
import { describe, it, expect } from 'vitest';
import { buildCorpus, REGULAR_OPS } from './corpus-spec';

describe('buildCorpus', () => {
  const corpus = buildCorpus();

  it('has unique ids and every item is a non-empty patch', () => {
    const ids = corpus.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const c of corpus) expect(c.patch.instruments.some((i) => i.slots.length > 0)).toBe(true);
  });

  it('includes a producer-only item and a scaffold covering every regular op', () => {
    expect(corpus.find((c) => c.id === 'producer')).toBeTruthy();
    const scaffold = corpus.find((c) => c.id === 'scaffold')!;
    const ops = new Set(scaffold.measured.map((m) => m.op));
    for (const op of REGULAR_OPS) expect(ops.has(op), `scaffold covers op ${op}`).toBe(true);
  });

  it('covers every regular op in at least one per-op-mode item', () => {
    const measuredOps = new Set(corpus.flatMap((c) => c.measured.map((m) => m.op)));
    for (const op of REGULAR_OPS) expect(measuredOps.has(op), `op ${op} measured`).toBe(true);
  });

  it('includes import-byte variety and sample-length variety', () => {
    expect(corpus.some((c) => c.importBytes > 0)).toBe(true);
    const lens = new Set(corpus.filter((c) => c.id.startsWith('samplelen')).map((c) => c.id));
    expect(lens.size).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd funklang && npx vitest run sizelab/corpus/corpus-spec.test.ts`
Expected: FAIL — cannot resolve `./corpus-spec`.

- [ ] **Step 3: Write the implementation**

```typescript
// funklang/sizelab/corpus/corpus-spec.ts
import { emptyPatch, type Patch } from '../../src/patch/types';
import { opInstrument, CALIB_SAMPLE_LENGTH } from './op-instruments';
import { modesFor, modeId } from './modes';

/** OP_ARGS regular ops (bespoke 17/18/20/23, loop_gen 22, vocoder 24 excluded). */
export const REGULAR_OPS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 19, 21];

export interface PhaseDesc { op: number; mode: string; }
export interface CorpusItem {
  id: string;
  patch: Patch;
  measured: PhaseDesc[];   // op phases under test (excludes sine producers)
  producerCount: number;   // total sine producer phases in the patch
  importBytes: number;
  note?: string;
}

/** Place one instrument at index `k` of a fresh patch. */
function single(instr: ReturnType<typeof opInstrument>['instrument']): Patch {
  const p = emptyPatch();
  p.instruments[0] = instr;
  return p;
}

export function buildCorpus(): CorpusItem[] {
  const items: CorpusItem[] = [];

  // 1) producer-only: one sine phase (gives P_sin).
  {
    const { instrument, producerCount } = opInstrument(4, [false, false], 'producer'); // osc_sine cc
    items.push({ id: 'producer', patch: single(instrument), measured: [{ op: 4, mode: 'cc' }], producerCount, importBytes: 0 });
  }

  // 2) per-op-per-mode single-instrument items.
  for (const op of REGULAR_OPS) {
    for (const mode of modesFor(op)) {
      const mid = modeId(mode);
      const { instrument, producerCount } = opInstrument(op, mode);
      items.push({ id: `op${op}_${mid}`, patch: single(instrument), measured: [{ op, mode: mid }], producerCount, importBytes: 0 });
    }
  }

  // 3) scaffold: every regular op once (const), one per instrument.
  {
    const p = emptyPatch();
    const measured: PhaseDesc[] = [];
    let producers = 0;
    REGULAR_OPS.forEach((op, idx) => {
      const constMode = modesFor(op)[0]!; // all-const
      const { instrument, producerCount } = opInstrument(op, constMode, `s${op}`);
      p.instruments[idx] = instrument;
      measured.push({ op, mode: modeId(constMode) });
      producers += producerCount;
    });
    items.push({ id: 'scaffold', patch: p, measured, producerCount: producers, importBytes: 0 });
  }

  // 4) two-phase: a few ops used twice in ONE instrument (separates per-type routine from per-phase).
  for (const op of [2, 7, 12, 15]) {
    const a = opInstrument(op, modesFor(op)[0]!, `two${op}`);
    const b = opInstrument(op, modesFor(op)[0]!);
    // append b's op phase (and its producers) after a's slots, re-homing producer vars is unnecessary
    // because both use the same v-layout; the second op also writes v1.
    const instrument = a.instrument;
    instrument.slots = [...a.instrument.slots, ...b.instrument.slots];
    items.push({
      id: `twophase_op${op}`, patch: single(instrument),
      measured: [{ op, mode: modeId(modesFor(op)[0]!) }, { op, mode: modeId(modesFor(op)[0]!) }],
      producerCount: a.producerCount + b.producerCount, importBytes: 0,
    });
  }

  // 5) imports: an osc_saw instrument plus N imported-sample bytes (exercises Isamp.raw size).
  for (const bytes of [256, 4096, 32768]) {
    const { instrument } = opInstrument(2, [false, false], 'imp');
    const p = single(instrument);
    p.importedSamples[0]!.data = Int8Array.from(Array.from({ length: bytes }, (_, i) => (i % 251) - 125));
    items.push({ id: `imports_${bytes}`, patch: p, measured: [{ op: 2, mode: 'cc' }], producerCount: 0, importBytes: bytes });
  }

  // 6) sample-length neutrality: same op, different sampleLength.
  for (const len of [4, CALIB_SAMPLE_LENGTH, 131070]) {
    const { instrument } = opInstrument(2, [false, false], 'len');
    instrument.sampleLength = len;
    items.push({ id: `samplelen_${len}`, patch: single(instrument), measured: [{ op: 2, mode: 'cc' }], producerCount: 0, importBytes: 0 });
  }

  return items;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd funklang && npx vitest run sizelab/corpus/corpus-spec.test.ts` and `npm run typecheck`
Expected: PASS (4 tests). If a generated patch trips a constraint (e.g. an op whose op-instrument needs >4 vars), the test "non-empty patch" still passes but note any op that can't be built and exclude it from REGULAR_OPS with a comment.

- [ ] **Step 5: Commit**

```bash
git add funklang/sizelab/corpus/corpus-spec.ts funklang/sizelab/corpus/corpus-spec.test.ts
git commit -m "feat(sizelab): assemble calibration corpus (families + descriptors)"
```

---

## Task 4: measurements CSV

**Files:**
- Create: `funklang/sizelab/corpus/measurements-csv.ts`
- Test: `funklang/sizelab/corpus/measurements-csv.test.ts`

One row per item: `id, measured(JSON), producerCount, importBytes, uncompressed, shrinkled`. `measured` is JSON-encoded (commas inside a quoted field) so the CSV stays simple.

- [ ] **Step 1: Write the failing test**

```typescript
// funklang/sizelab/corpus/measurements-csv.test.ts
import { describe, it, expect } from 'vitest';
import { toCsv, parseCsv, type MeasurementRow } from './measurements-csv';

const rows: MeasurementRow[] = [
  { id: 'producer', measured: [{ op: 4, mode: 'cc' }], producerCount: 0, importBytes: 0, uncompressed: 13000, shrinkled: 4300 },
  { id: 'op2_Vc', measured: [{ op: 2, mode: 'Vc' }], producerCount: 1, importBytes: 0, uncompressed: 13100, shrinkled: 4350 },
];

describe('measurements csv', () => {
  it('round-trips rows through toCsv/parseCsv', () => {
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });
  it('has a header line and one row per measurement', () => {
    const lines = toCsv(rows).trim().split('\n');
    expect(lines[0]).toBe('id,measured,producerCount,importBytes,uncompressed,shrinkled');
    expect(lines).toHaveLength(1 + rows.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd funklang && npx vitest run sizelab/corpus/measurements-csv.test.ts`
Expected: FAIL — cannot resolve `./measurements-csv`.

- [ ] **Step 3: Write the implementation**

```typescript
// funklang/sizelab/corpus/measurements-csv.ts
import type { PhaseDesc } from './corpus-spec';

export interface MeasurementRow {
  id: string;
  measured: PhaseDesc[];
  producerCount: number;
  importBytes: number;
  uncompressed: number;
  shrinkled: number;
}

const HEADER = 'id,measured,producerCount,importBytes,uncompressed,shrinkled';

export function toCsv(rows: MeasurementRow[]): string {
  const body = rows.map((r) =>
    [r.id, JSON.stringify(JSON.stringify(r.measured)), r.producerCount, r.importBytes, r.uncompressed, r.shrinkled].join(','),
  );
  return [HEADER, ...body].join('\n') + '\n';
}

export function parseCsv(csv: string): MeasurementRow[] {
  const lines = csv.trim().split('\n');
  return lines.slice(1).map((line) => {
    // measured is a JSON-quoted field (starts with `"`); split carefully.
    const firstComma = line.indexOf(',');
    const id = line.slice(0, firstComma);
    const rest = line.slice(firstComma + 1);
    const m = /^("(?:[^"\\]|\\.)*"),(\d+),(\d+),(\d+),(\d+)$/.exec(rest);
    if (!m) throw new Error(`bad csv row: ${line}`);
    const measured = JSON.parse(JSON.parse(m[1]!)) as PhaseDesc[];
    return {
      id, measured,
      producerCount: Number(m[2]), importBytes: Number(m[3]),
      uncompressed: Number(m[4]), shrinkled: Number(m[5]),
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd funklang && npx vitest run sizelab/corpus/measurements-csv.test.ts` and `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add funklang/sizelab/corpus/measurements-csv.ts funklang/sizelab/corpus/measurements-csv.test.ts
git commit -m "feat(sizelab): measurements CSV (de)serialization"
```

---

## Task 5: runner + real corpus run

**Files:**
- Create: `funklang/sizelab/corpus/run-corpus.ts`
- Modify: `funklang/package.json`
- Produce + commit: `funklang/sizelab/corpus/measurements.csv`

- [ ] **Step 1: Write the runner**

```typescript
// funklang/sizelab/corpus/run-corpus.ts
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCorpus } from './corpus-spec';
import { compilePatch } from '../harness/compile';
import { toCsv, type MeasurementRow } from './measurements-csv';

async function main(): Promise<void> {
  const corpus = buildCorpus();
  const rows: MeasurementRow[] = [];
  let i = 0;
  for (const item of corpus) {
    i += 1;
    const r = await compilePatch(item.patch);
    if (!r.ok) { console.error(`[${i}/${corpus.length}] ${item.id} FAILED: ${r.error?.slice(0, 200)}`); continue; }
    rows.push({
      id: item.id, measured: item.measured, producerCount: item.producerCount,
      importBytes: item.importBytes, uncompressed: r.uncompressed!, shrinkled: r.shrinkled!,
    });
    console.log(`[${i}/${corpus.length}] ${item.id}: ${r.uncompressed} / ${r.shrinkled}`);
  }
  const out = join(import.meta.dirname, 'measurements.csv');
  writeFileSync(out, toCsv(rows));
  console.log(`wrote ${rows.length}/${corpus.length} measurements → ${out}`);
}

void main();
```

- [ ] **Step 2: Add the npm script**

In `funklang/package.json` `"scripts"`, add:
```json
    "corpus:run": "nix-shell -p wineWowPackages.stable --run 'tsx sizelab/corpus/run-corpus.ts'",
```

- [ ] **Step 3: Run the corpus (real, slow — minutes, needs wine)**

Run: `cd funklang && npm run corpus:run`
Expected: prints `[n/total] id: <uncompressed> / <shrinkled>` per item, then `wrote N/total measurements`. The first compile provisions wineWow + the sandbox/prefix (one-time). Watch for FAILED lines — a handful of failures is acceptable data (logged, skipped), but if MANY fail, STOP and report (likely an op-instrument build bug to fix in Task 2/3, not a calibration result).

- [ ] **Step 4: Sanity-check the data**

Run: `cd funklang && head -5 sizelab/corpus/measurements.csv && wc -l sizelab/corpus/measurements.csv`
Expected: a header + ~80–110 rows, sizes in a plausible range (≈13000–20000 uncompressed, ≈4000–7000 shrinkled). Spot-check: the `producer` row and `samplelen_*` rows should have near-identical uncompressed sizes to each other (sample length is exe-neutral) — a quick confidence signal that the method holds.

- [ ] **Step 5: Commit the runner, script, and the measurement data**

```bash
git add funklang/sizelab/corpus/run-corpus.ts funklang/package.json funklang/sizelab/corpus/measurements.csv
git commit -m "feat(sizelab): corpus runner + committed measurements.csv"
```

> Committing `measurements.csv` is deliberate: it's deterministic data that lets the fitter (sub-project 4) run without wine, the same way the GUI reference captures were committed.

---

## Task 6: gate

**Files:** none (verification)

- [ ] **Step 1: Typecheck + full unit suite (wine-free)**

Run: `cd funklang && npm run typecheck && npx vitest run`
Expected: typecheck clean; all tests pass (corpus generator tests included; the compile smoke test still skips without `SIZELAB_COMPILE_SMOKE`). Pre-existing `tests/dsp/perf.test.ts` may flap under load — not a regression.

- [ ] **Step 2: Commit any fixups**

```bash
git add -A && git commit -m "chore(sizelab): corpus gate green" || echo "nothing to commit"
```

---

## Self-Review

**Spec coverage:**
- Standard sine producer + P_sin item → Task 1 + Task 3 (`producer`). ✓
- Per-op-per-mode measurement (op-metadata-driven) → Tasks 1–3. ✓
- Scaffold (all routines once) → Task 3. ✓
- Two-phase separation of routine vs per-phase → Task 3 (`twophase_*`). ✓
- Imports (covers `imported`/op 20) + sample-length neutrality → Task 3. ✓
- Records `{id, measured, producerCount, importBytes, uncompressed, shrinkled}` CSV → Task 4 + Task 5. ✓
- Automated, ~100 compiles, one nix-shell → Task 5 (`corpus:run`). ✓
- Both sizes recorded for the compression model → Tasks 4/5. ✓
- Deferred (documented): bespoke clone/chordgen/adsr; value-bucket effects. ✓

**Placeholder scan:** none — complete code/commands throughout. The two `>`-notes (TS cast fallback in Task 2; commit-data rationale in Task 5) are explicit guidance, not deferrals.

**Type consistency:** `PhaseDesc`/`CorpusItem` (Task 3) reused by `MeasurementRow` (Task 4) and the runner (Task 5). `opInstrument`/`CALIB_SAMPLE_LENGTH` (Task 2) used in Task 3. `modesFor`/`modeId`/`varOrConstParams`/`varSourceParams` (Task 1) used in Tasks 2/3. `producerSlot` (Task 1) used in Task 2. `compilePatch` (existing harness) used in Task 5. `toCsv`/`parseCsv` (Task 4) used in Task 5.

**Risk noted:** if `-Ofast` whole-program optimization makes per-phase cost non-additive, the scaffold/two-phase/per-op rows will disagree — that's *data the fitter reports as residual error*, not a corpus bug. The corpus's job is only to gather honest measurements; sub-project 4 interprets them.
