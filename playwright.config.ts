import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4192',
    headless: true,
    launchOptions: {
      executablePath: '/usr/bin/google-chrome',
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    },
    trace: 'on-first-retry',
  },
  webServer: {
    command:
      'rm -rf ./test-results/pw-data && HOST=127.0.0.1 PORT=4192 PINTCHECK_DATA_DIR=./test-results/pw-data node --no-warnings server/index.mjs',
    url: 'http://127.0.0.1:4192/api/health',
    reuseExistingServer: false,
    timeout: 60000,
  },
});
