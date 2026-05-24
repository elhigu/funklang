import { test, expect } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE = resolve(__dirname, '../../loctro5 3 chippisamplea.akp');

test('open loctro5, pick instrument 0, slot grid populates', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#hidden-file-input', FIXTURE);
  await expect(page.locator('#file-name')).toHaveText('loctro5 3 chippisamplea.akp');

  // First non-empty instrument should be auto-selected; main area should show
  // an instrument header (name input present) and a slot grid with at least
  // one filled row.
  await expect(page.locator('.instr-name-input').first()).toBeVisible();
  // Slot grid must contain at least one filled .slot row.
  const slotCount = await page.locator('.slots > .slot-wrap').count();
  expect(slotCount).toBeGreaterThan(0);

  // The grid header should be present.
  await expect(page.locator('.grid-head').first()).toBeVisible();

  // The output label defaults to "instr N / final" (selection is "/ —").
  await expect(page.locator('#output-label')).toContainText('final');

  // Picking another non-empty instrument changes the visible name.
  const beforeName = await page.locator('.instr-name-input').first().inputValue();
  const items = page.locator('.instr-list .instr-row:not(.empty)');
  if (await items.count() > 1) {
    await items.nth(1).click();
    const afterName = await page.locator('.instr-name-input').first().inputValue();
    expect(afterName).not.toBe(beforeName);
  }
});
