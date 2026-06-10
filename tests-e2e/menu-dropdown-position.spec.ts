// When the top toolbar is too narrow to fit inline, it collapses behind the
// ☰ hamburger. The dropdown must open ANCHORED TO the hamburger — not floating
// off in the top-right corner (the old `right: 0` bug, where it landed nowhere
// near the button that opened it).

import { test, expect } from '@playwright/test';

test('the collapsed hamburger dropdown opens anchored to the ☰, not in the far corner', async ({ page }) => {
  // Narrow enough to force the menu to collapse into the hamburger.
  await page.setViewportSize({ width: 720, height: 900 });
  await page.goto('/');

  const toggle = page.locator('#menu-toggle');
  await expect(toggle).toBeVisible();                    // collapsed → hamburger shown

  await toggle.click();
  const items = page.locator('.menu-items');
  await expect(items).toBeVisible();

  const tBox = (await toggle.boundingBox())!;
  const iBox = (await items.boundingBox())!;

  // The dropdown's left edge sits at the hamburger, not the right side of the
  // header. Allow a small slack for borders/padding.
  expect(Math.abs(iBox.x - tBox.x)).toBeLessThan(40);
  // And it drops down directly beneath the button.
  expect(iBox.y).toBeGreaterThan(tBox.y + tBox.height - 4);
});
