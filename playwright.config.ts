import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config.
 *
 * The suite runs against `vite preview` serving the production build, NOT the
 * dev server. That matters: the app is deployed at `/admin-dashboard/` (baked
 * into merod by core/crates/server/build.rs), and the node URL is derived from
 * that path. The dev server at `/` takes the `VITE_NODE_URL` branch instead, so
 * testing there would exercise a code path real users never hit.
 *
 * The node itself is mocked per-test via `page.route` (see e2e/fixtures/node.ts)
 * so the suite needs no merod and is safe to run in CI.
 */
const PORT = Number(process.env['PW_PORT'] ?? '4173');
export const BASE_URL = `http://localhost:${PORT}`;
export const APP_PATH = '/admin-dashboard/';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  // Omitted rather than set to undefined: exactOptionalPropertyTypes treats
  // "present and undefined" as a different type from "absent".
  ...(process.env['CI'] ? { workers: 1 } : {}),
  reporter: process.env['CI']
    ? [['github'], ['html', { open: 'never' }]]
    : [['list']],
  timeout: 30_000,
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    url: `${BASE_URL}${APP_PATH}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
