// Regression: in the cramped 5-column band (just above the wave-under-params
// relayout), the parameter value digits must never slide under the opaque
// waveform thumbnail. The param controls compact so the row fits its column.

import { test, expect } from '@playwright/test';

// Widths whose editor lands in the formerly-overlapping band (~780–860px main).
for (const vw of [820, 900, 1040 /* sidebar still expanded → main ~800 */]) {
  test(`param values stay clear of the waveform at ${vw}px`, async ({ page }) => {
    await page.setViewportSize({ width: vw, height: 900 });
    await page.goto('/');
    await page.setInputFiles('#hidden-file-input', '../loctro5 3 chippisamplea.akp');
    await page.waitForSelector('.slot', { state: 'attached' });

    const worst = await page.evaluate(() => {
      let worst = -1e9;
      for (const slot of document.querySelectorAll('.slot')) {
        const cv = slot.querySelector('.wave-cell canvas');
        if (!cv) continue;
        const left = cv.getBoundingClientRect().left;
        for (const v of slot.querySelectorAll('.col-params .kval, .col-params .pval')) {
          worst = Math.max(worst, v.getBoundingClientRect().right - left);
        }
      }
      return worst;
    });
    // Every value's right edge is left of the waveform canvas (no overlap).
    expect(worst).toBeLessThanOrEqual(0);
  });
}
