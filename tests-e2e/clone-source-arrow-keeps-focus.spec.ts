// Regression: pressing ArrowDown / ArrowUp on the clone-source dropdown
// fires its `change` event, which emits a `structure` event, which
// rebuilds the entire slot grid via `renderMain()`. The rebuild used to
// destroy the focused <select> — every subsequent arrow press then went
// to the body (and our global arrow nav stepped the instrument selection
// instead of advancing the dropdown).
//
// Fix: renderMain() captures the active element's data-* selector path
// before wiping mainEl and restores focus to the equivalent element
// after the rebuild. This test pins that contract.

import { test, expect } from '@playwright/test';

test('arrow keys on the clone-source dropdown keep it focused after the re-render', async ({ page }) => {
  await page.goto('/');

  // Build a patch with instrument 0 = osc_saw → v1, instrument 1 = osc_sine → v1,
  // instrument 2 = clone of instrument 0.
  const bytes: number[] = await page.evaluate(async () => {
    const { emptyPatch, emptySlot } = await import('/src/patch/types.ts');
    const { serializeAkp } = await import('/src/fileio/akp.ts');
    const p = emptyPatch();
    p.instruments[0]!.name = 'A';
    p.instruments[0]!.sampleLength = 256;
    p.instruments[0]!.slots.push({ ...emptySlot(), fn: 2, outVar: 1, freqVal: 1000, gainVal: 80 });
    p.instruments[1]!.name = 'B';
    p.instruments[1]!.sampleLength = 256;
    p.instruments[1]!.slots.push({ ...emptySlot(), fn: 4, outVar: 1, freqVal: 2000, gainVal: 80 });
    p.instruments[2]!.name = 'CLONER';
    p.instruments[2]!.sampleLength = 256;
    p.instruments[2]!.slots.push({ ...emptySlot(), fn: 17, outVar: 1, gain: 0, gainVal: 0 });
    return Array.from(serializeAkp(p));
  });
  await page.setInputFiles('#hidden-file-input', {
    name: 'clone-arrow.akp',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(bytes),
  });

  // Activate the cloner (instrument 3 in 1-based).
  await page.locator('.instr-row:not(.empty)').nth(2).click();

  // Focus the clone-source dropdown and confirm it's the active element.
  const sourceSelect = page.locator('.param-ref-select').first();
  await sourceSelect.focus();
  await expect(sourceSelect).toBeFocused();

  // Capture the current value, then press ArrowDown. Browser advances the
  // <select>'s value → fires change → structure event → renderMain rebuild.
  const before = await sourceSelect.inputValue();
  await page.keyboard.press('ArrowDown');

  // After the rebuild, the SAME data-* path should resolve to a focused
  // dropdown whose value reflects the keypress.
  await expect(sourceSelect).toBeFocused();
  const after = await sourceSelect.inputValue();
  expect(after).not.toBe(before);
});
