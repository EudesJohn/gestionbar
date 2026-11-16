import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  timeout: 45000,
  use: { baseURL: 'http://127.0.0.1:5174', headless: true, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'npm run dev -- --mode e2e --port 5174', url: 'http://127.0.0.1:5174', reuseExistingServer: false, timeout: 30000 },
  projects: [{ name: 'desktop', use: { viewport: { width: 1440, height: 1050 } } }],
});
