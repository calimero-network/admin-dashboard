import { defineConfig, devices } from '@playwright/test';

/**
 * Live e2e: the dashboard driven against a REAL merod node.
 *
 * Separate from playwright.config.ts on purpose. That suite mocks the node with
 * `page.route`, so it is fast, hermetic and proves the UI. This one boots merod,
 * mints a real admin token and makes real admin-API calls, so it proves the
 * wiring — request shapes, response envelopes, auth headers — which a mock can
 * only assume. Both are worth having; only this one needs a binary download.
 *
 * Playwright owns all three processes and their readiness:
 *   1. merod                (readiness: /admin-api/health)
 *   2. the registry stub    (readiness: /health)
 *   3. the dashboard        (vite preview on the real /admin-dashboard/ path)
 */
const PORT = Number(process.env['PW_LIVE_PORT'] ?? '4273');
const NODE_PORT = Number(process.env['LIVE_SERVER_PORT'] ?? '3628');
const REGISTRY_PORT = Number(process.env['LIVE_REGISTRY_PORT'] ?? '4600');

export const BASE_URL = `http://localhost:${PORT}`;
export const NODE_URL = `http://localhost:${NODE_PORT}`;
export const REGISTRY_URL = `http://localhost:${REGISTRY_PORT}`;
export const APP_PATH = '/admin-dashboard/';

export default defineConfig({
  testDir: './e2e-live',
  // These mutate one shared node: namespaces, contexts and installed apps are
  // global to it. Running them in parallel would have one spec's teardown delete
  // rows another is asserting on.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI']
    ? [
        ['github'],
        ['html', { open: 'never', outputFolder: 'playwright-report-live' }],
      ]
    : [['list']],
  // Real node round-trips (install downloads an artifact, namespace creation
  // writes governance state) are slower than mocked ones.
  timeout: 180_000,
  expect: { timeout: 20_000 },
  outputDir: 'test-results-live',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node scripts/live-node.mjs',
      url: `${NODE_URL}/admin-api/health`,
      // Never reuse, even locally. The node is stateful — these specs install
      // applications and create namespaces — and reusing one from a previous run
      // makes local results diverge from CI, where the node is always fresh.
      // live-node.mjs initialises a throwaway home per start, so this is cheap.
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 120_000,
    },
    {
      command: 'node scripts/live-registry.mjs',
      url: `${REGISTRY_URL}/health`,
      reuseExistingServer: !process.env['CI'],
      timeout: 30_000,
    },
    {
      command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
      url: `${BASE_URL}${APP_PATH}`,
      reuseExistingServer: !process.env['CI'],
      timeout: 180_000,
    },
  ],
});
