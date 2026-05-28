# Klang behaviour reference

Authoritative rules the original AmigaKlang enforces, as the user has
stated them. One entry per rule. Each ends with the helper / module that
enforces it in funklang, so the doc and the code stay in sync.

> **Process:** when the user states a new rule, append it here with the
> date and their exact phrasing first, the derived formula / examples
> second, and the enforcing module last.

---

## 2026-05-26 — Loop region (op22 loop_gen) constraints

> "Repeat length is actually not modifiable, it is always until the last
>  sample of the instrument. So only the repeat offset can be moved."
> "Sample length is always divisible by 2 and minimum loop offset is
>  sample length / 2. So loop can start from middle of the instrument,
>  not earlier. Also repeat offset must be divisible by 2."
> Examples (user-given):
> ```
> sample length 2:  offsets {0}
> sample length 4:  offsets {2}
> sample length 6:  offsets {2, 4}
> sample length 8:  offsets {4, 6}
> sample length 10: offsets {4, 6, 8}
> sample length 12: offsets {6, 8, 10}
> ```

Derived:
- `sampleLength % 2 === 0` (always even).
- `loopOffset % 2 === 0` (always even).
- `loopOffset ∈ [ floor(sampleLength / 4) * 2,  sampleLength - 2 ]`.
- `loopLength = sampleLength - loopOffset` (user does not pick it; it is
  not stored as a separate decision, even though the on-disk format
  still has the field — funklang writes the derived value).

Enforced by [funklang/src/patch/loop-rules.ts](../src/patch/loop-rules.ts),
covered by [funklang/tests/patch/loop-rules.test.ts](../tests/patch/loop-rules.test.ts).

---

## 2026-05-26 — Clone-source instrument ordering

> "Validation should prevent selecting clone source from any instrument
>  which has higher instrument number than the current one. So basically
>  instrument 1 cannot select anything for clone source. Instrument 2 can
>  clone instrument 1 etc."

Derived:
- A clone slot on instrument `N` (0-indexed: `N >= 1`) may only target
  source instruments at index `< N`.
- Instrument `0` (the first instrument) cannot have a clone slot with a
  valid source — clone slots there must be flagged invalid in the UI.

Enforced by [funklang/src/patch/clone-graph.ts](../src/patch/clone-graph.ts)
(`isValidCloneSource(activeIdx, candidateIdx)`) and by the instr-ref
widget in [funklang/src/ui/slot-grid.ts](../src/ui/slot-grid.ts), which
must hide / disable higher-or-equal indices.

---

## 2026-05-26 — Audition loop playback iterations

> "When playing looped sound just 2 loops is enough."

Derived: `FINAL_LOOP_REPEATS = 2` in [funklang/src/ui/app.ts](../src/ui/app.ts).

## 2026-05-29 — Imported sample + vocoder support status

> "Imported sample and vocoder are currently not supported. Actually I dont think
>  vocoder is going to be implemented at all."

Derived:
- `imported` (op 20, Klang docs call it "imported sample") is shown in the op-picker but disabled (`unsupported: true`).
- `vocoder` (op 24) IS in `OP_DEFS` so the picker can show it for existing patches, but it's marked `unsupported: true` and disabled. Klang's `synthnodes.h` has no codegen case for it either — funklang's engine no-ops the slot.
