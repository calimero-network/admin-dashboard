import { test, expect } from '@playwright/test';
import { mockNode } from './fixtures/node';

test.describe('App shell', () => {
  test.beforeEach(async ({ page }) => {
    await mockNode(page);
  });

  test('renders sidebar, header title and the node status pill', async ({
    page,
  }) => {
    await page.goto('/admin-dashboard/dashboard');
    await expect(page.getByTestId('shell-page-title')).toHaveText('Home');
    await expect(page.getByTestId('node-status-indicator')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  });

  test('node status reflects a healthy node', async ({ page }) => {
    await page.goto('/admin-dashboard/dashboard');
    const pill = page.getByTestId('node-status-indicator');
    await expect(pill).toHaveAttribute('data-state', 'online');
    await expect(pill).toContainText('Connected');
  });

  test('node status reflects an unhealthy node', async ({ page }) => {
    await mockNode(page, { unhealthy: true });
    await page.goto('/admin-dashboard/dashboard');
    const pill = page.getByTestId('node-status-indicator');
    await expect(pill).toHaveAttribute('data-state', 'offline');
    await expect(pill).toContainText('Disconnected');
  });

  test('navigates between pages and marks the active item', async ({
    page,
  }) => {
    await page.goto('/admin-dashboard/dashboard');

    for (const [label, title] of [
      ['Applications', 'Applications'],
      ['Marketplace', 'Marketplace'],
      ['Namespaces', 'Namespaces'],
      ['Blobs', 'Blobs'],
      ['Identity', 'Identity'],
      ['Settings', 'Settings'],
    ] as const) {
      await page.getByRole('link', { name: label, exact: true }).click();
      await expect(page.getByTestId('shell-page-title')).toHaveText(title);
      await expect(
        page.getByRole('link', { name: label, exact: true }),
      ).toHaveAttribute('aria-current', 'page');
    }
  });

  /**
   * The desktop hides its Nodes tab unless Developer Mode is on; we mirror that
   * for the Node diagnostics page.
   */
  test('Node page is hidden until Developer Mode is enabled', async ({
    page,
  }) => {
    await page.goto('/admin-dashboard/dashboard');
    await expect(
      page.getByRole('link', { name: 'Node', exact: true }),
    ).toHaveCount(0);

    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Developer Mode').check({ force: true });
    await page.reload();

    await expect(
      page.getByRole('link', { name: 'Node', exact: true }),
    ).toBeVisible();
  });

  test('there is no multi-node UI anywhere', async ({ page }) => {
    // This dashboard administers exactly one node — the one serving it. Any of
    // these strings reappearing means desktop-only node lifecycle leaked in.
    await page.goto('/admin-dashboard/dashboard');
    for (const forbidden of [
      'Create New Node',
      'Start Node',
      'Stop Node',
      'Swarm Port',
      'Restart Node',
      'Connect to Node',
    ]) {
      await expect(page.getByText(forbidden, { exact: false })).toHaveCount(0);
    }
  });

  test('Home carries the desktop copy with the product name swapped', async ({
    page,
  }) => {
    await page.goto('/admin-dashboard/dashboard');
    await expect(
      page.getByRole('heading', { name: 'Welcome to Admin Dashboard' }),
    ).toBeVisible();
    await expect(
      page.getByText(/gateway to decentralized applications/),
    ).toBeVisible();
    // Never brand this app as the desktop.
    await expect(page.getByText('Welcome to Calimero Desktop')).toHaveCount(0);
  });

  test('Home shows the Node Status card, without a Restart control', async ({
    page,
  }) => {
    await page.goto('/admin-dashboard/dashboard');
    await expect(
      page.getByRole('heading', { name: 'Node Status' }),
    ).toBeVisible();
    await expect(page.getByTestId('home-node-status')).toContainText(
      'Connected',
    );
    // A browser tab cannot start a process, so the desktop's button is absent.
    await expect(
      page.getByRole('button', { name: /Restart Node/ }),
    ).toHaveCount(0);
  });

  test('Home Quick Actions match the desktop set', async ({ page }) => {
    await page.goto('/admin-dashboard/dashboard');
    for (const label of ['Browse Marketplace', 'Applications', 'Settings']) {
      await expect(
        page.getByText(label, { exact: true }).first(),
      ).toBeVisible();
    }
    await expect(
      page.getByText('Discover and install new applications'),
    ).toBeVisible();
    await expect(
      page.getByText('View and manage your applications'),
    ).toBeVisible();
  });

  test('the document title is Admin Dashboard', async ({ page }) => {
    await page.goto('/admin-dashboard/dashboard');
    await expect(page).toHaveTitle('Admin Dashboard');
  });

  test('404 route renders inside the shell', async ({ page }) => {
    await page.goto('/admin-dashboard/does-not-exist');
    await expect(page.getByText('404')).toBeVisible();
    await page.getByRole('button', { name: /Back to Dashboard/ }).click();
    await expect(page.getByTestId('shell-page-title')).toHaveText('Home');
  });

  test('logout clears the session and returns to login', async ({ page }) => {
    await page.goto('/admin-dashboard/dashboard');
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page.getByTestId('login-screen')).toBeVisible();
  });
});

test.describe('Auth', () => {
  test('shows the login screen without a session', async ({ page }) => {
    // mockNode without seedSession: no tokens in storage.
    await page.route('**/admin-api/health', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { status: 'alive' } }),
      }),
    );
    await page.goto('/admin-dashboard/dashboard');
    await expect(page.getByTestId('login-screen')).toBeVisible();
    await expect(page.getByTestId('login-button')).toBeVisible();
  });

  test('login screen names the node it will sign into', async ({ page }) => {
    await page.goto('/admin-dashboard/dashboard');
    const origin = new URL(page.url()).origin;
    await expect(page.getByText(origin, { exact: false })).toBeVisible();
  });

  test('a 401 from the node sends the user back to login', async ({ page }) => {
    await mockNode(page);
    // Re-register the applications route to 401 AFTER the fixture, so it wins.
    await page.route('**/admin-api/applications', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 401, message: 'Unauthorized' } }),
      }),
    );
    await page.goto('/admin-dashboard/dashboard');
    await expect(page.getByTestId('login-screen')).toBeVisible();
  });
});
