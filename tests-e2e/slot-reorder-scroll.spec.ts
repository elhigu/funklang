// Regression: when a structural rebuild fires (e.g. `model.moveSlot`),
// `renderMain()` wipes `mainEl` and creates a fresh `.slot-grid-host`.
// The new host's scrollTop defaults to 0 — so a user working at the
// bottom of a long instrument gets snapped back to the top every time
// they reorder a slot. The fix captures `gridHostEl.scrollTop` before
// the wipe and restores it on the new host afterwards.
//
// This test drives the move via `window.__funklangModel` rather than a
// DOM drag, since drag-and-drop is brittle in headless Chromium.

import { test, expect } from '@playwright/test';

test('moving a slot does not reset the slot-grid scroll position', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#hidden-file-input', '../loctro5 3 chippisamplea.akp');
  await page.waitForSelector('.instr-row.active');
  // Pick an instrument with many slots — loctro5 instr 0 has plenty.
  await page.locator('.instr-row:not(.empty)').first().click();
  await page.waitForSelector('.slot-grid-host');

  // Scroll the slot-grid host to its bottom.
  await page.evaluate(() => {
    const host = document.querySelector('.slot-grid-host') as HTMLElement;
    host.scrollTop = host.scrollHeight;
  });
  const before = await page.evaluate(() =>
    (document.querySelector('.slot-grid-host') as HTMLElement).scrollTop
  );
  expect(before).toBeGreaterThan(0);

  // Sanity-check that the E2E shim is wired up — gives a clearer failure
  // message than the TypeError that would otherwise surface from the
  // moveSlot evaluate block below.
  const hasModel = await page.evaluate(() =>
    typeof (window as unknown as { __funklangModel?: unknown }).__funklangModel === 'object'
  );
  expect(hasModel).toBe(true);

  // Trigger a structure event by moving slot 0 to position 1 via the model API.
  await page.evaluate(() => {
    const w = window as unknown as { __funklangModel: { moveSlot: (i: number, from: number, to: number) => void } };
    w.__funklangModel.moveSlot(0, 0, 1);
  });

  // After the rebuild, scrollTop should be close to where it was before.
  // Tolerance of 40px absorbs the one-row layout shift from the move.
  const after = await page.evaluate(() =>
    (document.querySelector('.slot-grid-host') as HTMLElement).scrollTop
  );
  expect(after).toBeGreaterThan(0);
  expect(Math.abs(after - before)).toBeLessThan(40);
});
