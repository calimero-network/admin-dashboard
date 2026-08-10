import { test, expect } from '@playwright/test';
import {
  openDashboard,
  adminApi,
  uninstallAllApps,
  PROBE_NAME,
  PROBE_VERSION,
  REAL_APP_NAME,
  REAL_PACKAGE,
  NODE_URL,
} from './fixtures/live';

interface AppsResponse {
  data?: { apps?: { id: string }[] };
}

/**
 * Marketplace reads, against the LOCAL stub registry.
 *
 * The stub is used here because these assertions are about parsing a v2 registry
 * response deterministically — bundle count, version list, installed marking —
 * and pinning them to whatever is published on apps.calimero.network today would
 * make the suite fail on unrelated registry changes.
 */
test.describe('Live: Marketplace reads a registry', () => {
  test('lists the stub bundle and offers its versions', async ({ page }) => {
    await openDashboard(page, '/admin-dashboard/marketplace', {
      useStubRegistry: true,
    });

    const card = page.getByTestId('app-card').filter({ hasText: PROBE_NAME });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText(`v${PROBE_VERSION}`);
    await expect(card.getByRole('button', { name: 'Install' })).toBeVisible();

    await card.click();
    const modal = page.getByTestId('app-detail-modal');
    await expect(modal).toBeVisible();

    // The stub publishes 1.4.2 and 1.0.0; the newest non-yanked must be default.
    const picker = modal.getByTestId('version-picker');
    await expect(picker.locator('option')).toHaveCount(2);
    await expect(picker).toHaveValue(PROBE_VERSION);
  });

  test('search and filter pills work against live data', async ({ page }) => {
    await openDashboard(page, '/admin-dashboard/marketplace', {
      useStubRegistry: true,
    });
    await expect(page.getByTestId('app-card')).toHaveCount(1);

    await page.getByTestId('marketplace-search').fill('nothing-matches-this');
    await expect(page.getByTestId('app-card')).toHaveCount(0);
    await expect(page.getByText('No applications found')).toBeVisible();

    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(page.getByTestId('app-card')).toHaveCount(1);

    // Nothing is installed on a fresh node.
    await page.getByRole('button', { name: 'Installed', exact: true }).click();
    await expect(page.getByTestId('app-card')).toHaveCount(0);
  });
});

/**
 * The real install path, end to end: registry -> artifact download by the node ->
 * blob stored -> metadata read back by the dashboard.
 *
 * This one uses the PUBLIC registry, and has to: core refuses install URLs whose
 * host is loopback or private (an SSRF control applied at both validation and
 * fetch time), so a localhost stub cannot serve an install. The upside is that it
 * exercises a genuine .mpk bundle, so the metadata the dashboard reads back is
 * produced by BundleManifest::to_metadata_json — the exact path that used to
 * render every installed app nameless.
 *
 * Serial, because each step builds on the node state the previous one left.
 */
test.describe.serial('Live: install and uninstall from the registry', () => {
  test.beforeAll(async () => {
    await uninstallAllApps();
  });

  test.afterAll(async () => {
    await uninstallAllApps();
  });

  test('installs a real bundle onto the node', async ({ page }) => {
    await openDashboard(page, '/admin-dashboard/marketplace');

    // Select by PACKAGE, never by display name: the registry currently publishes
    // two bundles both named "Mero Chat" (com.calimero.chat and the older
    // com.calimero.curb), so picking `.first()` by name chose between them
    // non-deterministically — and one of them has no resolvable artifact, which
    // made this test flaky. Search matches the package id as well as the name.
    await page.getByTestId('marketplace-search').fill(REAL_PACKAGE);

    const card = page.getByTestId('app-card').first();
    await expect(card).toBeVisible();
    await card.click();

    const modal = page.getByTestId('app-detail-modal');
    await expect(modal).toBeVisible();
    // Prove we opened the package we meant to.
    await expect(modal).toContainText(REAL_PACKAGE);

    const install = modal.getByTestId('modal-install');
    // The button is disabled while the version list loads; clicking then would
    // silently do nothing and the poll below would time out with no clue why.
    await expect(install).toBeEnabled();
    await install.click();

    // Any error toast is the node's own reason — surface it rather than letting
    // the poll below fail with a bare timeout.
    const errorToast = page.locator('.toast-error');
    if (await errorToast.count()) {
      throw new Error(
        `Install reported: ${await errorToast.first().innerText()}`,
      );
    }

    // Assert against the node, not the modal: the node downloading the artifact
    // is the slow part, and it is also the source of truth. Polling it avoids
    // depending on exactly when the modal's button label flips.
    //
    // This is the ONE test in the suite that reaches the public internet — the
    // node must fetch from apps.calimero.network because core refuses loopback
    // install URLs. If it fails while everything else passes, suspect the
    // registry or egress, not the dashboard. CI retries once for that reason.
    await expect
      .poll(
        async () => {
          const { body } = await adminApi<AppsResponse>('GET', '/applications');
          return body.data?.apps?.length ?? 0;
        },
        {
          timeout: 150_000,
          intervals: [1000, 2000, 5000],
          message:
            'The node never registered the application. It has to download the ' +
            'bundle from apps.calimero.network; check egress and that the ' +
            'package is still published.',
        },
      )
      .toBe(1);

    // And the row records where it came from.
    const { body } = await adminApi<{
      data?: { apps?: { source?: string; size?: number }[] };
    }>('GET', '/applications');
    const installed = body.data?.apps?.[0];
    expect(installed?.source).toContain('apps.calimero.network');
    expect(installed?.size ?? 0).toBeGreaterThan(1000);
  });

  test('Applications renders the bundle metadata the node stored', async ({
    page,
  }) => {
    await openDashboard(page, '/admin-dashboard/applications');

    // The regression this whole port turns on: `name` and `version` come from
    // the bundle manifest's flat metadata JSON, not the legacy
    // `applicationName` keys, and this cell was blank before.
    // `.first()` — the description cell also contains the app name.
    await expect(
      page.getByRole('cell', { name: new RegExp(REAL_APP_NAME) }).first(),
    ).toBeVisible();

    const row = page.locator('tr').filter({ hasText: REAL_APP_NAME }).first();
    // A real 300KB-ish artifact, so the size column must show a real figure.
    await expect(row).toContainText(/\d+\.\d{2} (KB|MB)/);
    // The bundle declares links.frontend, so Open must be offered.
    await expect(row.getByTestId('open-app')).toBeVisible();
  });

  test('Open hands the app an access token and no refresh token', async ({
    page,
    context,
  }) => {
    // Read the frontend the bundle declared, so we can stub exactly that origin.
    const { body } = await adminApi<{
      data?: { apps?: { metadata?: number[] }[] };
    }>('GET', '/applications');
    const rawMeta = body.data?.apps?.[0]?.metadata ?? [];
    const meta = JSON.parse(
      new TextDecoder().decode(new Uint8Array(rawMeta)),
    ) as { links?: { frontend?: string } };
    const frontend = meta.links?.frontend;
    expect(frontend, 'the bundle declared no links.frontend').toBeTruthy();
    const frontendOrigin = new URL(frontend as string).origin;

    // Stub the app's site. Not for speed — for correctness: the real frontend
    // runs mero-react, which strips the SSO params out of the address bar on
    // boot (window.history.replaceState in MeroProvider). Reading popup.url()
    // after that returns a hash-less URL and the assertions below see nothing.
    // Routed on the CONTEXT because a popup is a separate Page.
    await context.route(`${frontendOrigin}/**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<!doctype html><title>stub</title>',
      }),
    );

    await openDashboard(page, '/admin-dashboard/applications');
    const row = page.locator('tr').filter({ hasText: REAL_APP_NAME }).first();

    const popupPromise = context.waitForEvent('page');
    await row.getByTestId('open-app').click();
    const popup = await popupPromise;

    await expect
      .poll(() => popup.url(), { timeout: 20_000 })
      .not.toBe('about:blank');

    const hash = new URLSearchParams(popup.url().split('#')[1] ?? '');
    // A real node-minted JWT, forwarded to the app.
    expect(hash.get('access_token')?.split('.')).toHaveLength(3);
    // The node the dashboard is actually pointed at, so the app talks to the
    // same one rather than to whatever origin served the dashboard.
    expect(hash.get('node_url')).toBe(NODE_URL);
    // The assertion this feature lives or dies on (core#3083).
    expect(hash.has('refresh_token')).toBe(false);

    await popup.close();
  });

  test('the Marketplace marks it installed', async ({ page }) => {
    await openDashboard(page, '/admin-dashboard/marketplace');
    const card = page
      .getByTestId('app-card')
      .filter({ hasText: REAL_APP_NAME })
      .first();
    await expect(card.getByText('Installed')).toBeVisible();
  });

  test('uninstalls it through the confirmation page', async ({ page }) => {
    await openDashboard(page, '/admin-dashboard/applications');

    const row = page.locator('tr').filter({ hasText: REAL_APP_NAME }).first();
    await row.getByRole('button', { name: 'More options' }).click();
    await page.getByRole('button', { name: /Uninstall/ }).click();

    await expect(
      page.getByRole('heading', { name: 'Uninstall Application' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Uninstall' }).last().click();

    await expect(page.getByText('No applications installed')).toBeVisible();

    const { body } = await adminApi<AppsResponse>('GET', '/applications');
    expect(body.data?.apps ?? []).toHaveLength(0);
  });
});
