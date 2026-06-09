// Undo/redo for PatchModel.
//
// HistoryManager observes model.events and pushes structuralClone snapshots
// of `model.patch` onto a past[] stack. Calling undo()/redo() restores a
// snapshot and emits a `{ kind: 'reset' }` event so listeners (the editor)
// can rebuild their entire UI.
//
// Coalescing: many rapid setSlotParam edits on the same (instrIdx, slotIdx,
// field) — e.g. a knob drag — collapse into a single history entry as long
// as new events keep arriving within COALESCE_WINDOW_MS of the last one.

import type { PatchModel } from './model';
import type { Patch } from './types';

export const COALESCE_WINDOW_MS = 600;

interface CoalesceKey {
  instrIdx: number;
  slotIdx: number;
  field: string;
}

function keysEqual(a: CoalesceKey, b: CoalesceKey): boolean {
  return a.instrIdx === b.instrIdx && a.slotIdx === b.slotIdx && a.field === b.field;
}

export interface HistoryOptions {
  /** Override the coalesce window (mainly for tests). Default 600ms. */
  coalesceWindowMs?: number | undefined;
  /** Inject a clock (mainly for tests). Default `Date.now`. */
  now?: (() => number) | undefined;
}

export class HistoryManager {
  private past: Patch[] = [];
  private future: Patch[] = [];
  /** Last-committed snapshot. Either the most recent past[] entry or, when
   *  past is empty, the very first patch we observed at construction time. */
  private baseline: Patch;
  /** Pending coalesce key (last setSlotParam target). */
  private lastKey: CoalesceKey | null = null;
  /** Wall time of the last commit/coalesce-extending event. */
  private lastEventAt = 0;
  /** Suppress event handling while we're restoring state. */
  private restoring = false;
  private coalesceWindowMs: number;
  private now: () => number;

  /**
   * Public hook fired on every state change the manager itself causes
   * (undo / redo). Lets the UI re-render after a non-mutator-driven reset.
   * Mutator-driven events still flow through model.events as normal.
   */
  readonly listeners = new Set<() => void>();

  constructor(private readonly model: PatchModel, opts: HistoryOptions = {}) {
    this.coalesceWindowMs = opts.coalesceWindowMs ?? COALESCE_WINDOW_MS;
    this.now = opts.now ?? (() => Date.now());
    this.baseline = structuredClone(model.patch);
    model.events.on((e) => this.onEvent(e));
  }

  /** Subscribe to "history applied" notifications. */
  on(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  private notify(): void {
    for (const fn of [...this.listeners]) fn();
  }

  canUndo(): boolean { return this.past.length > 0; }
  canRedo(): boolean { return this.future.length > 0; }

  /**
   * Called for every model.events emission. Implements coalescing:
   *   - Any non-`param` event always commits (pushes baseline onto past).
   *   - A `param` event commits unless it targets the SAME (instrIdx,
   *     slotIdx, field) as the previous event AND arrives within the
   *     coalesce window.
   *
   * Note: PatchChange today doesn't carry the slotIdx/field. We extend the
   * event shape with optional `coalesceKey` filled in by PatchModel when
   * the change is a setSlotParam.
   */
  private onEvent(e: unknown): void {
    if (this.restoring) return;
    const ev = e as { kind: string; coalesceKey?: CoalesceKey | undefined };
    const t = this.now();
    // Coalesce both 'param' (knob drag) and 'meta' (instrument-field drag,
    // e.g. loop region edges) as long as they carry a key. 'structure' and
    // 'reset' always commit.
    const coalescable = ev.kind === 'param' || ev.kind === 'meta';
    const key = coalescable ? (ev.coalesceKey ?? null) : null;

    let shouldCommit = true;
    if (coalescable && key && this.lastKey && keysEqual(key, this.lastKey)) {
      if (t - this.lastEventAt <= this.coalesceWindowMs) {
        shouldCommit = false;
      }
    }

    if (shouldCommit) {
      // Push the previous baseline onto past. baseline becomes the new state.
      this.past.push(this.baseline);
      this.baseline = structuredClone(this.model.patch);
      this.future = [];
      this.lastKey = key;
    } else {
      // Coalesced: update baseline to the new state but DON'T push history.
      this.baseline = structuredClone(this.model.patch);
    }
    this.lastEventAt = t;
  }

  /**
   * Force the next coalescable edit to start a FRESH history entry, even if
   * it targets the same param within the coalesce window. Used by the touch
   * value tuner to seal one undo point per drag gesture: call this on finger
   * lift so two back-to-back drags on the same knob are two separate undos.
   */
  sealCoalesce(): void {
    this.lastKey = null;
  }

  undo(): void {
    if (!this.canUndo()) return;
    const prev = this.past.pop()!;
    // Save the current live patch on the redo stack.
    this.future.push(structuredClone(this.model.patch));
    this.restore(prev);
    // Reset coalesce so the next edit always starts a new history entry.
    this.lastKey = null;
  }

  redo(): void {
    if (!this.canRedo()) return;
    const next = this.future.pop()!;
    this.past.push(structuredClone(this.model.patch));
    this.restore(next);
    this.lastKey = null;
  }

  private restore(snap: Patch): void {
    this.restoring = true;
    try {
      // Replace patch in-place by cloning the snapshot so callers that
      // hold references through `model.patch` see the new shape.
      this.model.patch = structuredClone(snap);
      this.baseline = structuredClone(snap);
      // Synthetic "everything changed" event so the editor can rebuild.
      this.model.events.emit({ instrIdx: -1, kind: 'reset' } as never);
    } finally {
      this.restoring = false;
    }
    this.notify();
  }
}
