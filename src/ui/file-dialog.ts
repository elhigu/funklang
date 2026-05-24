// File open / save helpers. Uses File System Access API where available
// (currently Chromium-based browsers); falls back to <input type=file> for
// open and <a download> for save.

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
 * Save `bytes` to disk. Prefers `showSaveFilePicker` (Chromium); falls back
 * to an anchor + URL.createObjectURL download in browsers without FSA support.
 * `extension` is e.g. `.akp` / `.aki`; used to populate the FSA picker.
 */
export async function saveFileBytes(
  bytes: Uint8Array,
  suggestedName: string,
  extension: string,
): Promise<void> {
  // Avoid `any` while still calling the experimental API.
  const w = window as unknown as {
    showSaveFilePicker?: (opts: {
      suggestedName?: string;
      types?: Array<{ description: string; accept: Record<string, string[]> }>;
    }) => Promise<FileSystemFileHandle>;
  };
  // Copy into a fresh ArrayBuffer-backed view so TS's narrowed Uint8Array
  // type (ArrayBufferLike, which includes SharedArrayBuffer) doesn't trip
  // up the FSA / Blob signatures that require ArrayBuffer-only.
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
      return;
    } catch (err) {
      // User cancelled or browser rejected; fall through to download fallback.
      if ((err as Error).name === 'AbortError') return;
    }
  }
  // Anchor-download fallback (Firefox / Safari).
  const blob = new Blob([view], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
