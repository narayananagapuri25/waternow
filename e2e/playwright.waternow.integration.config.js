import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './integration',
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4179',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...devices['Desktop Chrome']
  },
  webServer: {
    command: 'node ./isolated/waternow-integration-server.mjs',
    cwd: '.',
    url: 'http://127.0.0.1:4179/health',
    reuseExistingServer: false,
    timeout: 30_000
  }
});
