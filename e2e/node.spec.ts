import { test, expect } from '@playwright/test';
import { mockNode } from './fixtures/node';

/**
 * The single-node diagnostics page that replaces the desktop's Nodes tab.
 */
test.describe('Node page', () => {
  test.beforeEach(async ({ page }) => {
    await mockNode(page);
    // Developer Mode gates the route's nav entry, matching the desktop.
    await page.addInitScript(() =>
      localStorage.setItem(
        'calimero-admin-settings',
        JSON.stringify({
          registries: ['https://apps.calimero.network/'],
          developerMode: true,
        }),
      ),
    );
    await page.goto('/admin-dashboard/node');
  });

  test('reports health and peer count', async ({ page }) => {
    await expect(page.getByTestId('node-health')).toHaveText('alive');
    await expect(page.getByTestId('node-peers')).toHaveText('3');
  });

  test('shows the derived node URL and admin API base', async ({ page }) => {
    const origin = new URL(page.url()).origin;
    await expect(
      page.getByText(origin, { exact: false }).first(),
    ).toBeVisible();
    await expect(page.getByText(`${origin}/admin-api`)).toBeVisible();
  });

  test('renders the libp2p network snapshot', async ({ page }) => {
    await expect(page.getByText('12D3KooWMockPeerId')).toBeVisible();
    await expect(page.getByText('/ip4/127.0.0.1/tcp/2428')).toBeVisible();
  });

  test('has no process controls', async ({ page }) => {
    // A browser tab cannot start, stop or create a node, and it cannot read
    // merod's log file — core exposes no logs route at all.
    for (const forbidden of [
      'Start Node',
      'Stop Node',
      'Create New Node',
      'View Logs',
      'Data Directory',
    ]) {
      await expect(page.getByText(forbidden, { exact: false })).toHaveCount(0);
    }
  });

  test('degrades panel-by-panel when an endpoint fails', async ({ page }) => {
    // /usage walks the store and can be slow or unavailable; it must not blank
    // the health and network panels.
    await mockNode(page);
    await page.route('**/admin-api/usage', (route) =>
      route.fulfill({ status: 500, body: 'boom' }),
    );
    await page.goto('/admin-dashboard/node');

    await expect(page.getByTestId('node-health')).toHaveText('alive');
    await expect(
      page.getByText(/Some panels could not be loaded/),
    ).toBeVisible();
    await expect(page.getByText(/Usage:/)).toBeVisible();
  });
});
