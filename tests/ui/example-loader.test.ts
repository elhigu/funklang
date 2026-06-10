// tests/ui/example-loader.test.ts
// @vitest-environment jsdom
//
// The help modal's "LOAD EXAMPLE" control: lazily fetches AmigaKlang's
// patches folder listing from the GitHub contents API, renders the patches as
// rows, and on click fetches the chosen .akp bytes and hands them to the editor.
// fetch is injected so these tests never touch the network.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { wireExampleLoader } from '../../src/ui/example-loader';

const LISTING = [
  { name: 'Rhino1.akp', type: 'file', download_url: 'https://raw.example/Rhino1.akp' },
  { name: 'Virgill - Mothership.akp', type: 'file', download_url: 'https://raw.example/Mothership.akp' },
  { name: 'README.md', type: 'file', download_url: 'https://raw.example/README.md' },  // non-.akp, filtered out
];

function jsonResponse(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}
function bytesResponse(bytes: Uint8Array): Response {
  return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer } as unknown as Response;
}
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('example loader', () => {
  let root: HTMLElement;
  let btn: HTMLButtonElement;
  let list: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    root.innerHTML = `
      <button id="load-example-btn">LOAD EXAMPLE ▾</button>
      <div id="example-list" class="example-list hidden"></div>`;
    document.body.appendChild(root);
    btn = root.querySelector('#load-example-btn') as HTMLButtonElement;
    list = root.querySelector('#example-list') as HTMLElement;
  });

  it('does not fetch anything until the button is clicked (lazy)', () => {
    const fetchImpl = vi.fn();
    wireExampleLoader(root, { onLoad: vi.fn(), fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(list.classList.contains('hidden')).toBe(true);
  });

  it('on first open fetches the contents API and renders one row per .akp', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(LISTING));
    wireExampleLoader(root, { onLoad: vi.fn(), fetchImpl: fetchImpl as unknown as typeof fetch });

    btn.click();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][0]).toMatch(/api\.github\.com\/repos\/virgill1974\/AmigaKlang\/contents\/examples\/patches/);
    await flush();

    expect(list.classList.contains('hidden')).toBe(false);
    const rows = list.querySelectorAll('.example-row');
    expect(rows.length).toBe(2);                                  // README.md filtered out
    expect(rows[0]!.textContent).toBe('Rhino1');                 // .akp stripped for display
    expect(rows[1]!.textContent).toBe('Virgill - Mothership');
  });

  it('caches the listing — re-opening does not refetch the list', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(LISTING));
    wireExampleLoader(root, { onLoad: vi.fn(), fetchImpl: fetchImpl as unknown as typeof fetch });
    btn.click(); await flush();
    btn.click();                                                  // close
    btn.click(); await flush();                                   // re-open
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('clicking a row fetches its bytes and calls onLoad with the full name', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(LISTING))
      .mockResolvedValueOnce(bytesResponse(bytes));
    const onLoad = vi.fn();
    const onAfterLoad = vi.fn();
    wireExampleLoader(root, { onLoad, onAfterLoad, fetchImpl: fetchImpl as unknown as typeof fetch });

    btn.click(); await flush();
    (list.querySelector('.example-row') as HTMLButtonElement).click();
    await flush();

    expect(fetchImpl).toHaveBeenLastCalledWith('https://raw.example/Rhino1.akp');
    expect(onLoad).toHaveBeenCalledTimes(1);
    const [name, gotBytes] = onLoad.mock.calls[0];
    expect(name).toBe('Rhino1.akp');                              // full name, .akp kept
    expect(Array.from(gotBytes as Uint8Array)).toEqual([1, 2, 3, 4]);
    expect(onAfterLoad).toHaveBeenCalledTimes(1);
  });

  it('shows an error state when the listing fetch fails, and retries on next open', async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(jsonResponse(LISTING));
    wireExampleLoader(root, { onLoad: vi.fn(), fetchImpl: fetchImpl as unknown as typeof fetch });

    btn.click(); await flush();
    expect(list.querySelector('.example-error')).not.toBeNull();

    // Re-open retries (the previous attempt failed, so it's not cached).
    btn.click();                                                  // close
    btn.click(); await flush();                                   // re-open → retry
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(list.querySelectorAll('.example-row').length).toBe(2);
  });

  it('reports a row load to the status light while fetching bytes', async () => {
    const bytes = new Uint8Array([9]);
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(jsonResponse(LISTING))
      .mockResolvedValueOnce(bytesResponse(bytes));
    const begun: string[] = [];
    let live = 0;
    const status = { begin: (l: string) => { begun.push(l); live++; return () => { live--; }; } };
    wireExampleLoader(root, { onLoad: vi.fn(), status, fetchImpl: fetchImpl as unknown as typeof fetch });

    btn.click(); await flush();
    (list.querySelector('.example-row') as HTMLButtonElement).click();
    await flush();
    expect(begun).toContain('LOADING');
    expect(live).toBe(0);                                         // task ended
  });
});
