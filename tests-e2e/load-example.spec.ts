// The help modal's "LOAD EXAMPLE" control fetches a patch from the AmigaKlang
// GitHub folder and loads it straight into the editor. Both GitHub endpoints
// are mocked here so the test never hits the network.

import { test, expect } from '@playwright/test';
import { readFileSync } from 'fs';

test('LOAD EXAMPLE fetches a patch from GitHub and loads it into the editor', async ({ page }) => {
  const akp = readFileSync('../loctro5 3 chippisamplea.akp');

  // The contents-API listing → one example with a (fake) raw download URL.
  await page.route('**/api.github.com/repos/virgill1974/AmigaKlang/contents/examples/patches', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        { name: 'Demo Patch.akp', type: 'file', download_url: 'https://raw.example.test/demo.akp' },
        { name: 'README.md', type: 'file', download_url: 'https://raw.example.test/README.md' },
      ]),
    }),
  );
  // The raw .akp bytes.
  await page.route('https://raw.example.test/demo.akp', (route) =>
    route.fulfill({ status: 200, body: akp }),
  );

  await page.goto('/');

  // Open the help modal (the ? lives in the menu, which may be collapsed).
  const hamburger = page.locator('#menu-toggle');
  if (await hamburger.isVisible()) await hamburger.click();
  await page.locator('#btn-help').click();
  await expect(page.locator('#help-overlay')).not.toHaveClass(/hidden/);

  // Open the example list — README.md is filtered out, the .akp shows stripped.
  await page.locator('#load-example-btn').click();
  const rows = page.locator('.example-row');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toHaveText('Demo Patch');

  // Load it: the help closes and the patch is now the active project.
  await rows.first().click();
  await expect(page.locator('#help-overlay')).toHaveClass(/hidden/);
  await expect(page.locator('#file-name')).toHaveText('Demo Patch.akp');
  await expect(page.locator('.instr-list li').first()).toBeVisible();
});
