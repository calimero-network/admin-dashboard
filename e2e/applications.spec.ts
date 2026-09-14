import { test, expect, type Page } from '@playwright/test';
import {
  mockNode,
  APP_WITH_FRONTEND,
  APP_WITHOUT_FRONTEND,
} from './fixtures/node';

/** One installed-app card, picked by the name it renders. */
function card(page: Page, name: string) {
  return page.getByTestId('installed-app-card').filter({ hasText: name });
}

test.describe('Applications', () => {
  test.beforeEach(async ({ page }) => {
    await mockNode(page);
    await page.goto('/admin-dashboard/applications');
  });

  test('shows the name and version from bundle metadata', async ({ page }) => {
    // Regression guard for the metadata-schema bug: the pre-port dashboard read
    // `applicationName`, which core never emits, so this was blank.
    const blocks = card(page, 'Mero Blocks');
    await expect(blocks).toContainText('v0.1.1');
    await expect(card(page, 'Headless Service')).toContainText('v2.5.0');
  });

  test('renders size and description on the card', async ({ page }) => {
    const blocks = card(page, 'Mero Blocks');
    // 512 KB exactly — formatBytes drops the trailing `.00` the table printed.
    await expect(blocks).toContainText('512 KB');
    await expect(blocks).toContainText('Minecraft-style P2P voxel sandbox.');
    await expect(blocks).toContainText('com.calimero.meroblocks');
  });

  test('cards render the bundle icon instead of a row of text', async ({
    page,
  }) => {
    // The whole point of the grid: these bundles have carried a launcher icon
    // in their metadata all along — the desktop already hands the same field to
    // create_desktop_shortcut — and the table never showed it.
    const icon = card(page, 'Mero Blocks').locator('img.app-icon-img');
    await expect(icon).toBeVisible();
    await expect(icon).toHaveJSProperty('naturalWidth', 1);
  });

  test('an app with no icon falls back to a letter tile', async ({ page }) => {
    await expect(
      card(page, 'Headless Service').getByTestId('app-icon-fallback'),
    ).toHaveText('H');
  });

  test('offers Open only for apps that declare a frontend', async ({
    page,
  }) => {
    const openButtons = page.getByTestId('open-app');
    await expect(openButtons).toHaveCount(1);

    await expect(
      card(page, 'Headless Service').getByTestId('open-app'),
    ).toHaveCount(0);
    await expect(card(page, 'Headless Service')).toContainText(
      'No web frontend',
    );
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
    // The table's sortable columns went with the table; the sorts it offered
    // are a control now. Guarding that the capability survived the redesign.
    await expect(card(page, 'Mero Blocks')).toBeVisible();
    const first = () => page.getByTestId('installed-app-card').first();

    await expect(first()).toContainText('Headless Service');
    await page.getByTestId('installed-sort').selectOption('name-desc');
    await expect(first()).toContainText('Mero Blocks');
    await page.getByTestId('installed-sort').selectOption('name-asc');
    await expect(first()).toContainText('Headless Service');
  });

  test('sorts by size', async ({ page }) => {
    await expect(card(page, 'Mero Blocks')).toBeVisible();
    await page.getByTestId('installed-sort').selectOption('size');
    // Headless Service is 1 MB, Mero Blocks 512 KB.
    await expect(page.getByTestId('installed-app-card').first()).toContainText(
      'Headless Service',
    );
    await page.getByTestId('installed-sort').selectOption('name-asc');
    await expect(page.getByTestId('installed-app-card').first()).toContainText(
      'Headless Service',
    );
  });

  test('uninstall routes through a confirmation page', async ({ page }) => {
    await card(page, 'Mero Blocks')
      .getByRole('button', { name: /More options/ })
      .click();
    await page.getByRole('button', { name: /Uninstall/ }).click();

    await expect(
      page.getByRole('heading', { name: 'Uninstall Application' }),
    ).toBeVisible();
    await expect(page.getByText('"Mero Blocks"')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Mero Blocks')).toBeVisible();
  });

  test('right-click opens a context menu', async ({ page }) => {
    await card(page, 'Mero Blocks').click({ button: 'right' });
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
