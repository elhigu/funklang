// The instrument header's IMPORT / EXPORT / REMOVE actions are collapsed
// behind a ⋯ menu so they don't crowd the name + length. On a narrow editor
// the header also stacks (name row above the length row) so the length never
// overflows the name.

import { test, expect } from '@playwright/test';

test('IMPORT/EXPORT/REMOVE are hidden until the ⋯ menu is opened', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#hidden-file-input', '../loctro5 3 chippisamplea.akp');
  await page.waitForSelector('.instr-header', { state: 'attached' });

  const importBtn = page.locator('[data-id=aki-import]');
  await expect(importBtn).toBeHidden();                 // collapsed by default

  await page.locator('[data-id=instr-menu-toggle]').click();
  await expect(importBtn).toBeVisible();
  await expect(page.locator('[data-id=aki-export]')).toBeVisible();
  await expect(page.locator('[data-id=instr-remove]')).toBeVisible();

  // A click outside closes the menu again.
  await page.locator('.instr-name-input').click();
  await expect(importBtn).toBeHidden();
});

test('narrow header stacks so length sits below the name, not beside it', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 920 });
  await page.goto('/');
  await page.setInputFiles('#hidden-file-input', '../loctro5 3 chippisamplea.akp');
  await page.waitForSelector('.instr-header', { state: 'attached' });

  const name = (await page.locator('.instr-name-input').boundingBox())!;
  const len = (await page.locator('[data-id=instr-len-host]').boundingBox())!;
  // Length is on a row BELOW the name (stacked), not to its right.
  expect(len.y).toBeGreaterThan(name.y + name.height - 2);
});
