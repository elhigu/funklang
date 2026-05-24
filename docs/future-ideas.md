# Future ideas

Loose backlog of UI / DSP ideas that are deliberately deferred. Pick one
up when there's appetite; document any decisions made along the way.

## Edit envelope shape from the per-slot waveform view

**User goal.** When the edit selection is on an envelope op (enva = 7,
envd = 8, adsr = 23), the small waveform tap on that slot row currently
shows the post-envelope signal (i.e. whatever the env multiplied with).
Make it ALSO show the envelope shape itself and let the user reshape it
by dragging control points instead of nudging individual knobs.

**How it would work.**

1. **Detection.** In `slot-grid.ts` / `wave-viewer.ts`, when the rendered
   op is an envelope op, derive the envelope's shape directly from the
   slot fields rather than (or layered on top of) the audio tap.
   - enva: linear ramp from 0 → `gainVal` over `val1Value` samples, then
     hold (until the next env event).
   - envd: ramp from `gainVal` → `val2Value` over `val1Value` samples.
   - adsr: 4-segment piecewise — attack (`val2Value` samples, 0 →
     `gainVal`), decay (`val1Value` samples, → sustain level `widthVal`),
     sustain (hold), release (`freqVal` samples, → 0).
2. **Rendering.** Overlay a brighter polyline on the existing waveform
   canvas (separate stroke colour, e.g. cyan), with small square handles
   at every inflection point.
3. **Dragging.** Each handle is one slot field:
   - X-axis drag → time-domain field (`val1Value`, `val2Value`, `freqVal`).
   - Y-axis drag → level field (`gainVal`, `widthVal`).
   Mapping pixels → field range uses the same per-op min/max already
   declared in `op-metadata.ts`.
4. **Write path.** On `pointermove` while dragging, throttle to ~16 ms
   and call `model.setSlotParam` per affected field. History coalescing
   (600 ms window per (instrIdx, slotIdx, field)) already collapses the
   whole drag into one undo entry — no new history work needed.
5. **Discoverability.** Handles only visible when the slot is the
   edit selection (`.slot.selected`); otherwise the overlay is a quiet
   tint so the row still reads as "this is an envelope".

**Why deferred.** Needs (a) per-op shape sampler, (b) hit-testing on a
small canvas, (c) min/max ranges per axis, (d) careful interaction with
the existing wave canvas which is currently a pure read-only display.
The knob row already exposes every field, so this is purely an
ergonomics improvement.
