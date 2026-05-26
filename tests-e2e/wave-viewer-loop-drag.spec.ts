// End-to-end: build a one-instrument patch with osc_saw + loop_gen,
// drag the wave-viewer's loop-offset edge to ~75 % of the canvas, and
// confirm the loop_gen offset lands on 75 % of the sample length.
//
// Sample length = 12288 (the editor's "first slot in an empty
// instrument" default). 75 % of 12288 = 9216, which is even and inside
// the valid loop-offset range [floor(SL/4)*2, SL-2] = [6144, 12286],
// so the loop-rules snap is a no-op and the drag should land exactly.

import { test, expect } from '@playwright/test';

test('drag the wave-viewer loop-offset edge to 75% of the canvas — loop_gen lands at 75% of sample length', async ({ page }) => {
  await page.goto('/');

  // Wait for the editor shell to mount.
  await page.waitForSelector('.sidebar');

  const SAMPLE_LENGTH = 12288;
  // minLoopOffset(SL) = (SL >>> 2) << 1.  For SL=12288 that's 6144.
  // Setting anything lower triggers the model's clampLoopOffset which
  // would snap us up to 6144 before we even started — so seed with the
  // legal minimum.
  const INITIAL_LOOP_OFFSET = 6144;
  const TARGET_OFFSET = 9216;                       // 75 % of 12288
  // Renderer emits sampleLength + 1 samples; the wave-viewer's
  // viewEnd defaults to the buffer length, so sample→x mapping uses
  // (loopOffset / (SL + 1)).
  const VIEW_TOTAL = SAMPLE_LENGTH + 1;

  // Build the patch with osc_saw → v1 followed by a loop_gen slot, then
  // inject it via the hidden file input — same shape as the other E2E
  // tests so we don't have to drive the op picker modal.
  const bytes: number[] = await page.evaluate(async ({ SL, OFS }) => {
    const { emptyPatch, emptySlot } = await import('/src/patch/types.ts');
    const { serializeAkp } = await import('/src/fileio/akp.ts');
    const p = emptyPatch();
    p.instruments[0]!.name = 'LOOPER';
    p.instruments[0]!.sampleLength = SL;
    p.instruments[0]!.loopOffset   = OFS;
    p.instruments[0]!.loopLength   = SL - OFS;
    // osc_saw → v1 so there's something to look at in the wave-viewer
    p.instruments[0]!.slots.push({
      ...emptySlot(), fn: 2, outVar: 1, freqVal: 1000, gainVal: 80,
    });
    // loop_gen → owns the loop region for this instrument
    p.instruments[0]!.slots.push({ ...emptySlot(), fn: 22 });
    return Array.from(serializeAkp(p));
  }, { SL: SAMPLE_LENGTH, OFS: INITIAL_LOOP_OFFSET });

  await page.setInputFiles('#hidden-file-input', {
    name: 'loop-drag.akp',
    mimeType: 'application/octet-stream',
    buffer: Buffer.from(bytes),
  });

  // First populated instrument auto-activates → wait for the
  // wave-viewer to paint at non-zero size + report the initial loop.
  const canvas = page.locator('.wave-viewer canvas');
  await canvas.waitFor();
  await page.waitForFunction(() => {
    const cv = document.querySelector('.wave-viewer canvas') as HTMLCanvasElement | null;
    return !!cv && cv.getBoundingClientRect().width > 0;
  });
  // Meta line should already show the initial loop offset.
  await expect(page.locator('.wave-viewer-meta')).toContainText(`loop ${INITIAL_LOOP_OFFSET}`);

  // Compute drag start / end in client coords. Read the rect from the
  // SAME source the wave-viewer's drag handler uses
  // (getBoundingClientRect on the canvas) so a 1-px border or any
  // sub-pixel rounding can't desync the test from the production code.
  const rect = await page.evaluate(() => {
    const cv = document.querySelector('.wave-viewer canvas') as HTMLCanvasElement;
    const r = cv.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
  const startX = rect.left + (INITIAL_LOOP_OFFSET / VIEW_TOTAL) * rect.width;
  const endX   = rect.left + (TARGET_OFFSET       / VIEW_TOTAL) * rect.width;
  const midY   = rect.top + rect.height / 2;

  // Drag in three steps so the move events actually fire.
  await page.mouse.move(startX, midY);
  await page.mouse.down();
  await page.mouse.move((startX + endX) / 2, midY, { steps: 6 });
  await page.mouse.move(endX, midY, { steps: 6 });
  await page.mouse.up();

  // Verify the meta line reports the new loop offset (allow ±2 wiggle
  // for sub-pixel rounding — the snap to even is what matters).
  await expect(page.locator('.wave-viewer-meta')).toContainText(/loop 921[4-8]\+/);

  // Cross-check the loop_gen slot's offset knob mirrors the drag:
  // it's the only knob in the second slot row (visible row 1 → the
  // loop_gen op), and its `.kval` reads out the current value. The
  // knob value only refreshes on the structure-event commit that
  // fires from `onLoopCommit` — proves the drag wasn't just a
  // wave-viewer-local preview.
  const loopGenKnob = page.locator('.slot[data-row-idx="1"] .knob .kval').first();
  await expect(loopGenKnob).toHaveText(/921[4-8]/);
});
