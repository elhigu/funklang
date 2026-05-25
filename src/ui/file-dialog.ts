// File open / save helpers. Uses File System Access API where available
// (currently Chromium-based browsers); falls back to <input type=file> for
// open and <a download> for save.

export interface OpenedFile {
  name: string;
  bytes: Uint8Array;
  /** Present on Chromium-style browsers via FSA — lets SAVE write back silently. */
  handle?: FileSystemFileHandle;
}

/**
 * Open via the native file picker. No handle returned — for cases like
 * IMPORT INSTRUMENT (.aki) where there's nothing to write back to.
 */
export async function openFileBytes(
  accept: string,
): Promise<{ name: string; bytes: Uint8Array } | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      resolve({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
    };
    input.click();
  });
}

/**
 * Open a file, preferring `showOpenFilePicker` so we can keep a handle for
 * silent SAVE. Falls back to `<input type=file>` ONLY when the FSA picker
 * itself never appeared — never after the user has already seen and
 * interacted with the FSA picker (which would otherwise pop a second
 * picker for the same operation).
 */
export async function openFileWithHandle(
  accept: string,
  description: string,
): Promise<OpenedFile | null> {
  const w = window as unknown as {
    showOpenFilePicker?: (opts: {
      multiple?: boolean;
      types?: Array<{ description: string; accept: Record<string, string[]> }>;
      excludeAcceptAllOption?: boolean;
    }) => Promise<FileSystemFileHandle[]>;
  };
  if (w.showOpenFilePicker) {
    // Phase 1 — show the picker. If THIS throws, the picker either wasn't
    // shown at all (browser support issue, security context, etc.) or was
    // cancelled by the user. Only then is it safe to fall back.
    let handle: FileSystemFileHandle | undefined;
    try {
      const result = await w.showOpenFilePicker({
        multiple: false,
        types: [{ description, accept: { 'application/octet-stream': [accept] } }],
      });
      handle = result[0];
    } catch (err) {
      const name = (err as Error).name;
      if (name === 'AbortError') return null;       // user cancelled
      // Picker itself failed to even appear — try the input fallback.
      console.warn('showOpenFilePicker failed, falling back to <input>:', err);
      const fallback = await openFileBytes(accept);
      return fallback ? { name: fallback.name, bytes: fallback.bytes } : null;
    }
    if (!handle) return null;

    // Phase 2 — read the file. The picker already gave us a handle. On
    // most setups this just works; on some (observed on NixOS + Wayland
    // portal + GNOME Files) getFile() / arrayBuffer() silently fails
    // even though the picker resolved with a valid-looking handle. When
    // that happens we DO fall back to the <input type=file> picker so
    // the user can still load the file — at the cost of seeing a second
    // dialog. Better two dialogs than a silently-dropped patch.
    try {
      const file = await handle.getFile();
      const bytes = new Uint8Array(await file.arrayBuffer());
      return { name: file.name, bytes, handle };
    } catch (err) {
      console.warn(
        'FSA read failed after a successful pick — opening the <input> ' +
        'fallback so the file still loads. The original error was:', err,
      );
      const fallback = await openFileBytes(accept);
      return fallback ? { name: fallback.name, bytes: fallback.bytes } : null;
    }
  }
  // No FSA at all (Firefox / Safari) — use the input fallback directly.
  const fallback = await openFileBytes(accept);
  return fallback ? { name: fallback.name, bytes: fallback.bytes } : null;
}

/**
 * Silent write back to an existing FileSystemFileHandle. No dialog.
 * Used by Ctrl+S / SAVE when we have a handle from a previous open.
 */
export async function saveToHandle(
  handle: FileSystemFileHandle,
  bytes: Uint8Array,
): Promise<void> {
  // Copy into a fresh ArrayBuffer-backed view (avoid SharedArrayBuffer typing
  // mismatches against FSA's write signature).
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  const writable = await handle.createWritable();
  await writable.write(new Uint8Array(buf));
  await writable.close();
}

/**
 * Save `bytes` to disk via the picker. Prefers `showSaveFilePicker` (Chromium);
 * falls back to an anchor + URL.createObjectURL download in browsers without
 * FSA support. `extension` is e.g. `.akp` / `.aki`.
 *
 * Returns the new FileSystemFileHandle when one was obtained — caller may
 * stash it so a subsequent SAVE writes back silently via `saveToHandle`.
 */
export async function saveFileBytes(
  bytes: Uint8Array,
  suggestedName: string,
  extension: string,
): Promise<FileSystemFileHandle | undefined> {
  const w = window as unknown as {
    showSaveFilePicker?: (opts: {
      suggestedName?: string;
      types?: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<FileSystemFileHandle>;
  };
  const buf = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buf).set(bytes);
  const view = new Uint8Array(buf);
  if (w.showSaveFilePicker) {
    try {
      const handle = await w.showSaveFilePicker({
        suggestedName,
        types: [
          {
            description: extension === '.aki' ? 'Klang instrument' : 'Klang patch',
            accept: { 'application/octet-stream': [extension] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(view);
      await writable.close();
      return handle;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return undefined;
    }
  }
  // Anchor-download fallback (Firefox / Safari) — no handle to return.
  const blob = new Blob([view], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return undefined;
}
