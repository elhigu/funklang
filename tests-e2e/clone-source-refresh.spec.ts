// Regression test for "changing a clone slot's SOURCE dropdown does not
// refresh the expanded clone block".
//
// Repro:
//   1. Construct a patch where instrument 0 ("A") and instrument 1 ("B")
//      are both populated, and instrument 2 has a single clone slot
//      whose source is instrument 0.
//   2. Activate instrument 2 — the clone block expands inline and its
//      title reads `↪ from instrument 01 "A"`.
//   3. Change the clone's source dropdown from instrument 0 to
//      instrument 1.
//   4. The title should now read `↪ from instrument 02 "B"`. With the
//      bug it still says "A" because `srcIdx` was captured in the
//      closure at render time and never re-read.

import { test, expect } from '@playwright/test';

test('clone block title refreshes when the source dropdown changes', async ({ page }) => {
  await page.goto('/');

  // Build a minimal in-memory patch via the page's own modules and inject
  // it into the running model — much simpler than serializing to .akp,
  // writing to disk, and round-tripping through the file picker.
  await page.evaluate(() => {
    const w = window as unknown as {
      __funklangApi?: {
        adoptPatch: (name: string, bytes: Uint8Array, handle: undefined) => void;
      };
    };
    if (!w.__funklangApi) throw new Error('__funklangApi not exposed');
  }).catch(() => { /* api not exposed yet — we'll fall back below */ });

  // Use the hidden input to load a constructed patch.
  // We import parseAkp/serializeAkp lazily so this test doesn't have to
  // know the binary format.
  const bytes: number[] = await page.evaluate(async () => {
    const { emptyPatch, emptySlot } = await import('/src/patch/types.ts');
    const { serializeAkp } = await import('/src/fileio/akp.ts');
    const p = emptyPatch();
    // Instrument 0 = "A" — a single non-zero slot so the sidebar shows it.
    p.instruments[0]!.name = 'A';
    p.instruments[0]!.sampleLength = 256;
    p.instruments[0]!.slots.push({ ...emptySlot(), fn: 2, outVar: 1, freq: 0, freqVal: 1000, gainVal: 80 });
    // Instrument 1 = "B" — same shape.
    p.instruments[1]!.name = 'B';
    p.instruments[1]!.sampleLength = 256;
    p.instruments[1]!.slots.push({ ...emptySlot(), fn: 2, outVar: 1, freq: 0, freqVal: 2000, gainVal: 80 });
    // Instrument 2 = clone of instrument 0.
    p.instruments[2]!.name = 'CLONER';
    p.instruments[2]!.sampleLength = 256;
    p.instruments[2]!.slots.push({ ...emptySlot(), fn: 17, outVar: 1, gain: 0, gainVal: 0 });
    return Array.from(serializeAkp(p));
  });

  // Inject the bytes via the hidden file input.
  const buf = Buffer.from(bytes);
  await page.setInputFiles('#hidden-file-input', {
    name: 'test.akp',
    mimeType: 'application/octet-stream',
    buffer: buf,
  });

  // Pick the cloner instrument (3rd in the sidebar = 1-based "03").
  await page.locator('.instr-row:not(.empty)').nth(2).click();

  // Clone blocks now start COLLAPSED — expand the first one explicitly.
  await page.locator('[data-clone-toggle]').first().click();

  // The clone block title should mention "A".
  const title = page.locator('.clone-block-title').first();
  await expect(title).toContainText('from instrument 01');
  await expect(title).toContainText('A');

  // Change the source via the instr-ref dropdown. The clone slot's
  // source-instrument widget is the only `.param-ref-select` on the
  // page (clone is the only op in our test patch that uses one).
  // Pass the option value as a string (index option only matches when
  // every option is present; we now hide invalid sources).
  const sourceSelect = page.locator('.param-ref-select').first();
  await sourceSelect.selectOption('1');             // pick instrument index 1 ("B")

  // Title should refresh to mention "B" / "02".
  await expect(title).toContainText('from instrument 02');
  await expect(title).toContainText('B');
});
