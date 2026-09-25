import { defineConfig } from '@playwright/test';

const API_PORT = 8010;
const WEB_PORT = 5183;

export default defineConfig({
  testDir: './e2e',
  // One backend + one DB per run; specs create uniquely-named data.
  workers: 1,
  reporter: [['list']],
  expect: { timeout: 10_000 }, // first page hit pays Vite's cold compile
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    channel: 'chrome', // system Chrome — no browser download needed
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'bash e2e/start-backend.sh',
      url: `http://127.0.0.1:${API_PORT}/api/v1/ping`,
      env: { E2E_API_PORT: String(API_PORT) },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: `npx vite --port ${WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: { NORTHOS_API_PROXY: `http://127.0.0.1:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
