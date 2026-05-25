// Regression test for "🔊 on a slot inside an expanded clone block does
// not actually retarget playback to that slot in the SOURCE instrument".
//
// Before the fix: clicking the 🔊 in a clone-block's row sets
// outputTarget = { instrIdx: activeIdx, slotIdx: <source-slot-idx> } —
// pointing at a slot index that may not even exist on the active
// instrument. Audition then falls back to the active instrument's
// final output. The MASTER V1 button stays "active", the footer
// "output → …" label is wrong.
//
// After the fix: outputTarget = { instrIdx: <source-instr-idx>,
// slotIdx: <source-slot-idx> }. The MASTER V1 button dims, the
// footer reflects the new target, and audition actually plays the
// source slot's tap.

import { test, expect } from '@playwright/test';

test('clicking 🔊 inside an expanded clone block targets the SOURCE instrument\'s slot', async ({ page }) => {
  await page.goto('/');

  const bytes: number[] = await page.evaluate(async () => {
    const { emptyPatch, emptySlot } = await import('/src/patch/types.ts');
    const { serializeAkp } = await import('/src/fileio/akp.ts');
    const p = emptyPatch();
    p.instruments[0]!.name = 'SRC';
    p.instruments[0]!.sampleLength = 1024;
    p.instruments[0]!.slots.push({ ...emptySlot(), fn: 2, outVar: 1, freq: 0, freqVal: 800, gainVal: 200 });
    p.instruments[1]!.name = 'CLONER';
    p.instruments[1]!.sampleLength = 1024;
    p.instruments[1]!.slots.push({ ...emptySlot(), fn: 17, outVar: 1, gain: 0, gainVal: 0 });
    return Array.from(serializeAkp(p));
  });
  await page.setInputFiles('#hidden-file-input', {
    name: 'clone-output.akp',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(bytes),
  });

  // Activate the CLONER (instrument 1).
  await page.locator('.instr-row:not(.empty)').nth(1).click();
  await page.waitForTimeout(100);

  // MASTER V1 button should be active when nothing else is targeted.
  await expect(page.locator('#btn-output-master')).toHaveClass(/active/);

  // Find the speaker button INSIDE the expanded clone block (the inner
  // slot-grid is rendered with .clone-block as ancestor).
  const innerSpeakerBtn = page.locator('.clone-block .slot-output-btn').first();
  await expect(innerSpeakerBtn).toBeAttached();
  await innerSpeakerBtn.click({ force: true });   // it's hover-revealed, but click should still fire

  // The footer's "output → …" label should now mention the SOURCE
  // instrument (instr 01 = "SRC"), not the active CLONER (instr 02).
  const outputLabel = page.locator('#output-label');
  await expect(outputLabel).toContainText('instr 01');

  // MASTER V1 button should dim now that a slot owns the output.
  await expect(page.locator('#btn-output-master')).toHaveClass(/dimmed/);

  // Click MASTER V1 → back to active instrument's final.
  await page.locator('#btn-output-master').click();
  await expect(page.locator('#btn-output-master')).toHaveClass(/active/);
});
