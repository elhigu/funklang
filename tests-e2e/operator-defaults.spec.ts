import { test, expect } from '@playwright/test';

const EXPECTED: Record<number, Record<string, number>> = {
  1:  { gainVal: 128 },                                  // vol
  2:  { freqVal: 50, gainVal: 64 },                      // osc_saw
  3:  { freqVal: 50, gainVal: 64 },                      // osc_tri
  4:  { freqVal: 50, gainVal: 64 },                      // osc_sine
  5:  { freqVal: 50, gainVal: 64, widthVal: 63 },        // osc_pulse
  6:  { gainVal: 64 },                                   // osc_noise
  7:  { val1Value: 16, gainVal: 64 },                    // enva
  8:  { val1Value: 16, val2Value: 64, gainVal: 64 },     // envd
  9:  { val1: 1, val2Value: 0 },                         // add
  11: { gainVal: 128 },                                  // dly_cyc
  12: { gainVal: 64 },                                   // cmb_flt_n
  13: { val2Value: 64, gainVal: 64 },                    // reverb
  15: { freqVal: 16, val2Value: 16 },                    // sv_flt_n
  16: { gainVal: 64 },                                   // distortion
  19: { gainVal: 8 },                                    // sample_hold
};

test('every op insert applies the spec-mandated defaults via the deployed bundle', async ({ page }) => {
  await page.goto('/');
  // Wait for the empty placeholder so we know the editor has booted.
  await page.waitForSelector('.slot.empty-placeholder');

  for (const code of Object.keys(EXPECTED).map(Number)) {
    const expected = EXPECTED[code]!;
    const fields = await page.evaluate(async (code: number) => {
      const { emptySlot } = await import('/src/patch/types.ts');
      const { applyInsertDefaults } = await import('/src/schema/op-metadata.ts');
      const base = { ...emptySlot(), fn: code, outVar: 1 };
      const slot = applyInsertDefaults(base, code);
      // Return only the value-bearing fields; serialisable by Playwright.
      return {
        freqVal: slot.freqVal, val1Value: slot.val1Value, val2Value: slot.val2Value,
        gainVal: slot.gainVal, widthVal: slot.widthVal, val1: slot.val1,
      };
    }, code);
    for (const [k, v] of Object.entries(expected)) {
      expect(fields[k as keyof typeof fields], `op ${code} field ${k}`).toBe(v);
    }
  }
});
