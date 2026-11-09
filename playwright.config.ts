import { defineConfig, devices } from '@playwright/test';

/** Wide enough for the lab beside a pane. */
const VIEWPORT = { width: 1440, height: 900 };

/**
 * The Watchtower Lab's suite: the real library and aws-rum-web in Chromium
 * and WebKit, against the lab's mock backend. `npm run e2e` builds the lab
 * first; its server then renders the shell, serves the fragment and answers
 * as the backend, on one port beside `npm run lab`'s.
 */
export default defineConfig({
  testDir: 'playwright',
  // The mock backend's state is shared — what it received, its broker mode,
  // its telemetries — so tests run one at a time.
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4390',
    trace: 'on-first-retry'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORT }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: VIEWPORT }
    }
  ],
  webServer: {
    command: 'node dist/watchtower-lab/server/server.mjs',
    env: { PORT: '4390' },
    url: 'http://localhost:4390/__lab/state',
    // Never one already running: it would serve whatever build it started
    // with, not the one just made.
    reuseExistingServer: false
  }
});
