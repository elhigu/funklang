# Size & Memory Estimator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show, live in the editor, an estimate of the shrinklered exe-size contribution of a patch's sample-generation code (plus an uncompressed figure and resident chip-RAM), with a click-to-expand breakdown and per-slot byte annotations on the selected instrument — without compiling.

**Architecture:** A pure-TS core (`src/sizecalc/`) computes everything from a `Patch` using a committed `calibration-data.ts` constant table (hand-seeded now; replaced by fitted values from an offline `tools/calibrate-exe-size.ts` later). The UI extends the existing `<footer>` status bar, adds a breakdown modal, and annotates slot rows. Exe-size uses a linear model where op-routine code cost is paid once per distinct op type used (LTO dead-code elimination); the per-slot annotation reflects that marginal cost.

**Tech Stack:** TypeScript, Vite, Vitest (unit, jsdom), Playwright (e2e). Pure functions over the existing `Patch`/`PatchModel`/`op-metadata` modules.

**Spec:** `funklang/docs/superpowers/specs/2026-06-03-size-memory-estimator-design.md`

---

## File Structure

- Create `funklang/src/sizecalc/calibration-data.ts` — fitted-constant table + types (seeded).
- Create `funklang/src/sizecalc/chip-ram.ts` — exact resident chip-RAM from a `Patch`.
- Create `funklang/src/sizecalc/exe-size.ts` — calibrated uncompressed + shrinkled exe-size estimate.
- Create `funklang/src/sizecalc/breakdown.ts` — totals + per-instrument + per-slot marginal detail + op-types-used.
- Create `funklang/src/ui/size-statusbar.ts` — populates footer size cells; opens the modal.
- Create `funklang/src/ui/size-breakdown-modal.ts` — click-to-expand full breakdown.
- Create `funklang/src/ui/annotate-slot-sizes.ts` — injects per-slot byte cost into slot-grid rows.
- Create `funklang/tools/calibrate-exe-size.ts` — offline Node/tsx calibration script.
- Modify `funklang/src/ui/app.ts` — footer markup + wire the three UI pieces to model/selection events.
- Modify `funklang/src/ui/help-modal.ts` — document the new size readout (UX-change rule).
- Modify `funklang/package.json` — add `calibrate-exe-size` script.
- Tests under `funklang/tests/sizecalc/` and `funklang/tests/ui/`.

### Shared predicate (used across the core)

A slot "has an op" iff `slot.fn !== 0`. This is the same emptiness test the editor uses to hide rows (`renderSlotGrid`, slot-grid.ts:140,164). The estimator counts such slots for stream-cost and op-type purposes regardless of `outVar`. Documented once here; every task references it.

---

## Task 1: Calibration data module (seeded constants)

**Files:**
- Create: `funklang/src/sizecalc/calibration-data.ts`
- Test: `funklang/tests/sizecalc/calibration-data.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// funklang/tests/sizecalc/calibration-data.test.ts
import { describe, it, expect } from 'vitest';
import { CALIBRATION } from '../../src/sizecalc/calibration-data';
import { OP_DEFS } from '../../src/schema/op-metadata';

describe('CALIBRATION seed table', () => {
  it('has the required top-level fields', () => {
    expect(typeof CALIBRATION.base).toBe('number');
    expect(typeof CALIBRATION.slotStreamCost).toBe('number');
    expect(typeof CALIBRATION.modLengthEmpty).toBe('number');
    expect(CALIBRATION.shrink).toBeTypeOf('object');
    expect(typeof CALIBRATION.shrink.base).toBe('number');
    expect(typeof CALIBRATION.shrink.codeRatio).toBe('number');
    expect(typeof CALIBRATION.shrink.impRatio).toBe('number');
    expect(typeof CALIBRATION.fitted).toBe('boolean');
  });

  it('seeds an opCost entry for every known op code', () => {
    for (const def of OP_DEFS) {
      expect(CALIBRATION.opCost[def.code], `op ${def.code} (${def.name})`).toBeTypeOf('number');
    }
  });

  it('ships unfitted until the calibration tool runs', () => {
    expect(CALIBRATION.fitted).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd funklang && npx vitest run tests/sizecalc/calibration-data.test.ts`
Expected: FAIL — cannot resolve `../../src/sizecalc/calibration-data`.

- [ ] **Step 3: Write the module**

```typescript
// funklang/src/sizecalc/calibration-data.ts
//
// Fitted-constant table for the size estimator. SEED VALUES ONLY until
// `npm run calibrate-exe-size` measures the real corpus and rewrites this
// file. While `fitted === false` the UI marks figures as rough.
//
// Units: bytes. `*Ratio` are compressed/uncompressed fractions for Shrinkler.
import { OP_DEFS } from '../schema/op-metadata';

export interface ShrinkModel {
  /** Fixed shrinklered overhead present in every build. */
  base: number;
  /** Compressed-bytes-per-uncompressed-byte for code+stream. */
  codeRatio: number;
  /** Compressed-bytes-per-uncompressed-byte for baked-in imported samples. */
  impRatio: number;
}

export interface FitQuality {
  meanErrUncompressed: number;
  maxErrUncompressed: number;
  meanErrShrinkled: number;
  maxErrShrinkled: number;
}

export interface CalibrationData {
  /** Uncompressed intercept: player code, framework, always-linked routines. */
  base: number;
  /** Uncompressed op-stream bytes added per slot that has an op. */
  slotStreamCost: number;
  /** Uncompressed code bytes pulled in by the FIRST use of each op code. */
  opCost: Record<number, number>;
  /** Chip bytes of the empty ProTracker module template (memcpy'd at runtime). */
  modLengthEmpty: number;
  shrink: ShrinkModel;
  /** False while seeded; the calibration tool sets it true and fills `fit`. */
  fitted: boolean;
  /** Residual error of the model vs the corpus (zeros while unfitted). */
  fit: FitQuality;
}

// Flat seed: every op assumed to pull the same code until measured.
const SEED_OP_COST = 256;
const seedOpCost: Record<number, number> = {};
for (const def of OP_DEFS) seedOpCost[def.code] = SEED_OP_COST;

export const CALIBRATION: CalibrationData = {
  base: 3000,
  slotStreamCost: 64,
  opCost: seedOpCost,
  modLengthEmpty: 1084, // standard MOD header; remeasure during calibration
  shrink: { base: 1000, codeRatio: 0.45, impRatio: 0.55 },
  fitted: false,
  fit: { meanErrUncompressed: 0, maxErrUncompressed: 0, meanErrShrinkled: 0, maxErrShrinkled: 0 },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd funklang && npx vitest run tests/sizecalc/calibration-data.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add funklang/src/sizecalc/calibration-data.ts funklang/tests/sizecalc/calibration-data.test.ts
git commit -m "feat(funklang): seeded calibration-data table for size estimator"
```

---

## Task 2: Chip-RAM calculation (exact)

**Files:**
- Create: `funklang/src/sizecalc/chip-ram.ts`
- Test: `funklang/tests/sizecalc/chip-ram.test.ts`

Resident chip = `modLengthEmpty + Σ max(0, sampleLength) + Σ importedSamples[i].data.length`
(`main-executable.c:479-481`). `SmpLength[i]` is the allocation stride = `ins.sampleLength` (the renderer's `bytes.length` is `sampleLength+1` for the inclusive tap, but the contiguous chip stride is `SmpLength` — see spec). Negative sampleLength clamps to 0.

- [ ] **Step 1: Write the failing test**

```typescript
// funklang/tests/sizecalc/chip-ram.test.ts
import { describe, it, expect } from 'vitest';
import { emptyPatch } from '../../src/patch/types';
import { chipUsage } from '../../src/sizecalc/chip-ram';

describe('chipUsage', () => {
  it('an empty patch costs only the mod template', () => {
    const u = chipUsage(emptyPatch(), 1084);
    expect(u.sampleBytes).toBe(0);
    expect(u.importBytes).toBe(0);
    expect(u.modBytes).toBe(1084);
    expect(u.residentTotal).toBe(1084);
  });

  it('sums sampleLength over instruments and import byte lengths', () => {
    const p = emptyPatch();
    p.instruments[0]!.sampleLength = 12288;
    p.instruments[1]!.sampleLength = 2048;
    p.importedSamples[0]!.data = new Int8Array(500);
    p.importedSamples[3]!.data = new Int8Array(20);
    const u = chipUsage(p, 1084);
    expect(u.sampleBytes).toBe(12288 + 2048);
    expect(u.importBytes).toBe(520);
    expect(u.residentTotal).toBe(1084 + 14336 + 520);
  });

  it('clamps negative sampleLength to zero', () => {
    const p = emptyPatch();
    p.instruments[0]!.sampleLength = -5;
    expect(chipUsage(p, 0).sampleBytes).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd funklang && npx vitest run tests/sizecalc/chip-ram.test.ts`
Expected: FAIL — cannot resolve `chip-ram`.

- [ ] **Step 3: Write the implementation**

```typescript
// funklang/src/sizecalc/chip-ram.ts
//
// Exact resident (play-time) chip-RAM usage of a patch, mirroring the
// AllocMem calls in exe_creator/main-executable.c:479-481. All MEMF_CHIP.
// The transient 24*2048*2 precalc work buffer is intentionally excluded
// (see spec): it is freed before playback and assumed to fit.
import type { Patch } from '../patch/types';

export interface ChipUsage {
  /** Σ generated-sample bytes (allocation stride = sampleLength per instrument). */
  sampleBytes: number;
  /** Σ imported-sample bytes baked into chip. */
  importBytes: number;
  /** Empty ProTracker module template bytes. */
  modBytes: number;
  /** Total resident chip-RAM. */
  residentTotal: number;
}

export function chipUsage(patch: Patch, modLengthEmpty: number): ChipUsage {
  let sampleBytes = 0;
  for (const ins of patch.instruments) {
    sampleBytes += Math.max(0, ins.sampleLength | 0);
  }
  let importBytes = 0;
  for (const s of patch.importedSamples) {
    importBytes += s.data.length;
  }
  const modBytes = modLengthEmpty | 0;
  return { sampleBytes, importBytes, modBytes, residentTotal: sampleBytes + importBytes + modBytes };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd funklang && npx vitest run tests/sizecalc/chip-ram.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add funklang/src/sizecalc/chip-ram.ts funklang/tests/sizecalc/chip-ram.test.ts
git commit -m "feat(funklang): exact resident chip-RAM estimate"
```

---

## Task 3: Exe-size estimate (calibrated linear model)

**Files:**
- Create: `funklang/src/sizecalc/exe-size.ts`
- Test: `funklang/tests/sizecalc/exe-size.test.ts`

Model (spec §"The model"):
```
distinctOps      = unique slot.fn over all slots with fn !== 0
nOpSlots         = count of slots with fn !== 0
opCodeBytes      = Σ_{fn in distinctOps} (cal.opCost[fn] ?? 0)
slotStreamBytes  = nOpSlots * cal.slotStreamCost
importBytes      = Σ importedSamples[i].data.length
uncompressed     = cal.base + opCodeBytes + slotStreamBytes + importBytes
shrinkled        = cal.shrink.base
                 + (cal.base + opCodeBytes + slotStreamBytes) * cal.shrink.codeRatio
                 + importBytes * cal.shrink.impRatio
```

- [ ] **Step 1: Write the failing test**

```typescript
// funklang/tests/sizecalc/exe-size.test.ts
import { describe, it, expect } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import type { CalibrationData } from '../../src/sizecalc/calibration-data';
import { estimateExeSize } from '../../src/sizecalc/exe-size';

const CAL: CalibrationData = {
  base: 1000,
  slotStreamCost: 10,
  opCost: { 2: 200, 4: 300 },           // osc_saw=200, osc_sine=300
  modLengthEmpty: 0,
  shrink: { base: 100, codeRatio: 0.5, impRatio: 0.8 },
  fitted: true,
  fit: { meanErrUncompressed: 0, maxErrUncompressed: 0, meanErrShrinkled: 0, maxErrShrinkled: 0 },
};

function withSlots(fns: number[]) {
  const p = emptyPatch();
  p.instruments[0]!.slots = fns.map((fn) => ({ ...emptySlot(), fn, outVar: 1 }));
  return p;
}

describe('estimateExeSize', () => {
  it('counts each distinct op code once for code cost, every slot for stream', () => {
    const p = withSlots([2, 2, 4]);            // saw,saw,sine → distinct {2,4}
    const e = estimateExeSize(p, CAL);
    expect(e.opCodeBytes).toBe(200 + 300);     // saw once, sine once
    expect(e.slotStreamBytes).toBe(3 * 10);    // three op slots
    expect(e.uncompressed).toBe(1000 + 500 + 30 + 0);
  });

  it('ignores fn===0 slots entirely', () => {
    const p = withSlots([2, 0, 0]);
    const e = estimateExeSize(p, CAL);
    expect(e.opCodeBytes).toBe(200);
    expect(e.slotStreamBytes).toBe(10);
  });

  it('treats unknown op codes as zero code cost', () => {
    const p = withSlots([99]);
    expect(estimateExeSize(p, CAL).opCodeBytes).toBe(0);
  });

  it('adds imported-sample bytes and applies the split compression model', () => {
    const p = withSlots([2]);
    p.importedSamples[0]!.data = new Int8Array(1000);
    const e = estimateExeSize(p, CAL);
    expect(e.importBytes).toBe(1000);
    expect(e.uncompressed).toBe(1000 + 200 + 10 + 1000);
    // shrinkled = 100 + (1000+200+10)*0.5 + 1000*0.8
    expect(e.shrinkled).toBe(100 + 1210 * 0.5 + 800);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd funklang && npx vitest run tests/sizecalc/exe-size.test.ts`
Expected: FAIL — cannot resolve `exe-size`.

- [ ] **Step 3: Write the implementation**

```typescript
// funklang/src/sizecalc/exe-size.ts
//
// Estimated uncompressed compiled exe size + estimated shrinklered size of a
// patch's sample-generation code. Op-routine code cost is counted ONCE per
// distinct op type used (LTO -fwhole-program dead-code elimination strips
// unused routines). See spec §"Why these numbers diverge".
import type { Patch } from '../patch/types';
import type { CalibrationData } from './calibration-data';

export interface ExeSizeEstimate {
  uncompressed: number;
  shrinkled: number;
  // Components (for the breakdown view):
  base: number;
  opCodeBytes: number;
  slotStreamBytes: number;
  importBytes: number;
  /** Sorted distinct op codes that contributed code cost. */
  distinctOps: number[];
}

export function estimateExeSize(patch: Patch, cal: CalibrationData): ExeSizeEstimate {
  const distinct = new Set<number>();
  let nOpSlots = 0;
  for (const ins of patch.instruments) {
    for (const s of ins.slots) {
      if (s.fn === 0) continue;
      distinct.add(s.fn);
      nOpSlots++;
    }
  }
  let opCodeBytes = 0;
  for (const fn of distinct) opCodeBytes += cal.opCost[fn] ?? 0;

  const slotStreamBytes = nOpSlots * cal.slotStreamCost;

  let importBytes = 0;
  for (const s of patch.importedSamples) importBytes += s.data.length;

  const uncompressed = cal.base + opCodeBytes + slotStreamBytes + importBytes;
  const shrinkled =
    cal.shrink.base +
    (cal.base + opCodeBytes + slotStreamBytes) * cal.shrink.codeRatio +
    importBytes * cal.shrink.impRatio;

  return {
    uncompressed,
    shrinkled,
    base: cal.base,
    opCodeBytes,
    slotStreamBytes,
    importBytes,
    distinctOps: [...distinct].sort((a, b) => a - b),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd funklang && npx vitest run tests/sizecalc/exe-size.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add funklang/src/sizecalc/exe-size.ts funklang/tests/sizecalc/exe-size.test.ts
git commit -m "feat(funklang): calibrated exe-size estimate (uncompressed + shrinkled)"
```

---

## Task 4: Breakdown (totals + per-instrument + per-slot marginal)

**Files:**
- Create: `funklang/src/sizecalc/breakdown.ts`
- Test: `funklang/tests/sizecalc/breakdown.test.ts`

Marginal attribution: walk instruments ascending, slots ascending. The FIRST slot (patch-wide) with a given `fn` is `firstUse` and carries `cal.opCost[fn]`; later slots with that `fn` carry only `slotStreamCost`. Per-instrument `uncompressed` = Σ its slots' marginal; per-instrument `shrinkled` = `uncompressed * cal.shrink.codeRatio` (no base, no imports — those are patch-global).

- [ ] **Step 1: Write the failing test**

```typescript
// funklang/tests/sizecalc/breakdown.test.ts
import { describe, it, expect } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import type { CalibrationData } from '../../src/sizecalc/calibration-data';
import { computeBreakdown } from '../../src/sizecalc/breakdown';

const CAL: CalibrationData = {
  base: 1000, slotStreamCost: 10,
  opCost: { 2: 200, 4: 300 },
  modLengthEmpty: 1084,
  shrink: { base: 100, codeRatio: 0.5, impRatio: 0.8 },
  fitted: true,
  fit: { meanErrUncompressed: 0, maxErrUncompressed: 0, meanErrShrinkled: 0, maxErrShrinkled: 0 },
};

describe('computeBreakdown', () => {
  it('marks first patch-wide use of an op as the code-cost owner', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1 }]; // saw (first use)
    p.instruments[1]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1 }]; // saw (reuse)
    const b = computeBreakdown(p, CAL);

    const i0 = b.perInstrument[0]!;
    const i1 = b.perInstrument[1]!;
    expect(i0.slots[0]!.firstUse).toBe(true);
    expect(i0.slots[0]!.codeBytes).toBe(200);
    expect(i0.slots[0]!.marginalUncompressed).toBe(200 + 10);
    expect(i1.slots[0]!.firstUse).toBe(false);
    expect(i1.slots[0]!.codeBytes).toBe(0);
    expect(i1.slots[0]!.marginalUncompressed).toBe(10);
  });

  it('reports op-types-used with names and per-instrument shrinkled', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [
      { ...emptySlot(), fn: 2, outVar: 1 },
      { ...emptySlot(), fn: 4, outVar: 1 },
    ];
    const b = computeBreakdown(p, CAL);
    expect(b.opTypesUsed.map((o) => o.fn)).toEqual([2, 4]);
    expect(b.opTypesUsed.find((o) => o.fn === 2)!.name).toBe('osc_saw');
    // instr0 uncompressed = 200 + 300 + 2*10 = 520; shrinkled = 520*0.5
    expect(b.perInstrument[0]!.uncompressed).toBe(520);
    expect(b.perInstrument[0]!.shrinkled).toBe(260);
  });

  it('embeds the patch totals (exe + chip) it was built from', () => {
    const p = emptyPatch();
    p.instruments[0]!.sampleLength = 2048;
    const b = computeBreakdown(p, CAL);
    expect(b.chip.residentTotal).toBe(1084 + 2048);
    expect(b.exe.uncompressed).toBe(1000); // no op slots → just base
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd funklang && npx vitest run tests/sizecalc/breakdown.test.ts`
Expected: FAIL — cannot resolve `breakdown`.

- [ ] **Step 3: Write the implementation**

```typescript
// funklang/src/sizecalc/breakdown.ts
//
// Full attribution for the size readout: patch totals, per-instrument
// figures, per-slot MARGINAL cost (op code counted once at its first
// patch-wide use), and the op-types-used list.
import type { Patch } from '../patch/types';
import type { CalibrationData } from './calibration-data';
import { chipUsage, type ChipUsage } from './chip-ram';
import { estimateExeSize, type ExeSizeEstimate } from './exe-size';
import { opByCode } from '../schema/op-metadata';

export interface SlotCost {
  slotIdx: number;
  fn: number;
  opName: string;
  /** True iff this is the first patch-wide slot using `fn`. */
  firstUse: boolean;
  /** Op-routine code bytes (only on firstUse, else 0). */
  codeBytes: number;
  /** Op-stream bytes for this slot. */
  streamBytes: number;
  /** codeBytes + streamBytes. */
  marginalUncompressed: number;
}

export interface InstrumentBreakdown {
  instrIdx: number;
  /** Generated-sample chip bytes for this instrument (sampleLength). */
  sampleBytes: number;
  /** Σ marginalUncompressed of its op slots. */
  uncompressed: number;
  /** uncompressed * codeRatio. */
  shrinkled: number;
  slots: SlotCost[];
}

export interface PatchBreakdown {
  exe: ExeSizeEstimate;
  chip: ChipUsage;
  perInstrument: InstrumentBreakdown[];
  opTypesUsed: Array<{ fn: number; name: string; codeBytes: number }>;
}

export function computeBreakdown(patch: Patch, cal: CalibrationData): PatchBreakdown {
  const seen = new Set<number>();
  const perInstrument: InstrumentBreakdown[] = [];

  for (let instrIdx = 0; instrIdx < patch.instruments.length; instrIdx++) {
    const ins = patch.instruments[instrIdx]!;
    const slots: SlotCost[] = [];
    let uncompressed = 0;
    for (let slotIdx = 0; slotIdx < ins.slots.length; slotIdx++) {
      const s = ins.slots[slotIdx]!;
      if (s.fn === 0) continue;
      const firstUse = !seen.has(s.fn);
      if (firstUse) seen.add(s.fn);
      const codeBytes = firstUse ? (cal.opCost[s.fn] ?? 0) : 0;
      const streamBytes = cal.slotStreamCost;
      const marginalUncompressed = codeBytes + streamBytes;
      uncompressed += marginalUncompressed;
      slots.push({
        slotIdx,
        fn: s.fn,
        opName: opByCode(s.fn)?.name ?? `op${s.fn}`,
        firstUse,
        codeBytes,
        streamBytes,
        marginalUncompressed,
      });
    }
    perInstrument.push({
      instrIdx,
      sampleBytes: Math.max(0, ins.sampleLength | 0),
      uncompressed,
      shrinkled: uncompressed * cal.shrink.codeRatio,
      slots,
    });
  }

  const exe = estimateExeSize(patch, cal);
  const opTypesUsed = exe.distinctOps.map((fn) => ({
    fn,
    name: opByCode(fn)?.name ?? `op${fn}`,
    codeBytes: cal.opCost[fn] ?? 0,
  }));

  return { exe, chip: chipUsage(patch, cal.modLengthEmpty), perInstrument, opTypesUsed };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd funklang && npx vitest run tests/sizecalc/breakdown.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add funklang/src/sizecalc/breakdown.ts funklang/tests/sizecalc/breakdown.test.ts
git commit -m "feat(funklang): size breakdown with per-slot marginal attribution"
```

---

## Task 5: Byte formatting helper

**Files:**
- Create: `funklang/src/sizecalc/format.ts`
- Test: `funklang/tests/sizecalc/format.test.ts`

Shared formatter so the status bar, modal, and slot annotations render bytes consistently.

- [ ] **Step 1: Write the failing test**

```typescript
// funklang/tests/sizecalc/format.test.ts
import { describe, it, expect } from 'vitest';
import { fmtBytes } from '../../src/sizecalc/format';

describe('fmtBytes', () => {
  it('shows raw bytes below 1024', () => {
    expect(fmtBytes(0)).toBe('0 B');
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(1023)).toBe('1023 B');
  });
  it('shows one-decimal kB at and above 1024', () => {
    expect(fmtBytes(1024)).toBe('1.0 kB');
    expect(fmtBytes(1536)).toBe('1.5 kB');
    expect(fmtBytes(12288)).toBe('12.0 kB');
  });
  it('rounds estimate fractions to whole bytes first', () => {
    expect(fmtBytes(1209.6)).toBe('1.2 kB');
    expect(fmtBytes(700.4)).toBe('700 B');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd funklang && npx vitest run tests/sizecalc/format.test.ts`
Expected: FAIL — cannot resolve `format`.

- [ ] **Step 3: Write the implementation**

```typescript
// funklang/src/sizecalc/format.ts
/** Human-readable byte size: raw bytes < 1 kB, else one-decimal kB. */
export function fmtBytes(n: number): string {
  const b = Math.round(n);
  if (b < 1024) return `${b} B`;
  return `${(b / 1024).toFixed(1)} kB`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd funklang && npx vitest run tests/sizecalc/format.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add funklang/src/sizecalc/format.ts funklang/tests/sizecalc/format.test.ts
git commit -m "feat(funklang): shared byte-size formatter"
```

---

## Task 6: Breakdown modal

**Files:**
- Create: `funklang/src/ui/size-breakdown-modal.ts`
- Test: `funklang/tests/ui/size-breakdown-modal.test.ts`

Mirrors the help-modal pattern (`help-modal.ts`): an overlay element toggled by `hidden` class, outside-click closes. Content rebuilt from a `PatchBreakdown` each time it opens.

- [ ] **Step 1: Write the failing test**

```typescript
// funklang/tests/ui/size-breakdown-modal.test.ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import { CALIBRATION } from '../../src/sizecalc/calibration-data';
import { computeBreakdown } from '../../src/sizecalc/breakdown';
import { mountBreakdownModal } from '../../src/ui/size-breakdown-modal';

describe('breakdown modal', () => {
  let root: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  it('is hidden until opened and shows op-types-used rows when open', () => {
    const modal = mountBreakdownModal(root);
    const overlay = root.querySelector('#size-breakdown-overlay') as HTMLElement;
    expect(overlay.classList.contains('hidden')).toBe(true);

    const p = emptyPatch();
    p.instruments[0]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1 }];
    modal.open(computeBreakdown(p, CALIBRATION));
    expect(overlay.classList.contains('hidden')).toBe(false);
    expect(overlay.textContent).toContain('osc_saw');
  });

  it('shows a rough-estimate notice while calibration is unfitted', () => {
    const modal = mountBreakdownModal(root);
    modal.open(computeBreakdown(emptyPatch(), CALIBRATION)); // CALIBRATION.fitted === false
    const overlay = root.querySelector('#size-breakdown-overlay') as HTMLElement;
    expect(overlay.textContent!.toLowerCase()).toContain('rough');
  });

  it('closes on outside click', () => {
    const modal = mountBreakdownModal(root);
    modal.open(computeBreakdown(emptyPatch(), CALIBRATION));
    const overlay = root.querySelector('#size-breakdown-overlay') as HTMLElement;
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(overlay.classList.contains('hidden')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd funklang && npx vitest run tests/ui/size-breakdown-modal.test.ts`
Expected: FAIL — cannot resolve `size-breakdown-modal`.

- [ ] **Step 3: Write the implementation**

```typescript
// funklang/src/ui/size-breakdown-modal.ts
//
// Click-to-expand breakdown of the size estimate. Presentation only; it
// renders a PatchBreakdown handed to open(). Pattern follows help-modal.ts.
import type { PatchBreakdown } from '../sizecalc/breakdown';
import { CALIBRATION } from '../sizecalc/calibration-data';
import { fmtBytes } from '../sizecalc/format';

export interface BreakdownModal {
  open(b: PatchBreakdown): void;
  close(): void;
  isOpen(): boolean;
}

/** Create the overlay inside `root` and return control handles. */
export function mountBreakdownModal(root: HTMLElement): BreakdownModal {
  const overlay = document.createElement('div');
  overlay.id = 'size-breakdown-overlay';
  overlay.className = 'size-breakdown-overlay hidden';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  root.appendChild(overlay);

  const close = (): void => overlay.classList.add('hidden');
  const isOpen = (): boolean => !overlay.classList.contains('hidden');

  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) close();
  });

  const open = (b: PatchBreakdown): void => {
    const rough = CALIBRATION.fitted
      ? `±${fmtBytes(CALIBRATION.fit.meanErrShrinkled)} typical (max ${fmtBytes(CALIBRATION.fit.maxErrShrinkled)})`
      : 'rough — calibration not yet run';

    const opRows = b.opTypesUsed
      .map((o) => `<tr><td>${o.name}</td><td class="num">${fmtBytes(o.codeBytes)}</td></tr>`)
      .join('');

    const instrRows = b.perInstrument
      .filter((i) => i.slots.length > 0 || i.sampleBytes > 0)
      .map(
        (i) =>
          `<tr><td>${String(i.instrIdx + 1).padStart(2, '0')}</td>` +
          `<td class="num">${fmtBytes(i.shrinkled)}</td>` +
          `<td class="num">${fmtBytes(i.uncompressed)}</td>` +
          `<td class="num">${fmtBytes(i.sampleBytes)}</td></tr>`,
      )
      .join('');

    overlay.innerHTML = `
      <div class="size-breakdown-inner" role="document">
        <header><h2>SIZE BREAKDOWN</h2><button id="size-breakdown-close" aria-label="Close">✕</button></header>
        <p class="size-breakdown-note">Estimate (${rough}). Generated samples cost no exe bytes — only imports and the synth program do.</p>
        <section>
          <h3>Totals</h3>
          <table>
            <tr><td>exe (shrinkled, est.)</td><td class="num">${fmtBytes(b.exe.shrinkled)}</td></tr>
            <tr><td>exe (uncompressed, est.)</td><td class="num">${fmtBytes(b.exe.uncompressed)}</td></tr>
            <tr><td>· base</td><td class="num">${fmtBytes(b.exe.base)}</td></tr>
            <tr><td>· op code</td><td class="num">${fmtBytes(b.exe.opCodeBytes)}</td></tr>
            <tr><td>· op stream</td><td class="num">${fmtBytes(b.exe.slotStreamBytes)}</td></tr>
            <tr><td>· imported samples</td><td class="num">${fmtBytes(b.exe.importBytes)}</td></tr>
            <tr><td>chip-RAM (resident)</td><td class="num">${fmtBytes(b.chip.residentTotal)}</td></tr>
          </table>
        </section>
        <section>
          <h3>Op types used (code paid once each)</h3>
          <table><tr><th>op</th><th class="num">code</th></tr>${opRows || '<tr><td colspan="2">none</td></tr>'}</table>
        </section>
        <section>
          <h3>Per instrument</h3>
          <table>
            <tr><th>#</th><th class="num">shrinkled</th><th class="num">uncompressed</th><th class="num">sample chip</th></tr>
            ${instrRows || '<tr><td colspan="4">none</td></tr>'}
          </table>
        </section>
      </div>`;
    (overlay.querySelector('#size-breakdown-close') as HTMLButtonElement).addEventListener('click', close);
    overlay.classList.remove('hidden');
  };

  return { open, close, isOpen };
}
```

- [ ] **Step 4: Add minimal styles**

Append to `funklang/src/ui/styles.css`:

```css
/* Size breakdown modal */
.size-breakdown-overlay {
  position: fixed; inset: 0; display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.6); z-index: 50;
}
.size-breakdown-overlay.hidden { display: none; }
.size-breakdown-inner {
  background: #11141a; color: #cdd; border: 1px solid #2a3140; padding: 1rem 1.25rem;
  max-height: 80vh; overflow: auto; min-width: 22rem; font: 12px/1.4 monospace;
}
.size-breakdown-inner header { display: flex; justify-content: space-between; align-items: center; }
.size-breakdown-inner table { width: 100%; border-collapse: collapse; margin: 0.25rem 0 0.75rem; }
.size-breakdown-inner td, .size-breakdown-inner th { padding: 1px 6px; text-align: left; }
.size-breakdown-inner .num { text-align: right; font-variant-numeric: tabular-nums; }
.size-breakdown-note { opacity: 0.8; }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd funklang && npx vitest run tests/ui/size-breakdown-modal.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add funklang/src/ui/size-breakdown-modal.ts funklang/src/ui/styles.css funklang/tests/ui/size-breakdown-modal.test.ts
git commit -m "feat(funklang): size breakdown modal"
```

---

## Task 7: Footer status bar

**Files:**
- Modify: `funklang/src/ui/app.ts` (footer markup, lines 126-135)
- Create: `funklang/src/ui/size-statusbar.ts`
- Test: `funklang/tests/ui/size-statusbar.test.ts`

The bar reads `model.patch` + a selected-instrument accessor, recomputes the breakdown, writes totals + selected-instrument figures into footer cells, and opens the modal on click.

- [ ] **Step 1: Add the footer element in app.ts**

Replace the empty left cell of the footer (app.ts:127, the `<div></div>` immediately after `<footer>`) with:

```html
        <button id="size-status" class="size-status" title="Click for size breakdown">—</button>
```

- [ ] **Step 2: Write the failing test**

```typescript
// funklang/tests/ui/size-statusbar.test.ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import { PatchModel } from '../../src/patch/model';
import { wireSizeStatusbar } from '../../src/ui/size-statusbar';

describe('size status bar', () => {
  let root: HTMLElement;
  let btn: HTMLButtonElement;
  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    btn = document.createElement('button');
    btn.id = 'size-status';
    root.appendChild(btn);
    document.body.appendChild(root);
  });

  it('renders exe + chip totals and the selected instrument figure', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1 }];
    const model = new PatchModel(p);
    let sel = 0;
    wireSizeStatusbar(root, model, () => sel);
    expect(btn.textContent).toMatch(/exe/);
    expect(btn.textContent).toMatch(/chip/);
    expect(btn.textContent).toMatch(/sel/);
  });

  it('refreshes when the model emits a change', () => {
    const p = emptyPatch();
    const model = new PatchModel(p);
    wireSizeStatusbar(root, model, () => 0);
    const before = btn.textContent;
    model.insertSlot(0, 0, { ...emptySlot(), fn: 2, outVar: 1 });
    expect(btn.textContent).not.toBe(before);
  });

  it('opens the breakdown modal on click', () => {
    const model = new PatchModel(emptyPatch());
    wireSizeStatusbar(root, model, () => 0);
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const overlay = root.querySelector('#size-breakdown-overlay') as HTMLElement;
    expect(overlay).toBeTruthy();
    expect(overlay.classList.contains('hidden')).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd funklang && npx vitest run tests/ui/size-statusbar.test.ts`
Expected: FAIL — cannot resolve `size-statusbar`.

- [ ] **Step 4: Write the implementation**

```typescript
// funklang/src/ui/size-statusbar.ts
//
// Populates the footer size readout and owns the breakdown modal. Recomputes
// on every PatchModel change and whenever the host calls refresh() (e.g. on
// selection change). Extends the existing <footer> (app.ts) — not a new bar.
import type { PatchModel } from '../patch/model';
import { computeBreakdown } from '../sizecalc/breakdown';
import { CALIBRATION } from '../sizecalc/calibration-data';
import { fmtBytes } from '../sizecalc/format';
import { mountBreakdownModal } from './size-breakdown-modal';

export interface SizeStatusbar {
  /** Recompute and repaint (call after selection changes). */
  refresh(): void;
}

export function wireSizeStatusbar(
  root: HTMLElement,
  model: PatchModel,
  getSelectedInstr: () => number,
): SizeStatusbar {
  const btn = root.querySelector('#size-status') as HTMLButtonElement;
  const modal = mountBreakdownModal(root);

  const refresh = (): void => {
    const b = computeBreakdown(model.patch, CALIBRATION);
    const selIdx = getSelectedInstr();
    const sel = b.perInstrument[selIdx];
    const rough = CALIBRATION.fitted ? '' : '~';
    const selTxt = sel ? `${rough}${fmtBytes(sel.shrinkled)}` : '—';
    btn.textContent =
      `exe ${rough}${fmtBytes(b.exe.shrinkled)} ` +
      `(sel ${selTxt}) · chip ${fmtBytes(b.chip.residentTotal)}`;
  };

  btn.addEventListener('click', () => {
    modal.open(computeBreakdown(model.patch, CALIBRATION));
  });

  model.events.on(() => refresh());
  refresh();

  return { refresh };
}
```

- [ ] **Step 5: Add status styles**

Append to `funklang/src/ui/styles.css`:

```css
.size-status {
  background: none; border: none; color: inherit; font: inherit; cursor: pointer;
  padding: 0 0.5rem; white-space: nowrap; font-variant-numeric: tabular-nums;
}
.size-status:hover { text-decoration: underline; }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd funklang && npx vitest run tests/ui/size-statusbar.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add funklang/src/ui/size-statusbar.ts funklang/src/ui/app.ts funklang/src/ui/styles.css funklang/tests/ui/size-statusbar.test.ts
git commit -m "feat(funklang): footer size status bar + modal trigger"
```

---

## Task 8: Per-slot byte annotation

**Files:**
- Create: `funklang/src/ui/annotate-slot-sizes.ts`
- Test: `funklang/tests/ui/annotate-slot-sizes.test.ts`

Walks the slot-grid DOM (`.slots > .slot-wrap > .slot[data-model-slot]`, same traversal as `updateSlotWaves`, slot-grid.ts:66-93), and writes each slot's marginal cost into a `[data-slot-size]` span (created if missing). Uses the selected instrument's `InstrumentBreakdown`.

- [ ] **Step 1: Write the failing test**

```typescript
// funklang/tests/ui/annotate-slot-sizes.test.ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { emptyPatch, emptySlot } from '../../src/patch/types';
import { CALIBRATION } from '../../src/sizecalc/calibration-data';
import { computeBreakdown } from '../../src/sizecalc/breakdown';
import { annotateSlotSizes } from '../../src/ui/annotate-slot-sizes';

function gridWithSlots(modelIdxs: number[]): HTMLElement {
  const host = document.createElement('div');
  const slots = document.createElement('div');
  slots.className = 'slots';
  for (const idx of modelIdxs) {
    const wrap = document.createElement('div');
    wrap.className = 'slot-wrap';
    const slot = document.createElement('div');
    slot.className = 'slot';
    slot.dataset['modelSlot'] = String(idx);
    wrap.appendChild(slot);
    slots.appendChild(wrap);
  }
  host.appendChild(slots);
  return host;
}

describe('annotateSlotSizes', () => {
  let host: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('writes the marginal byte cost into each slot row', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [
      { ...emptySlot(), fn: 2, outVar: 1 }, // saw, firstUse → 256+64 (seed)
      { ...emptySlot(), fn: 2, outVar: 1 }, // saw reuse → 64
    ];
    host = gridWithSlots([0, 1]);
    document.body.appendChild(host);
    const b = computeBreakdown(p, CALIBRATION);
    annotateSlotSizes(host, b.perInstrument[0]!);

    const labels = host.querySelectorAll('[data-slot-size]');
    expect(labels.length).toBe(2);
    // seed: opCost=256, slotStreamCost=64 → firstUse 320 B, reuse 64 B
    expect(labels[0]!.textContent).toContain('320 B');
    expect(labels[1]!.textContent).toContain('64 B');
  });

  it('marks reused ops so the first-use cost is visually distinct', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [
      { ...emptySlot(), fn: 2, outVar: 1 },
      { ...emptySlot(), fn: 2, outVar: 1 },
    ];
    host = gridWithSlots([0, 1]);
    document.body.appendChild(host);
    const b = computeBreakdown(p, CALIBRATION);
    annotateSlotSizes(host, b.perInstrument[0]!);
    const labels = host.querySelectorAll('[data-slot-size]');
    expect((labels[0] as HTMLElement).dataset['firstUse']).toBe('1');
    expect((labels[1] as HTMLElement).dataset['firstUse']).toBe('0');
  });

  it('is idempotent — re-annotating does not duplicate the span', () => {
    const p = emptyPatch();
    p.instruments[0]!.slots = [{ ...emptySlot(), fn: 2, outVar: 1 }];
    host = gridWithSlots([0]);
    document.body.appendChild(host);
    const b = computeBreakdown(p, CALIBRATION);
    annotateSlotSizes(host, b.perInstrument[0]!);
    annotateSlotSizes(host, b.perInstrument[0]!);
    expect(host.querySelectorAll('[data-slot-size]').length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd funklang && npx vitest run tests/ui/annotate-slot-sizes.test.ts`
Expected: FAIL — cannot resolve `annotate-slot-sizes`.

- [ ] **Step 3: Write the implementation**

```typescript
// funklang/src/ui/annotate-slot-sizes.ts
//
// Injects the per-slot marginal byte cost into slot-grid rows. Same DOM
// traversal as updateSlotWaves (slot-grid.ts): `.slots > .slot-wrap > .slot`
// keyed by data-model-slot. The op-code cost is shown only on the first
// patch-wide use of each op (firstUse), so reused ops read near-free.
import type { InstrumentBreakdown } from '../sizecalc/breakdown';
import { fmtBytes } from '../sizecalc/format';

export function annotateSlotSizes(host: HTMLElement, instr: InstrumentBreakdown): void {
  const slotsRoot = host.querySelector(':scope > .slots');
  if (!slotsRoot) return;
  const byModelIdx = new Map<number, InstrumentBreakdown['slots'][number]>();
  for (const sc of instr.slots) byModelIdx.set(sc.slotIdx, sc);

  const wraps = slotsRoot.querySelectorAll(':scope > .slot-wrap');
  for (const w of Array.from(wraps)) {
    const slotEl = (w as HTMLElement).querySelector(':scope > .slot') as HTMLElement | null;
    if (!slotEl) continue;
    const idxStr = slotEl.dataset['modelSlot'];
    if (idxStr === undefined) continue;
    const modelIdx = parseInt(idxStr, 10);
    const cost = byModelIdx.get(modelIdx);
    if (!cost) continue;

    let label = slotEl.querySelector('[data-slot-size]') as HTMLElement | null;
    if (!label) {
      label = document.createElement('span');
      label.className = 'slot-size';
      label.setAttribute('data-slot-size', '');
      slotEl.appendChild(label);
    }
    label.dataset['firstUse'] = cost.firstUse ? '1' : '0';
    label.title = cost.firstUse
      ? `${fmtBytes(cost.codeBytes)} op code (first use) + ${fmtBytes(cost.streamBytes)} stream`
      : `${fmtBytes(cost.streamBytes)} stream (op code already counted)`;
    label.textContent = fmtBytes(cost.marginalUncompressed);
  }
}
```

- [ ] **Step 4: Add slot-size styles**

Append to `funklang/src/ui/styles.css`:

```css
.slot-size {
  font: 10px/1 monospace; opacity: 0.65; padding: 0 4px; font-variant-numeric: tabular-nums;
}
.slot-size[data-first-use="1"] { opacity: 0.95; color: #e9c46a; }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd funklang && npx vitest run tests/ui/annotate-slot-sizes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add funklang/src/ui/annotate-slot-sizes.ts funklang/src/ui/styles.css funklang/tests/ui/annotate-slot-sizes.test.ts
git commit -m "feat(funklang): per-slot marginal byte annotation"
```

---

## Task 9: Wire the UI into app.ts

**Files:**
- Modify: `funklang/src/ui/app.ts`

Connect the status bar and slot annotation to the live editor: instantiate the status bar, refresh it on selection changes, and annotate slot rows after each render of the selected instrument.

- [ ] **Step 1: Import the new modules**

Near the other `./` UI imports at the top of app.ts (e.g. after the `help-modal` import at app.ts:15), add:

```typescript
import { wireSizeStatusbar } from './size-statusbar';
import { annotateSlotSizes } from './annotate-slot-sizes';
import { computeBreakdown } from '../sizecalc/breakdown';
import { CALIBRATION } from '../sizecalc/calibration-data';
```

- [ ] **Step 2: Instantiate the status bar after the model + state exist**

After `updateLabels` is defined and the model event subscription is set up (near app.ts:745, before `model.events.on(...)`), add:

```typescript
  const sizeBar = wireSizeStatusbar(root, model, () => state.selection.instrIdx);
```

- [ ] **Step 3: Refresh the bar on selection change**

Inside `updateLabels` (app.ts:709-731), add as the last statement before its closing brace:

```typescript
    sizeBar.refresh();
```

- [ ] **Step 4: Annotate slot rows after the active instrument renders**

Find the function that paints the main slot grid for the active instrument (`renderMain`, referenced at app.ts:751,782). Immediately after it (re)builds the grid host, add an annotation call. Add this helper near the other render helpers and call it at the end of `renderMain`:

```typescript
  const annotateActiveSizes = (): void => {
    const gridHost = mainEl.querySelector('.slot-grid-host') as HTMLElement | null
      ?? (mainEl.querySelector('.slots')?.parentElement as HTMLElement | null);
    if (!gridHost) return;
    const b = computeBreakdown(model.patch, CALIBRATION);
    const instr = b.perInstrument[state.activeIdx];
    if (instr) annotateSlotSizes(gridHost, instr);
  };
```

Call `annotateActiveSizes();` at the end of `renderMain()` and also after `scheduleRender`/`runRender` completes a render of the active instrument (wherever `updateSlotWaves` is currently invoked — annotation should follow the same trigger as the waveform refresh).

> NOTE for the implementer: the exact selector for the grid host depends on how `renderMain` mounts `renderSlotGrid`. Inspect `renderMain` and reuse whatever element it passes as the `renderSlotGrid` root (the element whose child is `.slots`). If a class other than `.slot-grid-host` is used, match it; the fallback (`.slots`→parent) covers the common case.

- [ ] **Step 5: Typecheck and run the full unit suite**

Run: `cd funklang && npm run typecheck && npx vitest run`
Expected: typecheck clean; all tests PASS.

- [ ] **Step 6: Manually verify in the dev server**

Run: `cd funklang && npm run dev`
Open the app, confirm: footer shows `exe ~X (sel ~Y) · chip Z`; clicking it opens the breakdown modal; selecting an instrument with slots shows per-slot byte labels, with the first use of each op highlighted.

- [ ] **Step 7: Commit**

```bash
git add funklang/src/ui/app.ts
git commit -m "feat(funklang): wire size status bar + slot annotations into editor"
```

---

## Task 10: Update the in-app help modal (UX-change rule)

**Files:**
- Modify: `funklang/src/ui/help-modal.ts`

Per the project rule, any UX-behaviour change updates the help modal in the same body of work.

- [ ] **Step 1: Add a help section describing the size readout**

In `helpOverlayHtml()` (help-modal.ts:9+), add a new section block alongside the existing ones:

```html
        <section>
          <h3>Size &amp; memory readout</h3>
          <p>The footer shows the estimated <em>shrinklered</em> exe size of the
          sample-generation code, the figure for the selected instrument
          (<code>sel</code>), and resident chip-RAM. Click it for a full
          breakdown.</p>
          <p>Op-routine code is counted <strong>once per distinct op type</strong>:
          a slot's byte label shows full cost on the first use of an op
          (highlighted) and only the small stream cost when the op is reused.
          Generated samples cost no exe bytes; imported samples do. Figures are
          estimates (marked <code>~</code> until calibration has been run).</p>
        </section>
```

- [ ] **Step 2: Typecheck**

Run: `cd funklang && npm run typecheck`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add funklang/src/ui/help-modal.ts
git commit -m "docs(funklang): help modal covers the size & memory readout"
```

---

## Task 11: Offline calibration tool

**Files:**
- Create: `funklang/tools/calibrate-exe-size.ts`
- Modify: `funklang/package.json` (add script)

This is an offline Node/tsx script the user runs on their machine; it drives the existing wine pipeline, fits the constants, and rewrites `calibration-data.ts`. It has no unit test (it shells out to wine + gcc + Shrinkler). It must fail loudly with clear guidance if the toolchain is unavailable.

- [ ] **Step 1: Add the npm script**

In `funklang/package.json` `"scripts"`, add:

```json
    "calibrate-exe-size": "tsx tools/calibrate-exe-size.ts",
```

- [ ] **Step 2: Write the calibration script skeleton**

```typescript
// funklang/tools/calibrate-exe-size.ts
//
// OFFLINE calibration for src/sizecalc/calibration-data.ts. Runs the existing
// aklang exe pipeline (exe_creator/, via wine) over synthetic single-op
// patches + the real patches/*.akp corpus, fits the linear size model, and
// rewrites calibration-data.ts with measured constants + residual error.
//
// Requires: wine, the exe_creator toolchain (gcc/elf2hunk/Shrinkler). Run from
// the funklang/ directory:  npm run calibrate-exe-size
//
// NOT shipped to the browser. Pure offline measurement.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { OP_DEFS } from '../src/schema/op-metadata';

const REPO_ROOT = resolve(import.meta.dirname, '..', '..');
const EXE_CREATOR = resolve(REPO_ROOT, 'exe_creator');

interface Sample { opBag: Record<number, number>; nOpSlots: number; impBytes: number; uncompressed: number; shrinkled: number; }

function ensureToolchain(): void {
  if (!existsSync(EXE_CREATOR)) {
    throw new Error(`exe_creator not found at ${EXE_CREATOR}`);
  }
  // TODO(impl): probe `wine --version`; if missing, print install guidance and exit 1.
}

// Build the feed for the pipeline from a Patch. Reuses the SAME header/script
// emission the "export amiga exe" effort produces (Iset.h/Ilen.h/Inst.h/
// Isamp.raw or aklang2asm script.txt). Until that exporter lands, this throws
// with a pointer to the spec so the dependency is explicit.
function emitPipelineInput(/* patch */): never {
  throw new Error(
    'calibration needs the patch→pipeline exporter (script.txt or Iset.h/Ilen.h/Inst.h/Isamp.raw).\n' +
    'See funklang/docs/superpowers/specs/2026-06-03-size-memory-estimator-design.md ' +
    '§"Calibration tool" — implement the exporter, then wire it here.',
  );
}

// Compile one prepared input through wine and return {uncompressed, shrinkled}.
function compileAndMeasure(/* inputDir */): { uncompressed: number; shrinkled: number } {
  // TODO(impl): run gnumake -f Makefile-executable (a.mingw.exe = uncompressed),
  // then Shrinkler → exemusic.exe (shrinkled). Record both file sizes via statSync.
  throw new Error('not implemented: wire to exe_creator Makefile + Shrinkler');
}

// Least-squares fit of base/slotStreamCost/opCost + shrink ratios from samples.
function fit(samples: Sample[]): void {
  // TODO(impl): isolate per-op code cost from single-op deltas, then solve the
  // overdetermined system for base/slotStreamCost; fit shrink.codeRatio/impRatio
  // and shrink.base. Compute mean/max residuals. Rewrite calibration-data.ts
  // with fitted:true and the fit{} block.
  void samples;
  throw new Error('not implemented: fit + rewrite calibration-data.ts');
}

function main(): void {
  ensureToolchain();
  const samples: Sample[] = [];
  // 1) synthetic: baseline + one patch per op type (emitPipelineInput → compileAndMeasure)
  for (const def of OP_DEFS) { void def; /* TODO build single-op patch */ }
  // 2) real corpus: patches/*.akp
  // 3) fit + write
  fit(samples);
  console.log('calibration complete');
}

main();
```

> This task intentionally lands the tool as a runnable, well-documented skeleton that fails with explicit guidance. Completing the TODOs depends on the shared patch→pipeline exporter (tracked with the "export amiga exe" effort). The shipped app does not depend on this tool — it runs on the seeded constants from Task 1 until calibration is completed.

- [ ] **Step 3: Verify the script is invokable and fails with the documented message**

Run: `cd funklang && npm run calibrate-exe-size`
Expected: exits non-zero with the "calibration needs the patch→pipeline exporter" (or toolchain/“not implemented”) message — confirming the entry point and dependency wiring are correct.

- [ ] **Step 4: Verify tsx is available (add if missing)**

Run: `cd funklang && npx tsx --version`
Expected: prints a version. If it errors, add tsx: `npm install -D tsx`, then re-run Step 3.

- [ ] **Step 5: Commit**

```bash
git add funklang/tools/calibrate-exe-size.ts funklang/package.json funklang/package-lock.json
git commit -m "feat(funklang): offline exe-size calibration tool skeleton"
```

---

## Task 12: Full gate

**Files:** none (verification)

- [ ] **Step 1: Run the project gate**

Run: `cd funklang && npm run gate`
Expected: `typecheck` clean, all unit tests PASS, e2e PASS. If an e2e test asserts on footer structure, update it to accommodate the new `#size-status` element.

- [ ] **Step 2: Commit any e2e adjustments**

```bash
git add funklang/tests-e2e
git commit -m "test(funklang): e2e covers footer size readout"
```

---

## Self-Review

**Spec coverage:**
- Headline shrinklered estimate + uncompressed → Task 3 (`estimateExeSize`), surfaced in Tasks 6/7.
- Resident chip-RAM (exact, excludes precalc buffer) → Task 2.
- Op code paid once per distinct type; per-slot marginal → Task 4 (`computeBreakdown`), Task 8 (annotation).
- Split compression model (code vs imports) → Task 3.
- Bottom-bar totals + selected-instrument figure → Task 7 (extends existing footer, per aligned spec).
- Click-to-breakdown → Task 6.
- Per-slot annotation on selected instrument → Task 8 + wiring Task 9.
- Calibration via offline tool, seeded constants meanwhile, fit-quality reported → Task 1 (seed + `fitted`/`fit`), Task 11 (tool), surfaced as "rough/±" in Tasks 6/7.
- WASM/`.bin`/`.prg`/pin-to-real out of scope → not implemented. ✓
- Help-modal update on UX change → Task 10. ✓

**Placeholder scan:** Task 11 intentionally ships a skeleton with `TODO(impl)` markers and throwing stubs — this is by design (offline tool gated on the shared exporter) and is documented as such; the shipped app does not depend on it. All other tasks contain complete code.

**Type consistency:** `CalibrationData`/`ShrinkModel`/`FitQuality` (Task 1) are reused verbatim in Tasks 3/4/6/7/8. `ExeSizeEstimate` (Task 3) consumed by Task 4/6. `ChipUsage` (Task 2) consumed by Task 4/6/7. `PatchBreakdown`/`InstrumentBreakdown`/`SlotCost` (Task 4) consumed by Tasks 6/7/8. `fmtBytes` (Task 5) used in 6/7/8. Function names: `chipUsage`, `estimateExeSize`, `computeBreakdown`, `mountBreakdownModal`, `wireSizeStatusbar`, `annotateSlotSizes` — consistent across definition and call sites.
