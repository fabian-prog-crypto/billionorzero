import { defineConfig } from '@playwright/test';

const PORT = Number(process.env.PLAYWRIGHT_PORT || 3100);
const HOST = process.env.PLAYWRIGHT_HOST || '127.0.0.1';
const BASE_URL = `http://${HOST}:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
  },
  webServer: {
    command: `npm run dev -- --hostname ${HOST} --port ${PORT}`,
    url: BASE_URL,
    // Avoid reusing arbitrary local dev servers that may run different code/state.
    reuseExistingServer: false,
    timeout: 120000,
  },
});
