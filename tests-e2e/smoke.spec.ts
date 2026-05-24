import { test, expect } from '@playwright/test';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE = resolve(__dirname, '../../loctro5 3 chippisamplea.akp');

test('open loctro5, sidebar populates, file name displayed', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#instr-list')).toBeAttached();
  await page.setInputFiles('#hidden-file-input', FIXTURE);
  await expect(page.locator('#file-name')).toHaveText('loctro5 3 chippisamplea.akp');
  await expect(page.locator('#instr-list .instr-row:not(.empty)').first()).toBeVisible();
});
