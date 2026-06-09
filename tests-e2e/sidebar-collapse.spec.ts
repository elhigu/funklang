// On a narrow screen the 240px instrument sidebar collapses to a thin rail
// showing only the active instrument number. Clicking its header floats the
// full list OVER the editor (it doesn't reflow the main area); picking an
// instrument — or clicking outside — dismisses it. On a wide screen the
// list is always visible and there is no floating behaviour.

import { test, expect } from '@playwright/test';

const NARROW = { width: 600, height: 800 };
const WIDE = { width: 1280, height: 800 };

test('narrow screen collapses the sidebar to a number and floats it open', async ({ page }) => {
  await page.setViewportSize(NARROW);
  await page.goto('/');
  await page.setInputFiles('#hidden-file-input', '../loctro5 3 chippisamplea.akp');
  // The list is collapsed (display:none) so the active row is present but
  // hidden — wait for it ATTACHED, not visible.
  await page.waitForSelector('.instr-row.active', { state: 'attached' });

  const list = page.locator('#instr-list');
  const num = page.locator('#sb-active-num');
  const sidebar = page.locator('#sidebar');

  // Collapsed: the list is hidden, only the active number shows.
  await expect(list).toBeHidden();
  await expect(num).toBeVisible();
  await expect(num).toHaveText(/^\d{2}$/);

  // Click the header → the full list opens and FLOATS over the editor.
  await page.click('#sidebar-toggle');
  await expect(sidebar).toHaveClass(/sb-open/);
  await expect(list).toBeVisible();
  const box = await sidebar.boundingBox();
  expect(box!.x).toBeLessThanOrEqual(1);                 // anchored to the left edge
  expect(box!.width).toBeGreaterThan(200);               // expanded to the full panel, not the 40px rail

  // The panel overlaps the main area (floats, not reflow): its right edge is
  // past where the 40px rail would end.
  expect(box!.x + box!.width).toBeGreaterThan(100);

  // Picking an instrument dismisses the panel.
  await page.locator('.instr-row').nth(1).click();
  await expect(sidebar).not.toHaveClass(/sb-open/);
  await expect(list).toBeHidden();
});

test('wide screen shows the list inline with no collapse', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await page.goto('/');
  await page.setInputFiles('#hidden-file-input', '../loctro5 3 chippisamplea.akp');
  await page.waitForSelector('.instr-row.active');

  await expect(page.locator('#instr-list')).toBeVisible();
  await expect(page.locator('#sb-active-num')).toBeHidden();   // number only shows on the rail
});
