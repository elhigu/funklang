// The editor's view-state: everything the UI tracks ABOUT a patch that is
// not part of the patch itself — which instrument is in focus, what's
// selected, where audition output is tapped, the preview note, etc.
//
// Extracted from app.ts as a single cohesive object so it can be passed to
// controllers (audio / patch-IO) instead of being threaded through a dozen
// closure-scoped `let`s. The patch document lives in PatchModel; this is
// the ephemeral lens the user is looking through.

/** A selected (instrument, slot) pair. slotIdx null = whole instrument. */
export interface SelectionState {
  instrIdx: number;
  slotIdx: number | null;
}

/** Which (instrument, slot) feeds audition + the waveform viewer. */
export interface OutputTarget {
  instrIdx: number;
  slotIdx: number | null; // null = final output (v1)
}

export interface EditorState {
  /** Instrument currently shown in the editor grid. */
  activeIdx: number;
  /** Selected (instrument, slot) for keyboard ops and highlighting. */
  selection: SelectionState;
  /** The (instrument, slot|null) tapped for audition + waveform. */
  outputTarget: OutputTarget;
  /** Note used when auditioning (persisted to localStorage). */
  previewNote: string;
  /** Display name of the open patch ('' when unsaved/blank). */
  patchFileName: string;
  /** FSA handle if the file was opened via File System Access; else undefined. */
  patchFileHandle: FileSystemFileHandle | undefined;
}

/**
 * A fresh editor view-state focused on instrument 0. `previewNote` is passed
 * in because it is restored from localStorage at boot, outside this module.
 */
export function createEditorState(previewNote: string): EditorState {
  return {
    activeIdx: 0,
    selection: { instrIdx: 0, slotIdx: null },
    outputTarget: { instrIdx: 0, slotIdx: null },
    previewNote,
    patchFileName: '',
    patchFileHandle: undefined,
  };
}
