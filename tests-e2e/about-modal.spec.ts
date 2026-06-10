// The ABOUT menu item opens the About/Credits modal showing the version, a
// credit, and the live-rendered changelog. Esc closes it.

import { test, expect } from '@playwright/test';

test('ABOUT opens the credits modal with version + changelog, Esc closes it', async ({ page }) => {
  await page.goto('/');

  // ABOUT lives in the top menu (collapsed into the hamburger on narrow widths).
  const hamburger = page.locator('#menu-toggle');
  if (await hamburger.isVisible()) await hamburger.click();
  await page.locator('#btn-about').click();

  const overlay = page.locator('#about-overlay');
  await expect(overlay).not.toHaveClass(/hidden/);
  await expect(page.locator('.about-version')).toHaveText(/v\d+\.\d+\.\d+/);
  await expect(overlay).toContainText('Virgill');
  // Changelog rendered from CHANGELOG.md (the released 1.1.0 section exists).
  await expect(overlay.locator('.about-changelog')).toContainText('1.1.0');

  await page.keyboard.press('Escape');
  await expect(overlay).toHaveClass(/hidden/);
});
