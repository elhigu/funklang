import { test, expect } from '@playwright/test';

test('moveInstrument permutes the sidebar and remaps clone sources', async ({ page }) => {
  await page.goto('/');

  const bytes: number[] = await page.evaluate(async () => {
    const { emptyPatch, emptySlot } = await import('/src/patch/types.ts');
    const { serializeAkp } = await import('/src/fileio/akp.ts');
    const p = emptyPatch();
    p.instruments[0]!.name = 'SRC';
    p.instruments[0]!.sampleLength = 256;
    p.instruments[0]!.slots.push({ ...emptySlot(), fn: 2, outVar: 1, freqVal: 50, gainVal: 64 });
    p.instruments[1]!.name = 'MID';
    p.instruments[1]!.sampleLength = 256;
    p.instruments[1]!.slots.push({ ...emptySlot(), fn: 4, outVar: 1, freqVal: 50, gainVal: 64 });
    p.instruments[2]!.name = 'CLONER';
    p.instruments[2]!.sampleLength = 256;
    p.instruments[2]!.slots.push({ ...emptySlot(), fn: 17, outVar: 1, gain: 0 });
    return Array.from(serializeAkp(p));
  });
  await page.setInputFiles('#hidden-file-input', {
    name: 'reorder.akp', mimeType: 'application/octet-stream', buffer: Buffer.from(bytes),
  });

  // Use the __funklangModel shim to drive the move — HTML5 drag in
  // headless Chromium is brittle; the model API gives deterministic results.
  await page.evaluate(() => {
    const w = window as unknown as { __funklangModel?: { moveInstrument: (from: number, to: number) => void } };
    w.__funklangModel?.moveInstrument?.(0, 1);
  });

  // After reorder: instr 0 = MID, instr 1 = SRC, instr 2 = CLONER.
  // Clone-of-old-0 in instr 2 now points at index 1 (SRC's new home).
  const cloneGain = await page.evaluate(() => {
    const w = window as unknown as { __funklangModel?: { patch: { instruments: Array<{ slots: Array<{ fn: number; gain: number }> }> } } };
    return w.__funklangModel!.patch.instruments[2]!.slots[0]!.gain;
  });
  expect(cloneGain).toBe(1);

  // Sidebar reflects the new order.
  await expect(page.locator('.instr-row').nth(0).locator('.name')).toHaveText('MID');
  await expect(page.locator('.instr-row').nth(1).locator('.name')).toHaveText('SRC');
});
