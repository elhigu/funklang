# Touch Value Tuner — plan (2026-06-09)

Touch-first value editing for funklang. On a touch device, a finger on any
slider opens a thumb-friendly modal instead of the (hopeless) 4px-bar drag.

## User-confirmed decisions
- **Activation:** auto only, per-interaction. Migrate the knob bar to Pointer
  Events; `pointerdown` with `pointerType === 'touch'` opens the tuner (and
  `preventDefault`s the synthetic mouse + direct drag). `mouse`/`pen` keep
  today's exact inline drag. No manual toggle. Desktop behaviour unchanged.
- **Swipe scope:** swipe up/down cycles through ALL param sliders of the
  active instrument, in (slot, param) order.
- **Rollers:** four rollers ±1 / ±10 / ±100 / ±1000. Drag = rotary stepping:
  each "notch" of drag distance applies that roller's step (clamped to range).
- **Undo:** one undo point per complete drag gesture, sealed on finger lift
  (via a new `HistoryManager.sealCoalesce()`).

## Modules (each pure piece unit-tested)
1. `src/ui/param-list.ts` (pure): `tunableParams(patch, instrIdx)` →
   ordered `TunableParam[] { slotIdx, field, label, min, max, step }`. Drives
   swipe navigation + neighbour hints. Also `paramIndex(list, slotIdx, field)`.
2. `src/ui/roller.ts` (pure): rotary-step math.
   `rollerSteps(dragPx, pxPerNotch)` → integer notch count (sign = direction);
   `applyStep(value, deltaSteps, step, min, max)` → clamped new value.
   `nextParamIndex(idx, len, dir)` → wrapped neighbour for swipe.
3. `src/patch/history.ts`: add `sealCoalesce()` (`this.lastKey = null`).
4. `src/ui/knob.ts`: mouse → pointer events; on touch, call injected
   `onTouchTune?(field)` and bail out of the inline-drag path.
5. `src/ui/touch-tuner.ts`: the modal. `openTouchTuner(opts)` builds the
   overlay (mirrors op-picker / size-breakdown-modal): header (instr/slot/op),
   live waveform canvas, active param row (label + big slider + value) with
   dimmed prev/next neighbour hints, four roller strips, close. Applies
   changes via `model.setSlotParam`; live-re-renders + redraws the wave;
   swipe up/down moves the active param; seals undo on each drag end.
6. `src/ui/app.ts`: wire knob → `openTouchTune` (pass model, history, a
   render fn, the tunable-param list, and the live-render callback).

## Live preview
Each change → `model.setSlotParam` → re-render the active instrument
(`renderInstrument`) → redraw the tuner canvas from the slot's tap
(`slotDisplayTap` / `audibleForTarget`). Reuse existing render path.

## Build increments (gate + commit each)
1. ✅ `param-list.ts` + `roller.ts` + `history.sealCoalesce()` + unit tests.
2. ✅ knob.ts pointer-event migration + `onTouchTune` hook.
3. ✅ `touch-tuner.ts` scaffold + rollers + undo-per-drag. Wired from app.ts. E2E.
4. ✅ Live waveform preview in the modal.
5. ✅ Swipe up/down navigation + dimmed neighbour hints.
6. ✅ Help-modal row.

DONE. Remaining polish needs real-device tuning (see below) — notably the
animated carousel scroll between params (currently a discrete swipe switch).

## Tests
- Unit: param-list ordering, roller step math, navigation wrap, sealCoalesce.
- E2E: Playwright `hasTouch` context; dispatch pointer events with
  `pointerType:'touch'`. Assert: touch opens tuner; rolling changes value;
  swipe changes active param; one undo per drag; **mouse drag still inline**.

## Needs real-device tuning (flag to user)
Feel constants — roller `pxPerNotch` sensitivity, swipe distance threshold,
scroll animation timing. Ship sensible defaults; expect iteration on hardware.
