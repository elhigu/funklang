// On a narrow screen the 240px instrument sidebar collapses to a thin rail
// of instrument NUMBERS — names hidden, the selected number emphasised. A
// vertical touch-drag on the rail rolls the selection; a tap on a number
// picks it. On a wide screen the full named list is shown inline.

import { test, expect } from '@playwright/test';

const NARROW = { width: 900, height: 800 };
const WIDE = { width: 1280, height: 800 };

test('narrow screen shows a numbers rail with the selected one emphasised', async ({ page }) => {
  await page.setViewportSize(NARROW);
  await page.goto('/');
  await page.setInputFiles('#hidden-file-input', '../loctro5 3 chippisamplea.akp');
  await page.waitForSelector('.instr-row.active', { state: 'attached' });

  // The list is the rail: numbers visible, names hidden.
  await expect(page.locator('.instr-row.active .num')).toBeVisible();
  await expect(page.locator('.instr-row.active .name')).toBeHidden();
  // The rail is narrow (≈40px), not the full 240px list.
  const box = (await page.locator('#sidebar').boundingBox())!;
  expect(box.width).toBeLessThan(60);

  // The rail MUST own touch gestures (touch-action:none) — with pan-y the
  // browser would eat a vertical swipe as native scroll and the drag-roll
  // would never fire on a real device.
  const ta = await page.locator('#sidebar').evaluate((el) => getComputedStyle(el).touchAction);
  expect(ta).toBe('none');
});

test('a touch-drag down the rail rolls the selection to higher instruments', async ({ page }) => {
  await page.setViewportSize(NARROW);
  await page.goto('/');
  await page.setInputFiles('#hidden-file-input', '../loctro5 3 chippisamplea.akp');
  await page.waitForSelector('.instr-row.active', { state: 'attached' });

  const num = page.locator('.instr-row.active .num');
  const before = Number(await num.textContent());

  // Synthesise a touch drag DOWN the rail (~4 rows) → selection rolls forward.
  await page.evaluate(() => {
    const sb = document.querySelector('#sidebar')!;
    const r = sb.getBoundingClientRect();
    const x = r.x + r.width / 2, y0 = r.y + 100;
    const mk = (t: string, y: number): PointerEvent =>
      new PointerEvent(t, { pointerType: 'touch', pointerId: 1, clientX: x, clientY: y, bubbles: true, cancelable: true });
    sb.dispatchEvent(mk('pointerdown', y0));
    sb.dispatchEvent(mk('pointermove', y0 + 26 * 4));
    sb.dispatchEvent(mk('pointerup', y0 + 26 * 4));
  });

  const after = Number(await num.textContent());
  // A ~4-row drag rolls through MULTIPLE instruments (like the wheel), not one.
  expect(after - before).toBeGreaterThanOrEqual(3);
});

test('wide screen shows the named list inline', async ({ page }) => {
  await page.setViewportSize(WIDE);
  await page.goto('/');
  await page.setInputFiles('#hidden-file-input', '../loctro5 3 chippisamplea.akp');
  await page.waitForSelector('.instr-row.active');

  await expect(page.locator('#instr-list')).toBeVisible();
  await expect(page.locator('.instr-row.active .name')).toBeVisible();   // names shown when wide
});
