import { test, expect } from '@playwright/test';
import { openDashboard, mintAdminToken, NODE_URL } from './fixtures/live';

/**
 * Proves the seam a mocked suite cannot: a real JWT from the node's auth API is
 * accepted by the admin API, and the dashboard's request shapes and response
 * unwrapping match what merod actually sends.
 */
test.describe('Live: connection', () => {
  test('mints a usable admin token from the real auth API', async () => {
    const { accessToken } = await mintAdminToken();
    // A JWT, not an opaque string — the SDK parses the payload.
    expect(accessToken.split('.')).toHaveLength(3);
  });

  test('loads the dashboard against a real node and reports Connected', async ({
    page,
  }) => {
    await openDashboard(page, '/admin-dashboard/dashboard');

    await expect(page.getByTestId('shell-page-title')).toHaveText('Home');
    // Not the login screen: the real token was accepted.
    await expect(page.getByTestId('login-screen')).toHaveCount(0);

    const pill = page.getByTestId('node-status-indicator');
    await expect(pill).toHaveAttribute('data-state', 'online');
    await expect(page.getByTestId('home-node-status')).toContainText(
      'Connected',
    );
    await expect(
      page.getByText(NODE_URL, { exact: false }).first(),
    ).toBeVisible();
  });

  test('Node page shows real diagnostics, not placeholders', async ({
    page,
  }) => {
    await openDashboard(page, '/admin-dashboard/node', { developerMode: true });

    await expect(page.getByTestId('node-health')).toHaveText('alive');
    await expect(page.getByTestId('node-readiness')).toHaveText('ready');

    // A real libp2p peer id, base58 starting 12D3Koo for ed25519 keys. `.first()`
    // because a connected node also lists it under Relays and Rendezvous.
    await expect(page.getByText(/^12D3Koo\w{20,}/).first()).toBeVisible();
    // A real listen multiaddr for the swarm port we booted on.
    await expect(page.getByText(/\/ip4\/.*\/tcp\/\d+/).first()).toBeVisible();
    await expect(page.getByTestId('node-peers')).toHaveText(/^\d+$/);
  });

  test('an empty node reports zero everywhere rather than erroring', async ({
    page,
  }) => {
    await openDashboard(page, '/admin-dashboard/applications');
    await expect(page.getByText('No applications installed')).toBeVisible();
    // No error banner: an empty list is a success, not a failure.
    await expect(page.locator('.error-message')).toHaveCount(0);
  });
});
