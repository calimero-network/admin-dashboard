import { test, expect } from '@playwright/test';
import { mockNode } from './fixtures/node';

test.describe('Marketplace', () => {
  test.beforeEach(async ({ page }) => {
    await mockNode(page, {
      bundles: [
        {
          package: 'com.calimero.merochat',
          appVersion: '1.2.0',
          metadata: { name: 'Mero Chat', description: 'Chat over Calimero.' },
        },
        {
          package: 'com.calimero.meroblocks',
          appVersion: '0.1.1',
          metadata: { name: 'Mero Blocks', description: 'Voxel sandbox.' },
        },
      ],
    });
    // The cache is keyed on the registry list and served stale-while-revalidate,
    // so a leftover entry from another test would mask the fetch under test.
    await page.addInitScript(() =>
      localStorage.removeItem('calimero-marketplace-cache'),
    );
    await page.goto('/admin-dashboard/marketplace');
  });

  test('lists bundles from the configured registry', async ({ page }) => {
    await expect(page.getByTestId('app-card')).toHaveCount(2);
    await expect(page.getByText('Mero Chat')).toBeVisible();
  });

  test('marks an already-installed app', async ({ page }) => {
    // The default mock node has Mero Blocks installed, correlated by metadata
    // name — the node-assigned app id never matches a registry package id.
    const card = page
      .getByTestId('app-card')
      .filter({ hasText: 'Mero Blocks' });
    await expect(card.getByText('Installed')).toBeVisible();
  });

  test('search filters by name and clears', async ({ page }) => {
    await page.getByTestId('marketplace-search').fill('chat');
    await expect(page.getByTestId('app-card')).toHaveCount(1);

    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(page.getByTestId('app-card')).toHaveCount(2);
  });

  test('filter pills narrow by installed state', async ({ page }) => {
    await page.getByRole('button', { name: 'Installed', exact: true }).click();
    await expect(page.getByTestId('app-card')).toHaveCount(1);

    await page.getByRole('button', { name: 'Not Installed' }).click();
    await expect(page.getByTestId('app-card')).toHaveCount(1);
    await expect(page.getByText('Mero Chat')).toBeVisible();

    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.getByTestId('app-card')).toHaveCount(2);
  });

  test('opens a detail modal with package metadata', async ({ page }) => {
    await page.getByTestId('app-card').filter({ hasText: 'Mero Chat' }).click();
    const modal = page.getByTestId('app-detail-modal');
    await expect(modal).toBeVisible();
    await expect(modal.getByText('com.calimero.merochat')).toBeVisible();
    await expect(modal.getByTestId('modal-install')).toBeVisible();

    await modal.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(modal).toBeHidden();
  });

  test('the version shown belongs to the app that was opened', async ({
    page,
  }) => {
    // Regression guard: fetchAppVersions trusted the registry's ?package=
    // filter, so an unfiltered response offered another app's versions — the
    // Mero Blocks modal showed Mero Chat's 1.2.0 and installing it would have
    // resolved an artifact URL that does not exist for this package.
    await page.getByTestId('app-card').filter({ hasText: 'Mero Chat' }).click();
    const modal = page.getByTestId('app-detail-modal');
    await expect(modal.getByText('com.calimero.merochat')).toBeVisible();
    await expect(modal).toContainText('1.2.0');
    await expect(modal).not.toContainText('0.1.1');
  });

  test('empty registry shows the empty state', async ({ page }) => {
    await mockNode(page, { bundles: [] });
    await page.addInitScript(() =>
      localStorage.removeItem('calimero-marketplace-cache'),
    );
    await page.goto('/admin-dashboard/marketplace');
    await expect(page.getByText('No applications found')).toBeVisible();
  });
});

test.describe('Settings → Registries', () => {
  test.beforeEach(async ({ page }) => {
    await mockNode(page);
    await page.goto('/admin-dashboard/settings');
    await page.getByRole('tab', { name: 'Registries' }).click();
  });

  test('shows the default registry and can add another', async ({ page }) => {
    await expect(
      page.getByText('https://apps.calimero.network/'),
    ).toBeVisible();

    await page.getByLabel('Registry URL').fill('https://other.example/');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('https://other.example/')).toBeVisible();
  });

  test('rejects a non-URL', async ({ page }) => {
    await page.getByLabel('Registry URL').fill('not a url');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText(/valid absolute URL/)).toBeVisible();
  });

  test('refuses to remove the last registry', async ({ page }) => {
    // An empty registry list leaves the Marketplace dead with no way back.
    await expect(page.getByRole('button', { name: 'Remove' })).toBeDisabled();
  });

  test('About tab reports the node it is bound to', async ({ page }) => {
    await page.getByRole('tab', { name: 'About' }).click();
    const origin = new URL(page.url()).origin;
    await expect(page.getByText(`${origin}/admin-api`)).toBeVisible();
    await expect(page.getByText(/bound to exactly one node/)).toBeVisible();
  });
});
