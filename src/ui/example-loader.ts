// src/ui/example-loader.ts
//
// The help modal's "LOAD EXAMPLE" control. The app ships no example patches
// (they're deliberately not in the repo); instead this fetches AmigaKlang's
// examples/patches folder — the same one the intro paragraph links to —
// live from GitHub, lists the .akp files, and on click pulls the chosen
// patch's bytes and hands them to the editor's normal adopt path.
//
// Both endpoints are CORS-enabled (Access-Control-Allow-Origin: *), so the
// browser fetches them directly with no proxy. The contents API is rate-limited
// (60/hr per IP unauthenticated), so the listing is cached for the session and
// only refetched after a failed attempt.
import type { StatusBar } from './status-bar';

const CONTENTS_API =
  'https://api.github.com/repos/virgill1974/AmigaKlang/contents/examples/patches';

interface ExampleEntry { name: string; url: string }

/** One row as returned by the GitHub contents API (the fields we use). */
interface ContentsItem { name: string; type: string; download_url: string | null }

export interface ExampleLoaderOpts {
  /** Hand the fetched patch (full filename incl. `.akp`, raw bytes) to the editor. */
  onLoad: (name: string, bytes: Uint8Array) => void;
  /** Called after a successful load — e.g. close the help modal. */
  onAfterLoad?: () => void;
  /** Footer activity light; a remote byte fetch registers here as "LOADING". */
  status?: StatusBar;
  /** Injectable fetch (tests pass a mock); defaults to the global. */
  fetchImpl?: typeof fetch;
}

const stripAkp = (name: string): string => name.replace(/\.akp$/i, '');

export function wireExampleLoader(root: HTMLElement, opts: ExampleLoaderOpts): void {
  const btn = root.querySelector('#load-example-btn') as HTMLButtonElement | null;
  const list = root.querySelector('#example-list') as HTMLElement | null;
  if (!btn || !list) return;
  const doFetch = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));

  let entries: ExampleEntry[] | null = null;   // session cache (null = not yet loaded)
  let loading = false;

  const open = (): void => list.classList.remove('hidden');
  const close = (): void => list.classList.add('hidden');
  const isOpen = (): boolean => !list.classList.contains('hidden');

  const renderMessage = (cls: string, text: string): void => {
    list.innerHTML = `<div class="${cls}">${text}</div>`;
  };

  const renderRows = (items: ExampleEntry[]): void => {
    list.innerHTML = '';
    for (const e of items) {
      const row = document.createElement('button');
      row.className = 'example-row';
      row.type = 'button';
      row.textContent = stripAkp(e.name);
      row.title = `Load ${e.name} from AmigaKlang`;
      row.addEventListener('click', () => { void loadEntry(e, row); });
      list.appendChild(row);
    }
  };

  const fetchListing = async (): Promise<void> => {
    if (loading) return;
    loading = true;
    renderMessage('example-empty', 'loading…');
    try {
      const res = await doFetch(CONTENTS_API);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const items = (await res.json()) as ContentsItem[];
      entries = items
        .filter((i) => i.type === 'file' && /\.akp$/i.test(i.name) && i.download_url)
        .map((i) => ({ name: i.name, url: i.download_url as string }));
      renderRows(entries);
    } catch {
      entries = null;   // leave uncached so the next open retries
      renderMessage(
        'example-error',
        'Couldn’t reach GitHub (offline or rate-limited). Click LOAD&nbsp;EXAMPLE to retry, or use the link above.',
      );
    } finally {
      loading = false;
    }
  };

  const loadEntry = async (e: ExampleEntry, row: HTMLButtonElement): Promise<void> => {
    if (row.classList.contains('loading')) return;
    row.classList.add('loading');
    const endTask = opts.status?.begin('LOADING');
    try {
      const res = await doFetch(e.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      opts.onLoad(e.name, bytes);
      opts.onAfterLoad?.();
    } catch {
      row.classList.remove('loading');
      row.classList.add('row-error');
      row.title = 'Failed to load — click to retry';
    } finally {
      endTask?.();
    }
  };

  btn.addEventListener('click', () => {
    if (isOpen()) { close(); return; }
    open();
    if (!entries) void fetchListing();   // fetch on first open (or after a prior failure)
  });
}
