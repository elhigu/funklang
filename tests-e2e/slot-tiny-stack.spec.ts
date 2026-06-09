// At a very small editor width the slot row can't fit the OUT-var + op-name
// selectors beside the parameters, so it restacks into three rows: selectors
// on top, parameters full-width below them, waveform under that.

import { test, expect } from '@playwright/test';

test('tiny editor stacks params under the OUT/op selectors', async ({ page }) => {
  await page.setViewportSize({ width: 380, height: 900 });   // main ≈ 340px < 480
  await page.goto('/');
  await page.setInputFiles('#hidden-file-input', '../loctro5 3 chippisamplea.akp');
  await page.waitForSelector('.slot', { state: 'attached' });

  const slot = page.locator('.slot').first();
  const op = (await slot.locator('.col-op').boundingBox())!;
  const out = (await slot.locator('.col-out').boundingBox())!;
  const params = (await slot.locator('.col-params').boundingBox())!;
  const wave = (await slot.locator('.wave-cell').boundingBox())!;

  // Params sit BELOW the op + out selectors (next row), not beside them.
  expect(params.y).toBeGreaterThanOrEqual(op.y + op.height - 2);
  expect(params.y).toBeGreaterThanOrEqual(out.y + out.height - 2);
  // ...and span (nearly) the full width — they start at the left edge.
  expect(params.x).toBeLessThan(op.x);
  // Waveform is the last row, under the params.
  expect(wave.y).toBeGreaterThanOrEqual(params.y + params.height - 2);
});

test('mid width keeps params beside the op column (no tiny stack)', async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 900 });   // main ≈ 720px, > 480
  await page.goto('/');
  await page.setInputFiles('#hidden-file-input', '../loctro5 3 chippisamplea.akp');
  await page.waitForSelector('.slot', { state: 'attached' });

  const slot = page.locator('.slot').first();
  const op = (await slot.locator('.col-op').boundingBox())!;
  const params = (await slot.locator('.col-params').boundingBox())!;
  expect(params.x).toBeGreaterThan(op.x);                    // params to the RIGHT of op
});
