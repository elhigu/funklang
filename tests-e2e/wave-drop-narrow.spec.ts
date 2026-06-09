// On a very narrow screen the per-slot waveform drops out of the right-hand
// column and stacks UNDER the op parameters at a fixed height equal to two
// parameter rows (~50px). On a wide screen it stays in its own column to the
// RIGHT of the parameters.

import { test, expect } from '@playwright/test';

async function firstSlotBoxes(page: import('@playwright/test').Page) {
  const slot = page.locator('.slot').first();
  const params = slot.locator('.col-params');
  const wave = slot.locator('.wave-cell');
  return {
    params: (await params.boundingBox())!,
    wave: (await wave.boundingBox())!,
  };
}

test('narrow: waveform stacks under the parameters at a fixed ~2-row height', async ({ page }) => {
  await page.setViewportSize({ width: 560, height: 900 });
  await page.goto('/');
  await page.setInputFiles('#hidden-file-input', '../loctro5 3 chippisamplea.akp');
  await page.waitForSelector('.slot', { state: 'attached' });

  const { params, wave } = await firstSlotBoxes(page);

  // Wave is BELOW the params (its top is at/under the params' bottom).
  expect(wave.y).toBeGreaterThanOrEqual(params.y + params.height - 2);
  // ...and shares the params' column (left edges roughly aligned).
  expect(Math.abs(wave.x - params.x)).toBeLessThan(4);
  // Fixed height ≈ two parameter rows (50px).
  expect(wave.height).toBeGreaterThanOrEqual(46);
  expect(wave.height).toBeLessThanOrEqual(56);

  // The WAVEFORM column header is gone (no column to head).
  await expect(page.locator('.grid-head > div', { hasText: 'WAVEFORM' })).toBeHidden();
});

test('wide: waveform sits to the RIGHT of the parameters', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.setInputFiles('#hidden-file-input', '../loctro5 3 chippisamplea.akp');
  await page.waitForSelector('.slot', { state: 'attached' });

  const { params, wave } = await firstSlotBoxes(page);

  // Wave is to the right of the params column, roughly on the same row.
  expect(wave.x).toBeGreaterThan(params.x + params.width - 4);
  expect(Math.abs(wave.y - params.y)).toBeLessThan(params.height);
});
