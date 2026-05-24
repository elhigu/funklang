import { test, expect } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE = resolve(__dirname, '../../loctro5 3 chippisamplea.akp');

test('Ctrl+Z reverts a knob mutation; Ctrl+Shift+Z redoes', async ({ page }) => {
  await page.goto('/');
  await page.setInputFiles('#hidden-file-input', FIXTURE);
  await expect(page.locator('#file-name')).toHaveText('loctro5 3 chippisamplea.akp');

  // Wait for a slot row to exist.
  const firstRow = page.locator('.slots > .slot-wrap > .slot').first();
  await expect(firstRow).toBeVisible();

  // Find the first knob value display on the first row.
  const firstKnobVal = firstRow.locator('.knob .kval').first();
  await expect(firstKnobVal).toBeVisible();
  const originalText = (await firstKnobVal.textContent())!.trim();
  const originalN = parseInt(originalText, 10);
  expect(Number.isFinite(originalN)).toBe(true);
  // Pick a target that's definitely different and definitely in the
  // common 0..255 range so it doesn't get clamped on small-range knobs.
  const target = originalN === 42 ? 99 : 42;

  // Mutate via double-click → text edit → type → Enter.
  await firstKnobVal.dblclick();
  const editInput = firstRow.locator('input.kedit').first();
  await expect(editInput).toBeVisible();
  await editInput.fill(String(target));
  await editInput.press('Enter');

  // Value should now be the new one (the editor is closed → kval visible again).
  await expect(firstKnobVal).toHaveText(String(target));

  // Undo button should now be enabled.
  await expect(page.locator('#btn-undo')).toBeEnabled();

  // Move focus away from any inputs so the document-level keybinding fires.
  await page.locator('header').click();
  await page.keyboard.press('Control+z');

  await expect(firstKnobVal).toHaveText(originalText);

  // Now Redo button should be enabled and Ctrl+Shift+Z should re-apply.
  await expect(page.locator('#btn-redo')).toBeEnabled();
  await page.keyboard.press('Control+Shift+z');
  await expect(firstKnobVal).toHaveText(String(target));
});
