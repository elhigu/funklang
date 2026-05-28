// Regression: plain ArrowUp / ArrowDown (no modifier) should step the
// sidebar instrument selection. A misplaced `if (!modifier) return;`
// short-circuit previously made the arrow branch dead code; the only
// way to navigate was the mouse wheel.

import { test, expect } from '@playwright/test';

test('plain ArrowDown / ArrowUp steps the sidebar instrument selection', async ({ page }) => {
  await page.goto('/');
  // Load the loctro5 fixture — it has many populated instruments.
  await page.setInputFiles('#hidden-file-input', '../loctro5 3 chippisamplea.akp');
  await page.waitForSelector('.instr-row.active');

  // Read the active row's number, then press ArrowDown twice.
  const num = async (): Promise<string> =>
    (await page.locator('.instr-row.active .num').textContent()) ?? '';
  const start = await num();

  await page.keyboard.press('ArrowDown');
  await page.waitForFunction((s) => {
    const el = document.querySelector('.instr-row.active .num');
    return !!el && (el.textContent ?? '') !== s;
  }, start);
  const afterDown = await num();
  expect(afterDown).not.toBe(start);

  await page.keyboard.press('ArrowUp');
  await page.waitForFunction((s) => {
    const el = document.querySelector('.instr-row.active .num');
    return !!el && (el.textContent ?? '') === s;
  }, start);
  const afterUp = await num();
  expect(afterUp).toBe(start);
});
