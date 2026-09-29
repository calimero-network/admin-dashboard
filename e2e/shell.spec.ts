import { test, expect } from '@playwright/test';
import { APP_WITH_FRONTEND, mockNode } from './fixtures/node';

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

  test('Node page shows by default and hides once Developer Mode is turned off', async ({
    page,
  }) => {
    await page.goto('/admin-dashboard/dashboard');
    await expect(
      page.getByRole('link', { name: 'Node', exact: true }),
    ).toBeVisible();

    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await page.getByLabel('Developer Mode').uncheck({ force: true });
    await page.reload();

    await expect(
      page.getByRole('link', { name: 'Node', exact: true }),
    ).toHaveCount(0);
  });

  test('a stored developerMode: false that was never chosen stays on', async ({
    page,
  }) => {
    await page.addInitScript(() =>
      localStorage.setItem(
        'calimero-admin-settings',
        JSON.stringify({
          registries: ['https://apps.calimero.network/'],
          developerMode: false,
        }),
      ),
    );
    await page.goto('/admin-dashboard/dashboard');
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

  test('Home shows installed apps with the Applications page card', async ({
    page,
  }) => {
    await page.goto('/admin-dashboard/dashboard');
    const grid = page.getByTestId('home-apps-grid');
    const blocks = grid
      .getByTestId('installed-app-card')
      .filter({ hasText: 'Mero Blocks' });
    await expect(blocks.locator('img.app-icon-img')).toBeVisible();
    await expect(blocks).toContainText('Minecraft-style P2P voxel sandbox.');
    const headless = grid
      .getByTestId('installed-app-card')
      .filter({ hasText: 'Headless Service' });
    await expect(headless.getByTestId('app-icon-fallback')).toHaveText('H');
  });

  test('Home app cards offer Open, and nothing that removes an app', async ({
    page,
    context,
  }) => {
    await page.goto('/admin-dashboard/dashboard');
    const grid = page.getByTestId('home-apps-grid');
    await expect(
      grid.getByRole('button', { name: /More options/ }),
    ).toHaveCount(0);
    const headless = grid
      .getByTestId('installed-app-card')
      .filter({ hasText: 'Headless Service' });
    await expect(headless.getByTestId('open-app')).toHaveCount(0);
    await expect(headless).toContainText('No web frontend');

    const popupPromise = context.waitForEvent('page');
    await grid.getByTestId('open-app').click();
    const popup = await popupPromise;
    await popup.waitForURL(/app\.invalid/);
    const hash = new URLSearchParams(popup.url().split('#')[1] ?? '');
    expect(hash.get('application_id')).toBe(APP_WITH_FRONTEND.id);
    expect(hash.get('dev_mode')).toBe('1');
    await popup.close();
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

  test('logout retires the refresh token on the node', async ({ page }) => {
    const retired: unknown[] = [];
    await page.route('**/auth/logout', async (route) => {
      retired.push(route.request().postDataJSON());
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { success: true }, error: null }),
      });
    });
    await page.goto('/admin-dashboard/dashboard');
    await page.getByRole('button', { name: 'Logout' }).click();
    await expect(page.getByTestId('login-screen')).toBeVisible();
    expect(retired).toEqual([{ refresh_token: 'refresh-e2e' }]);
  });
});

test.describe('Auth', () => {
  const craftedHash = () => {
    const b64 = (obj: unknown) => btoa(JSON.stringify(obj));
    const jwt = [
      b64({ alg: 'none', typ: 'JWT' }),
      b64({ sub: 'attacker', exp: 4102444800, permissions: ['admin'] }),
      'sig',
    ].join('.');
    return `#access_token=${jwt}&refresh_token=attacker-refresh`;
  };

  test('a crafted token link does not log in', async ({ page }) => {
    await page.goto(`/admin-dashboard/dashboard${craftedHash()}`);
    await expect(page.getByTestId('login-screen')).toBeVisible();
    expect(page.url()).not.toContain('access_token');
    const stored = await page.evaluate(() =>
      localStorage.getItem('refresh-token'),
    );
    expect(stored).toBeNull();
  });

  test('a crafted token link does not replace an existing session', async ({
    page,
  }) => {
    await mockNode(page);
    await page.goto(`/admin-dashboard/dashboard${craftedHash()}`);
    await expect(page.getByTestId('shell-page-title')).toHaveText('Home');
    expect(page.url()).not.toContain('access_token');
    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('refresh-token') ?? 'null'),
    );
    expect(stored).toBe('refresh-e2e');
  });

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

  test('Clear session unpins a node chosen with ?nodeUrl=', async ({
    page,
  }) => {
    // The bug: `?nodeUrl=` is persisted and outranks the serving origin for the
    // rest of the browser session, and "Clear session" cleared the tokens but
    // left it — so a dashboard once pointed elsewhere could not be pointed
    // back, and the button appeared to do nothing.
    const origin = 'http://localhost:4173';
    const other = 'http://localhost:9999';

    await page.goto(`/admin-dashboard/dashboard?nodeUrl=${other}`);
    await expect(page.getByTestId('login-screen')).toBeVisible();
    await expect(page.getByText(other, { exact: false })).toBeVisible();

    // It sticks across a navigation without the parameter — that is the trap.
    await page.goto('/admin-dashboard/dashboard');
    await expect(page.getByText(other, { exact: false })).toBeVisible();

    await page.getByRole('button', { name: 'Clear session' }).click();

    // Back to the node that served the page, and the LABEL has to move too:
    // the override was already being cleared correctly while the screen kept
    // showing the old node, which is indistinguishable from a no-op.
    await expect(page.getByText(origin, { exact: false })).toBeVisible();
    await expect(page.getByText(other, { exact: false })).toHaveCount(0);
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
