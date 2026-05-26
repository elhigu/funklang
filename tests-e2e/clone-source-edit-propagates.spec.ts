// Regression test for "editing parameters of a clone SOURCE instrument
// (via the expanded clone block) does not update the active instrument
// that depends on it".
//
// Repro:
//   1. Patch: instr 0 = osc_saw → v1; instr 1 = clone(of 0) → v1.
//   2. Activate instr 1.
//   3. The clone block is expanded — change instr 0's gain knob inside
//      that block via a programmatic mutation.
//   4. The active instrument's final-output wave-viewer canvas should
//      contain DIFFERENT pixels than before the edit. If the change
//      doesn't propagate, the canvas is unchanged.

import { test, expect } from '@playwright/test';

test('editing a clone source\'s parameters propagates to the active instrument\'s render', async ({ page }) => {
  await page.goto('/');

  // Construct patch programmatically + load via the hidden input.
  const bytes: number[] = await page.evaluate(async () => {
    const { emptyPatch, emptySlot } = await import('/src/patch/types.ts');
    const { serializeAkp } = await import('/src/fileio/akp.ts');
    const p = emptyPatch();

    // Instr 0: osc_saw with a strong amplitude so the output is visible.
    p.instruments[0]!.name = 'SRC';
    p.instruments[0]!.sampleLength = 2048;
    p.instruments[0]!.slots.push({ ...emptySlot(), fn: 2, outVar: 1, freq: 0, freqVal: 800, gainVal: 200 });

    // Instr 1: clone of instr 0 → v1.
    p.instruments[1]!.name = 'CLONER';
    p.instruments[1]!.sampleLength = 2048;
    p.instruments[1]!.slots.push({ ...emptySlot(), fn: 17, outVar: 1, gain: 0, gainVal: 0 });

    return Array.from(serializeAkp(p));
  });
  await page.setInputFiles('#hidden-file-input', {
    name: 'cloneprop.akp',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(bytes),
  });

  // Activate the cloner (instrument 1, second non-empty row).
  await page.locator('.instr-row:not(.empty)').nth(1).click();
  // Clone blocks now start COLLAPSED — expand the first one so the source's
  // knobs are present in the DOM (the fallback path below needs them).
  await page.locator('[data-clone-toggle]').first().click();
  // Wait for the wave-viewer to be populated and stable.
  await page.waitForTimeout(200);

  // Grab the wave-viewer canvas hash so we can compare before/after.
  // Use a small fingerprint (sample a row of pixels) — full canvas
  // toDataURL is rejected by Chromium when fonts/etc. taint the canvas.
  const fingerprint = async (): Promise<string> => page.evaluate(() => {
    const cv = document.querySelector('.wave-viewer canvas') as HTMLCanvasElement | null;
    if (!cv) return 'no-canvas';
    const ctx = cv.getContext('2d');
    if (!ctx) return 'no-ctx';
    const w = cv.width, h = cv.height;
    if (w === 0 || h === 0) return 'empty';
    const data = ctx.getImageData(0, (h / 2) | 0, w, 1).data;
    let s = 0;
    for (let i = 0; i < data.length; i += 16) s = (s * 31 + data[i]!) | 0;
    return String(s);
  });

  const before = await fingerprint();
  expect(before).not.toBe('no-canvas');
  expect(before).not.toBe('empty');

  // The expanded clone block exposes instr 0's slots. The first knob
  // inside the .clone-block is the osc_saw's freq const-int knob.
  // Bump its value via the model's mutator from inside the page so we
  // don't have to drive the slider visually (less flaky than dragging).
  await page.evaluate(() => {
    const w = window as unknown as { __funklangModel?: { setSlotParam: (a: number, b: number, c: string, d: number) => void } };
    // Try the documented hook first; fall back to invoking the model
    // via the page's own slot-grid render path otherwise.
    if (w.__funklangModel) {
      w.__funklangModel.setSlotParam(0, 0, 'freqVal', 4000);
      return;
    }
    // Fallback: simulate a knob edit by finding the knob and using its
    // double-click numeric editor.
    const knob = document.querySelector('.clone-block .knob .kval') as HTMLElement | null;
    if (!knob) throw new Error('clone-block knob not found');
    knob.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    const input = document.querySelector('.clone-block input.kedit') as HTMLInputElement | null;
    if (!input) throw new Error('editor input not found');
    input.value = '4000';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });

  // Wait past the 80ms debounce + paint.
  await page.waitForTimeout(250);

  const after = await fingerprint();
  expect(after).not.toBe(before);
});
