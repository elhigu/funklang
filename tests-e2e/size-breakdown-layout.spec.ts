// The SIZE BREAKDOWN modal must not overflow horizontally — its "freed"
// values stay on one line and there is no horizontal scrollbar.

import { test, expect } from '@playwright/test';

test('size breakdown modal has no horizontal scroll', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 1000 });
  await page.goto('/');
  await page.setInputFiles('#hidden-file-input', '../loctro5 3 chippisamplea.akp');
  await page.waitForSelector('.slot', { state: 'attached' });

  await page.click('#size-status');
  const modal = page.locator('.size-breakdown-inner');
  await expect(modal).toBeVisible();

  // No horizontal overflow (scrollWidth must not exceed the visible width).
  const { sw, cw } = await modal.evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
  expect(sw).toBeLessThanOrEqual(cw);
});
