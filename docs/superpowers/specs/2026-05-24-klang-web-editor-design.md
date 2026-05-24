# funklang — design

A web-based editor for AmigaKlang patches that replaces the WinForms GUI with a single-page browser app. All synthesis parameters for every step of an instrument are visible at once; any knob change re-renders the audio and replays instantly. The original `aklang2asm.exe` codegen stays as a black box for producing the actual Amiga binary.

## Project layout

All new code lives under [funklang/](../../../) at the repository root, kept separate from the original AmigaKlang artifacts (the `.exe`, `exe_creator/`, `patches/`, `songs/`, etc.) so the upstream tree stays untouched.

```
AmigaKlangGUI_V1-00/                 (repository root — untouched original)
├── AmigaKlangGUI.exe
├── exe_creator/                     (original Klang codegen tools)
├── patches/                         (original .akp test corpus)
├── songs/
├── readme.nfo
└── funklang/                        (all new work lives here)
    ├── editor-mockup.html           (early visual prototype)
    ├── docs/superpowers/specs/      (design docs)
    ├── src/                         (future: editor source)
    ├── tools/                       (future: refrender C harness)
    └── tests/                       (future)
```

---

## Goals

- **Faster edit–hear loop.** Every knob always visible; one-shot re-render and replay on every parameter change. No modal "edit" dialogs.
- **Per-step transparency.** Each slot shows its own waveform tap, so the signal can be inspected as it flows through the synth chain.
- **Audition any node.** Click any slot to make its output variable the audible signal; not just the final output.
- **Bit-exact preview.** JS DSP produces samples byte-identical to what Klang would produce on Amiga, validated against a reference C build of `synthnodes.h`.
- **Compatible with existing tools.** Reads and writes the same `.akp` / `.aki` binary formats; existing patches in [patches/](../../../../patches/) load and round-trip without loss.

## Non-Goals (v1)

- Real-time looping playback during edits (one-shot replay only).
- Visual signal-graph "wires" between slots (stretch goal for v2).
- Higher-level editor format (JSON-on-disk, inheritance metadata, etc.) — direct binary is sufficient because Klang's clone-sample operator already provides live inter-instrument references.
- File watching / auto-reload from external edits.
- Multi-user / cloud / collaboration features.
- Mobile or touch-first UI.
- Replacing `aklang2asm.exe` for producing the Amiga output.

## Background

AmigaKlang is a sample-synthesis tool used in Amiga demoscene productions. The existing Windows GUI ([AmigaKlangGUI.exe](../../../../AmigaKlangGUI.exe), .NET WinForms) exposes its parameters through modal edit panels — to tweak any slot's parameters you click an "Edit" button which opens a per-op panel, dismissing it to see the patch overview again. Comparing two slots' parameters requires opening them in sequence. This forces a mental-juggling workflow that gets in the way of fast iterative sound design.

The replacement editor presents the whole instrument's signal chain at a glance, with all parameters always live and the audio re-rendered the moment any value changes.

The original tool's codegen ([exe_creator/aklang2asm.exe](../../../../exe_creator/aklang2asm.exe)) is a separate headless step that turns a `.akp` into Amiga ASM. We do not replace this; the editor produces standard `.akp` files that `aklang2asm` consumes unchanged.

## Architecture

Single-page browser app, no server. Open via `file://` or any static HTTP serve. Five top-level modules with one-way data flow.

```
              ┌───────────────────────────┐
              │            UI             │
              │ (slot grid, knobs, waves) │
              └─────┬───────────────▲─────┘
       mutate ──────┘               │ change events
                    ▼               │
              ┌───────────────────────────┐
              │       Patch model         │
              │   (in-memory data + bus)  │
              └─────┬───────────────▲─────┘
       render ──────┘               │ render result
                    ▼               │
              ┌───────────────────────────┐
              │        DSP engine         │
              │  (port of synthnodes.h)   │
              └─────┬─────────────────────┘
                    │ Int16Array sample
                    ▼
              ┌───────────────────────────┐
              │       Audio player        │
              │     (Web Audio wrap)      │
              └───────────────────────────┘

           File I/O ↕ Patch model (load / save)
```

- **File I/O** — parses and serializes `.akp` / `.aki` binary
- **Patch model** — in-memory data (Section "Data Model"), plus a small mutator API and change-event bus
- **DSP engine** — pure-function bit-exact JS port of `synthnodes.h`; given a patch and an instrument index, returns the rendered sample plus per-slot taps
- **Audio player** — converts Int16 samples to AudioBuffers and plays one-shot; stops the previous voice cleanly on re-trigger
- **UI** — reads the Patch model, dispatches mutators, subscribes to change events, redraws waveform canvases and triggers audio playback

Persistence uses the File System Access API where available (direct save-back to the opened file) with a `<input type=file>` + download fallback.

**Tech stack:** deliberately deferred. The mockup is vanilla JS, which is enough for prototyping. A framework will be picked only when there is a concrete reason to use one (likely Svelte for its reactivity fit, but not committed).

## Data Model

The model is a direct 1:1 mirror of the `.akp` binary fields, as decoded from the WinForms `BinaryReader` / `BinaryWriter` calls in the decompiled `Form1` source. No higher-level wrapper.

```ts
// .akp = one Patch; .aki = a single Instrument extracted from one
type Patch = {
  magic: 0x02CEDA9F;               // .akp magic; .aki magic = 0x02CEDA9F + 1
  instruments: Instrument[];        // length 31 (sparse-ish: empty = all-zero slots)
  importedSamples: ImportedSample[]; // length 9 (raw 8-bit audio blobs)
};

type Instrument = {
  name: string;                     // from ComboBoxSampleAuswahl text
  sampleLength: number;             // Int32
  loopOffset: number;               // Int32
  loopLength: number;               // Int32
  slots: Slot[];                    // length up to 20 (Klang hard ceiling)
};

type Slot = {
  outVar: 0 | 1 | 2 | 3 | 4;       // arrayvar (0 = unused)
  fn: number;                       // arrayfunction (index into op table)
  freq: number;     freqVal: number;   // Int16 pair (also: clone transpose-type / transpose-value)
  gain: number;     gainVal: number;   // UByte pair (also: clone source-instr-index / reverse-flag)
  val1:  number;    val1Value: number; // Int16 pair
  val2:  number;    val2Value: number; // Int16 pair (also: clone offset)
  // width / widthVal / instance: declared as runtime fields in Form1 but not
  // clearly seen in the on-disk read loop. Verify during File I/O implementation
  // and either add here or drop from the model.
};

type ImportedSample = {
  length: number;                   // Int32
  data: Int8Array;                  // raw signed bytes
};
```

**Key choices:**

- **Slots are an ordered array.** Drag-reorder simply moves elements within the array; on save the serializer writes them in order. The 20-slot ceiling is enforced by the editor UI (no `[+]` insertion when at 20).
- **Each param is a value pair.** `freq`/`freqVal`, `val1`/`val1Value`, `val2`/`val2Value` follow Klang's source-type / literal-value convention: the first field encodes "where does the value come from" (literal, variable v1–v4, imported sample), the second is the literal value when applicable.
- **Mutations are direct.** Knob drag → `slots[i].freqVal = newVal` → DSP re-render. No event sourcing, no undo stack in v1.
- **Validation only on save.** Editor accepts any in-flight value while editing; serializer clamps to `Int16` / `UByte` ranges when writing `.akp`.

**Clone semantics (important).** Klang exposes "Clone Sample" as one of the operator types a slot can use. The clone op's parameters (`source instrument index`, `transpose`, `reverse`, `offset`) are stored in the same `arrayfrequency` / `arraygain` / `arraygainval` / `arrayval2value` slot fields that other ops use for their own parameters. At render time the clone op consumes the source instrument's *rendered sample* as a live reference — editing the source instrument changes the cloning instrument's rendered output too. This is Klang's natural mechanism for "build one instrument on top of another"; no extra editor metadata is needed.

## Modules & Data Flow

Each module is independently testable. Modules communicate only via the Patch model's change-event bus.

### File I/O — `fileio.ts`

```ts
parseAkp(bytes: Uint8Array): Patch
serializeAkp(p: Patch): Uint8Array
parseAki(bytes: Uint8Array): Instrument
serializeAki(i: Instrument): Uint8Array
```

Validates magic numbers. Clamps fields to their declared ranges on serialize. Throws on malformed input with byte offset of failure. No DOM, no audio dependencies.

### Patch model — `patch.ts`

Typed structures + mutators:

```ts
patch.setSlotParam(instrIdx, slotIdx, paramName, value)
patch.moveSlot(instrIdx, fromIdx, toIdx)
patch.insertSlot(instrIdx, atIdx, slot)
patch.removeSlot(instrIdx, idx)
patch.setInstrumentField(instrIdx, fieldName, value)
```

Emits `change` events shaped `{ instrIdx: number, kind: 'param' | 'structure' | 'meta' }`.

### DSP engine — `dsp.ts`

Pure port of `synthnodes.h` to JS. Int16 arithmetic; matches the C reference bit-for-bit.

```ts
renderInstrument(patch: Patch, instrIdx: number): {
  sample: Int16Array,
  slotTaps: Int16Array[]   // one per slot, same length as `sample`
}
```

**Cross-instrument dependency handling for clones:**

- Memoize per-instrument render results, keyed by an instrument-content-hash.
- When a slot has the clone op, recurse into the source instrument's render first.
- Cycle detection: depth-first traversal with a visited set; throw `CyclicCloneError` if instrument A references B references A.

Deterministic: same patch → identical output bytes. This property is what the bit-exact test suite leans on.

### Audio player — `player.ts`

Thin Web Audio wrapper:

```ts
play(sample: Int16Array, sampleRate: number): void
stop(): void
setMaster(gain: number): void
```

`play()` stops any currently-playing `AudioBufferSourceNode` before starting a new one (clean cut, no overlap on rapid re-trigger). Int16 → Float32 conversion is straight `v / 32768`.

### UI — `ui.ts` + components

- Reads from the Patch model, dispatches mutators.
- Subscribes to the change-event bus.
- On change for `instrIdx I`:
  1. Invalidate DSP cache for `I` plus any instrument transitively cloning `I` (maintain reverse-clone index: `Map<sourceIdx, Set<dependentIdx>>`).
  2. If `I` is currently visible, re-render its waveform canvases from the new `slotTaps`.
  3. If the audition target is in `I` (or in a dependent shown via an expanded clone block), call `player.play(sample, rate)` (debounced ~80ms).

### Full edit-cycle data flow

```
   knob drag (UI)
      │
      ▼
   patch.setSlotParam(I, S, "gainVal", v)
      │
      ├──▶ change event {instrIdx: I, kind: "param"}
      │       │
      │       ▼
      │   invalidate DSP cache for I + transitive dependents
      │       │
      │       ▼
      │   dsp.renderInstrument(patch, auditionTargetInstr)
      │       │ (may recurse through clones)
      │       ▼
      │   {sample, slotTaps}
      │       │
      │       ├──▶ player.play(sample, rate)
      │       └──▶ canvases redraw from slotTaps
```

Unidirectional. No two modules talk to each other except via the Patch-events bus.

## UX

The mockup at [editor-mockup.html](../../../editor-mockup.html) establishes the visual treatment (CRT-amber demoscene aesthetic). The following pins down behaviour.

### Slot grid

- Only filled slots are shown. No 20 empty placeholders.
- `[+]` insertion targets appear hover-revealed at the top, between rows, and at the bottom; click opens an operator picker.
- A `20/20` badge in the instrument header hides the `[+]` targets once the 20-slot ceiling is reached.
- All parameters of every visible slot are always live and visible. Never modal, never hidden behind an "Edit" button.
- Row layout: `# | output var | function | params (one knob per param) | per-slot waveform tap | drag handle`.

### Knob behaviour

- **Drag** (vertical): coarse, ~2 units/px on a 120 px gesture — fast roaming.
- **Shift-drag**: fine, 1 unit/px — precise tuning; full 0–255 range covered in 255 px of drag.
- **Mouse wheel** when hovering: ±1 per tick.
- **Arrow keys** when focused: ±1; Shift = ±10.
- **Double-click**: inline numeric editor — type exact value.
- **Right-click**: reset to default (pulled from `synthnodes.h` defaults / `Form1` designer values).
- Each Klang parameter is a value pair (source-type + literal-value); the editor surfaces this as a type-dropdown above the value knob.
- Out-of-range values turn red while editing; clamped on save.

### Audition + transport

- Click any non-empty slot to make its output variable the audition target. Magenta indicator on the slot; footer reads `audition → slot 07 · v4`.
- Knob change while auditioning: re-render → autoplay one-shot (debounced ~80 ms so dragging does not queue dozens of plays).
- Transport buttons: PLAY (one-shot manual trigger), STOP, RETRIG.
- No looping during edits in v1.

### Clone-block expansion

- A slot using the `clone` op renders with an expand toggle.
- Expanded: an inline panel below the row shows the source instrument's slots with full editor controls and a clear chrome marker (`↪ from instrument 03 "kick"`) so the user always knows they are editing a different instrument.
- Edits in an expanded parent block write through to the source instrument live (because Klang's clone is a live reference).
- Expansion is recursive but **collapsed by default at depth ≥ 2** — prevents view explosion when clones-of-clones exist.
- Cycle detection in the DSP engine surfaces in the UI as a red chip on the offending slot ("would create cycle through instrument N") rather than allowing expansion.

### Drag-to-reorder slots

- Grab handle on the slot # column (`⋮⋮` indicator on hover).
- Drop highlights the insertion line in magenta.
- Reorder mutates the `slots` array in place.

### Dedicated waveform viewer (separate component)

Distinct from the small per-slot taps. Lives in the instrument header area. Default target: the instrument's final output. Click any slot's tap to retarget the viewer there.

Features:
- Zoom (mouse wheel) and pan (drag).
- Loop region overlay: `loopOffset` / `loopLength` as a translucent magenta band with draggable edges.
- Scrub-to-position playback marker.
- Reusable inside expanded clone blocks: each shows its own viewer for the parent instrument's final output.

### File operations

The editor's working state is always exactly one Patch ("the current patch"). Single-instrument `.aki` files are treated as importable library items: loading one injects it into a slot in the current patch but does not change which file SAVE will write to.

- **NEW** — replaces the current patch with an empty one (31 empty instruments); the current-patch-file becomes unset (next SAVE will prompt for a path).
- **OPEN PATCH (.akp)** — replaces the current patch entirely; the current-patch-file becomes this `.akp`.
- **IMPORT INSTRUMENT (.aki)** — reads a single-instrument file and writes it into the currently-selected instrument slot of the current patch. Does not change the current-patch-file pointer.
- **EXPORT INSTRUMENT (.aki)** — writes the currently-selected instrument out as a `.aki` (for library use). Does not change the current-patch-file pointer.
- **SAVE** — writes the current patch back to its current-patch-file via the File System Access API, or prompts for a path if unset. Falls back to download in browsers without File System Access API.
- **SAVE AS .AKP** — always prompts for a path / triggers a download regardless of current-patch-file state.

### User-visible errors

- Malformed file on open → modal showing the first parsing error and its byte offset.
- Cyclic clone → red chip on the offending slot with the cycle description.
- Sample length exceeded → orange chip on the instrument header.

## Testing & Validation

The hard validation problem is **bit-exactness vs Klang**. Everything else is conventional.

### Bit-exact DSP validation

Klang's C source is already in this repository — both [exe_creator/synthnodes.h](../../../../exe_creator/synthnodes.h) (the operator implementations) and the render loop in [exe_creator/main-binary.c](../../../../exe_creator/main-binary.c) / [main-executable.c](../../../../exe_creator/main-executable.c). No Amiga emulator required.

- Build a small C harness (`tools/refrender.c`) that `#include`s `synthnodes.h`, takes a `.akp` path and an instrument index, runs the same render loop the Amiga binary would, writes raw Int16 samples to stdout.
- The JS DSP exposes the matching entry point: `renderInstrument(patch, idx) → Int16Array`.
- **Golden test:** for every patch in [patches/](../../../../patches/) × every non-empty instrument, run both renderers and `assert sha256(jsBytes) === sha256(cBytes)`. Any byte-level difference fails the suite.
- Diff harness: when a mismatch is found, print the first divergent sample index plus a small window around it, so the failing operator can be pinpointed.

### File I/O round-trip

- Parse each `.akp` in [patches/](../../../../patches/), serialize back, `assert bytes === original`. Proves the format is fully covered with no silently-dropped fields.
- Same for any extracted or synthesized `.aki` files.
- Property tests (`fast-check`): generate random Patches → serialize → parse → assert structural equality.

### DSP unit tests (per op)

- One file per operator (`tests/dsp/osc_saw.test.ts`, etc.).
- Each runs a handful of parameter combinations and asserts the first 256 sample bytes against checked-in golden buffers (also generated by the C harness for the first run).
- Fast to run; failures pinpoint a broken operator immediately.

### UI / interaction tests

- Vitest + jsdom for Patch model mutators (move slot, set param, validate ranges).
- Playwright for E2E: open a real `.akp`, drag a knob, assert audition fires; click a clone slot, expand, edit a parent param, assert the source instrument was updated; save, reopen, assert state preserved.
- Headless in CI; visual locally during development.

### Performance smoke tests

- Bench: render the largest patch in [patches/](../../../../patches/) (`Tecon - disco transmission.akp`, ~33 KB). Assert total render time < 50 ms on a midrange laptop. This is the budget required to keep knob-drag → audio latency snappy.

### Browser support

- Targets evergreen Chromium and Firefox. Both ship Web Audio API and File System Access API.
- No legacy-browser workarounds in v1.

## Open Items (to settle during implementation)

- **Which `arrayX` fields are actually serialized.** The decompile clearly shows `arrayvar` / `arrayfunction` / `arrayfrequency` / `arrayfrequencyval` / `arrayval1` / `arrayval1value` / `arrayval2` / `arrayval2value` / `loopoffset` / `looplength` in the read/write loop. The runtime also declares `arrayinstance` / `arraygain` / `arraygainval` / `arraywidth` / `arraywidthval` as fields, but they may not appear on disk. Settle this by careful re-read of the serialization code while writing the parser; round-trip tests will catch any miss.
- **Sample rate(s).** Klang renders at Paula-compatible rates that vary per instrument note. The audio player needs to pick a rate; likely just the per-instrument default with a way to override.
- **Op picker UX details** for the `[+]` insertion targets — flat list of ~20 ops vs grouped by category. Decide during UI implementation.
- **Numeric-entry double-click target.** Specifically: does it edit the literal-value field, or open a type picker? Lean toward editing the literal value (most common); type-pick stays in the dropdown above.

## Out of Scope (deferred to later versions)

- Visual signal-graph "wires" between slots (v2).
- Continuous looping playback during edits (v2 if useful).
- Auto-reload on external file change (only useful if a workflow emerges that wants it).
- Undo / redo (v2).
- Inheritance metadata as an editor-side higher-level format — not needed; Klang's clone-sample operator covers the use case.
- Mobile / touch input.
- Collaboration / cloud sync.
- Replacement of `aklang2asm.exe` for Amiga codegen.
