// End-to-end touch flow: with a touch context, tapping a value knob opens the
// touch value tuner (mouse users never see it — they drag inline). Verifies
// the whole chain knob → onTouchTune → slot-grid onTuneParam → app → modal.

import { test, expect } from '@playwright/test';

test.use({ hasTouch: true });

test('a finger tap on a knob opens the touch value tuner', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#hidden-file-input', '../loctro5 3 chippisamplea.akp');
  await page.waitForSelector('.slot', { state: 'attached' });

  // First value knob in the grid.
  const bar = page.locator('.slot .kbar').first();
  await bar.waitFor({ state: 'visible' });
  const box = (await bar.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);

  const overlay = page.locator('#touch-tuner-overlay');
  await expect(overlay).toBeVisible();
  await expect(overlay.locator('.tt-roller')).toHaveCount(3);
  await page.screenshot({ path: 'test-results/touch-tuner.png' });

  // Done closes it.
  await overlay.locator('#touch-tuner-close').click();
  await expect(overlay).toHaveCount(0);
});

test('a mouse press on a knob does NOT open the tuner (still drags inline)', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#hidden-file-input', '../loctro5 3 chippisamplea.akp');
  await page.waitForSelector('.slot', { state: 'attached' });

  await page.locator('.slot .kbar').first().click();   // mouse click
  await expect(page.locator('#touch-tuner-overlay')).toHaveCount(0);
});
