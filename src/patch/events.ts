// Tiny synchronous pub/sub used by the patch model.

export type Listener<T> = (event: T) => void;

export class EventBus<T> {
  private listeners = new Set<Listener<T>>();

  /** Subscribe. Returns an idempotent disposer that removes this listener. */
  on(fn: Listener<T>): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  /** Dispatch to all current subscribers (snapshot so unsubscribes during emit are safe). */
  emit(event: T): void {
    for (const fn of [...this.listeners]) fn(event);
  }
}

/** Mutation announcement emitted by PatchModel. */
export interface PatchChange {
  instrIdx: number;
  kind: 'param' | 'structure' | 'meta' | 'reset';
  /**
   * Optional discriminator for coalescing rapid consecutive edits to the
   * same target. Populated by:
   *   - PatchModel.setSlotParam       → kind='param',  slotIdx = the slot
   *   - PatchModel.setInstrumentField → kind='meta',   slotIdx = -1 sentinel
   *
   * The history layer collapses consecutive same-key events within its
   * coalesce window into one undo step (so dragging the loop edges is one
   * undo, not hundreds).
   */
  coalesceKey?: {
    instrIdx: number;
    slotIdx: number;
    field: string;
  } | undefined;
}
