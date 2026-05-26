import { test, expect } from '@playwright/test';

test('fresh boot (no autosave) renders the empty-instrument placeholder', async ({ page, context }) => {
  await context.clearCookies();
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await expect(page.locator('#file-name')).toHaveText('(no patch)');
  await expect(page.locator('.slot.empty-placeholder')).toBeVisible();
  await expect(page.locator('.slot.empty-placeholder button.slot-corner-insert')).toHaveText('+');
});
