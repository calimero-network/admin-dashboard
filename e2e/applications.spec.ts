import { test, expect } from '@playwright/test';
import {
  mockNode,
  APP_WITH_FRONTEND,
  APP_WITHOUT_FRONTEND,
} from './fixtures/node';

test.describe('Applications', () => {
  test.beforeEach(async ({ page }) => {
    await mockNode(page);
    await page.goto('/admin-dashboard/applications');
  });

  test('shows the name and version from bundle metadata', async ({ page }) => {
    // Regression guard for the metadata-schema bug: the pre-port dashboard read
    // `applicationName`, which core never emits, so this cell was blank.
    await expect(page.getByRole('cell', { name: /Mero Blocks/ })).toBeVisible();
    await expect(page.getByRole('cell', { name: '0.1.1' })).toBeVisible();
    await expect(
      page.getByRole('cell', { name: /Headless Service/ }),
    ).toBeVisible();
    await expect(page.getByRole('cell', { name: '2.5.0' })).toBeVisible();
  });

  test('renders size and description columns', async ({ page }) => {
    await expect(page.getByText('512.00 KB')).toBeVisible();
    await expect(
      page.getByText('Minecraft-style P2P voxel sandbox.').first(),
    ).toBeVisible();
  });

  test('offers Open only for apps that declare a frontend', async ({
    page,
  }) => {
    const openButtons = page.getByTestId('open-app');
    await expect(openButtons).toHaveCount(1);

    const row = page
      .locator('tr', { has: page.getByText('Headless Service') })
      .first();
    await expect(row.getByTestId('open-app')).toHaveCount(0);
  });

  test('Open launches the app frontend in a new tab with an SSO hash', async ({
    page,
    context,
  }) => {
    const popupPromise = context.waitForEvent('page');
    await page.getByTestId('open-app').click();
    const popup = await popupPromise;
    // The tab opens at about:blank and is navigated a tick later (see
    // utils/openApp.ts), so wait for the real URL before reading it.
    await popup.waitForURL(/app\.invalid/);

    const url = popup.url();
    expect(url).toContain('https://app.invalid/blocks/');

    const hash = new URLSearchParams(url.split('#')[1] ?? '');
    expect(hash.get('access_token')).toBeTruthy();
    expect(hash.get('node_url')).toBe(new URL(page.url()).origin);
    // Both id contract keys, for mero-js >= 7 and for calimero-client.
    expect(hash.get('application_id')).toBe(APP_WITH_FRONTEND.id);
    expect(hash.get('app-id')).toBe(APP_WITH_FRONTEND.id);

    // The single most important assertion in the suite: a leaked refresh token
    // would let the app tab rotate ours, and core would then revoke the whole
    // token family as reuse (core#3083).
    expect(hash.has('refresh_token')).toBe(false);

    // Cache-buster belongs in the query, never the fragment.
    expect(new URL(url).searchParams.get('_cb')).toBeTruthy();

    await popup.close();
  });

  test('sorts by name', async ({ page }) => {
    // The loading skeleton renders its own non-interactive <th>Name</th> for the
    // first second. Clicking before the real table mounts loses the click.
    await expect(page.getByRole('cell', { name: /Mero Blocks/ })).toBeVisible();

    const nameHeader = page.getByRole('columnheader', { name: /Name/ });
    const firstCell = () =>
      page.locator('tbody tr').first().locator('td').first();

    await nameHeader.click();
    await expect(firstCell()).toContainText('Headless Service');

    await nameHeader.click();
    await expect(firstCell()).toContainText('Mero Blocks');
  });

  test('uninstall routes through a confirmation page', async ({ page }) => {
    const row = page
      .locator('tr', { has: page.getByText('Mero Blocks') })
      .first();
    await row.getByRole('button', { name: 'More options' }).click();
    await page.getByRole('button', { name: /Uninstall/ }).click();

    await expect(
      page.getByRole('heading', { name: 'Uninstall Application' }),
    ).toBeVisible();
    await expect(page.getByText('"Mero Blocks"')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Mero Blocks')).toBeVisible();
  });

  test('right-click opens a context menu', async ({ page }) => {
    await page
      .locator('tr', { has: page.getByText('Mero Blocks') })
      .first()
      .click({ button: 'right' });
    await expect(
      page.getByRole('button', { name: 'Open in new tab' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Copy ID' })).toBeVisible();
  });

  test('empty state points at the Marketplace', async ({ page }) => {
    await mockNode(page, { apps: [] });
    await page.goto('/admin-dashboard/applications');
    await expect(page.getByText('No applications installed')).toBeVisible();
  });

  test('refuses to uninstall an app a context still uses', async ({ page }) => {
    await mockNode(page, {
      apps: [APP_WITH_FRONTEND],
      contexts: [{ id: 'ctx-1', applicationId: APP_WITH_FRONTEND.id }],
    });
    await page.goto('/admin-dashboard/applications');

    await page.getByRole('button', { name: 'More options' }).click();
    await page.getByRole('button', { name: /Uninstall/ }).click();
    await page.getByRole('button', { name: 'Uninstall' }).last().click();

    await expect(page.getByText(/still used by 1 context/)).toBeVisible();
  });

  test('an app without a frontend is still listed', async ({ page }) => {
    await mockNode(page, { apps: [APP_WITHOUT_FRONTEND] });
    await page.goto('/admin-dashboard/applications');
    await expect(page.getByText('Headless Service')).toBeVisible();
    await expect(page.getByTestId('open-app')).toHaveCount(0);
  });
});
