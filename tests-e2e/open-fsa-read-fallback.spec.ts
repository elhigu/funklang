// Regression test for the "FSA picker succeeds but the patch is never
// loaded into the UI" bug.
//
// Symptom: on some systems (user reported NixOS + Wayland portal +
// GNOME Files), `showOpenFilePicker` resolves successfully and the
// user can pick a file — but `handle.getFile()` or `file.arrayBuffer()`
// silently throws / returns nothing. Without a fallback the patch is
// simply dropped on the floor.
//
// Strategy:
//   1. Stub `showOpenFilePicker` to return a handle whose `getFile()`
//      throws an arbitrary non-Abort error. (This is the deterministic
//      version of what the user's setup does intermittently.)
//   2. Stub the eventual `<input type=file>` fallback to deliver the
//      loctro5 fixture's bytes.
//   3. Click OPEN PATCH.
//   4. Wait for the file-name strip to reflect the loctro5 filename and
//      for the sidebar to populate — proves the patch reached the UI.
//
// Before the fix (commit will follow this one), the test fails because
// the FSA failure isn't routed to the input fallback.

import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURE = resolve(__dirname, '../../loctro5 3 chippisamplea.akp');
const FIXTURE_NAME = 'loctro5 3 chippisamplea.akp';

test('OPEN PATCH falls back to <input> when FSA picker succeeds but the read fails', async ({ page }) => {
  // Read the fixture once (Node side) and inject its bytes into the page
  // as a base64 string so the page-side stub can hand them to the input.
  const bytes = await readFile(FIXTURE);
  const b64 = bytes.toString('base64');

  await page.addInitScript((b64Bytes: string) => {
    const w = window as unknown as {
      showOpenFilePicker: unknown;
      __testFileBytes: Uint8Array;
    };
    // Decode the fixture inside the page.
    const bin = atob(b64Bytes);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    w.__testFileBytes = arr;

    // FSA picker: pretends to succeed (returns a handle), but the handle's
    // getFile() throws. The phase-1 "show picker" succeeds; phase-2
    // "read the file" is where the failure lands.
    w.showOpenFilePicker = async () => {
      const handle = {
        kind: 'file',
        name: 'sneaky.akp',
        getFile: async () => { throw new DOMException('simulated FSA read failure', 'NotReadableError'); },
      } as unknown as FileSystemFileHandle;
      return [handle];
    };

    // <input type=file> fallback: when click() is called on a file input,
    // shove the fixture bytes in and dispatch 'change' so the page's
    // onchange handler picks them up.
    const origClick = HTMLInputElement.prototype.click;
    HTMLInputElement.prototype.click = function () {
      if (this.type === 'file') {
        const data = w.__testFileBytes;
        const file = new File([data], 'loctro5 3 chippisamplea.akp', { type: 'application/octet-stream' });
        const dt = new DataTransfer();
        dt.items.add(file);
        Object.defineProperty(this, 'files', { value: dt.files, configurable: true });
        this.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
      return origClick.apply(this);
    };
  }, b64);

  await page.goto('/');
  await page.locator('#btn-open').click();

  // The patch should land in the UI even though the FSA read failed.
  await expect(page.locator('#file-name')).toHaveText(FIXTURE_NAME, { timeout: 5000 });
  await expect(page.locator('#instr-list .instr-row:not(.empty)').first()).toBeVisible();
});
