import { defineConfig, devices } from '@playwright/test';

// UI tests run against the browser build of Scribble, which uses the in-browser
// SQLite adapter. This keeps critical UI coverage available without requiring a
// full Rust toolchain on every machine.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:1420',
    trace: 'retain-on-failure',
    permissions: [],
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // The interface tests run against the production build, so the real
    // Content Security Policy and the real bundle are exercised.
    command: 'npm run build && npx vite preview --port 1420 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:1420',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
