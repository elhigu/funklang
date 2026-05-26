import { defineConfig } from '@playwright/test';

const executablePath = process.env['PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH'];
// slowMo is not a CLI flag in Playwright — it lives under launchOptions.
// Read PLAYWRIGHT_SLOW_MO so `npm run e2e:slow` can wire it in without
// every spec having to know about it.
const slowMoRaw = process.env['PLAYWRIGHT_SLOW_MO'];
const slowMo = slowMoRaw ? Number(slowMoRaw) : 0;

export default defineConfig({
  testDir: 'tests-e2e',
  webServer: { command: 'npm run dev', port: 5173, reuseExistingServer: true },
  use: {
    baseURL: 'http://localhost:5173',
    launchOptions: {
      ...(executablePath ? { executablePath } : {}),
      ...(slowMo > 0 ? { slowMo } : {}),
    },
  },
});
