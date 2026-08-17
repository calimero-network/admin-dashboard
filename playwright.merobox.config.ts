import { defineConfig, devices } from '@playwright/test';

/**
 * Multi-node e2e: the dashboard driven against a merobox cluster.
 *
 * Three suites, three jobs:
 *   • playwright.config.ts       — node mocked with `page.route`. Fast,
 *     hermetic, proves the UI.
 *   • playwright.live.config.ts  — ONE real merod. Proves the wiring: request
 *     shapes, response envelopes, auth headers.
 *   • this one                   — TWO real merods, in Docker, via merobox.
 *     Proves the only thing neither of the others can: that membership works
 *     between separate parties. An invitation is a claim about somebody else's
 *     node; with a single node, an invite/join test cannot fail, and so cannot
 *     pass either.
 *
 * merobox is the same harness core uses for its own multi-node e2e, so these
 * nodes are configured the way the rest of the ecosystem tests them.
 *
 * Requires Docker and `merobox` on PATH (`pip install merobox`), and egress:
 * the nodes pull the `merod` image, and one test installs an application the
 * node downloads from the registry.
 */
const PORT = Number(process.env['PW_MEROBOX_PORT'] ?? '4373');

export const BASE_URL = `http://localhost:${PORT}`;
export const APP_PATH = '/admin-dashboard/';

export default defineConfig({
  testDir: './e2e-merobox',
  // The cluster is shared, stateful, and gossip between the nodes is the thing
  // under test — parallel specs would race each other's membership changes.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI']
    ? [
        ['github'],
        ['html', { open: 'never', outputFolder: 'playwright-report-merobox' }],
      ]
    : [['list']],
  // Cross-node propagation is gossip, not a request/response — it settles in
  // seconds but is not instant, and the polls below have to be able to wait.
  timeout: 300_000,
  expect: { timeout: 30_000 },
  outputDir: 'test-results-merobox',
  globalSetup: './e2e-merobox/global-setup.ts',
  globalTeardown: './e2e-merobox/global-teardown.ts',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    url: `${BASE_URL}${APP_PATH}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
