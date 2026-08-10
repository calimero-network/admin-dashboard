import { test, expect } from '@playwright/test';
import {
  openDashboard,
  adminApi,
  installProbeApp,
  uninstallAllApps,
  uniqueName,
} from './fixtures/live';

/**
 * Namespace and group creation against a real node.
 *
 * This is the deepest live path in the suite: creating a namespace writes
 * governance state, mints a namespace identity, and the counts the UI shows come
 * straight back out of the store. None of it can be faked convincingly by a mock,
 * because the request shapes are the thing under test — `exactOptionalPropertyTypes`
 * made the alias field an easy thing to get subtly wrong.
 *
 * Serial: the group and delete steps operate on the namespace the first test made.
 */
/**
 * NOTE — the node does not persist a namespace alias. POST /admin-api/namespaces
 * accepts `alias` and returns 200, but the namespace it creates comes back from
 * GET /admin-api/namespaces with no alias field at all, so the UI has nothing to
 * render. (Same shape of problem as subgroup names, which are also dropped.)
 * These tests therefore identify the namespace by id and by count, not by the
 * alias typed into the form.
 */
test.describe.serial('Live: namespaces', () => {
  const nsAlias = uniqueName('e2e-ns');
  let appId = '';
  let createdNamespaceId = '';

  test.beforeAll(async () => {
    await uninstallAllApps();
    // A namespace targets an application, so one has to exist first. Installed
    // directly rather than through the Marketplace: this spec is about
    // namespaces, and a dev install is deterministic and offline.
    appId = await installProbeApp();
  });

  test.afterAll(async () => {
    // Best-effort teardown so a rerun starts clean even if a step failed.
    // Delete every namespace: the node is exclusive to this run, and aliases are
    // not persisted so there is nothing to filter on.
    const { body } = await adminApi<{
      data?: { namespaceId: string }[];
    }>('GET', '/namespaces');
    for (const ns of Array.isArray(body.data) ? body.data : []) {
      await adminApi('DELETE', `/namespaces/${ns.namespaceId}`);
    }
    await uninstallAllApps();
  });

  test('starts with no namespaces', async ({ page }) => {
    await openDashboard(page, '/admin-dashboard/namespaces');
    await expect(page.getByTestId('shell-page-title')).toHaveText('Namespaces');
    await expect(page.getByText('No namespaces found')).toBeVisible();
  });

  test('creates a namespace against the installed application', async ({
    page,
  }) => {
    await openDashboard(page, '/admin-dashboard/namespaces');

    await page.getByRole('button', { name: /New Namespace/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Create Namespace' }),
    ).toBeVisible();

    // The app select is populated from the node's installed applications, so
    // choosing by value proves that list loaded.
    await page.locator('select').first().selectOption(appId);
    await page.getByPlaceholder('e.g. my-namespace').fill(nsAlias);
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    // The node is the source of truth, and creating a namespace writes
    // governance state — poll it rather than racing the list refresh.
    await expect
      .poll(
        async () => {
          const { body } = await adminApi<{
            data?: { namespaceId: string; targetApplicationId?: string }[];
          }>('GET', '/namespaces');
          const rows = Array.isArray(body.data) ? body.data : [];
          const match = rows.find((ns) => ns.targetApplicationId === appId);
          if (match) createdNamespaceId = match.namespaceId;
          return rows.length;
        },
        { timeout: 60_000, intervals: [1000, 2000, 5000] },
      )
      .toBe(1);

    expect(createdNamespaceId).toBeTruthy();

    // Then the UI must show it. Refresh explicitly: the list is fetched on
    // mount, so this asserts the read path, not the create path's re-render.
    // Matched on the truncated id the table renders, since the alias is dropped.
    await page.getByRole('button', { name: 'Refresh' }).first().click();
    await expect(
      page.getByText(createdNamespaceId.slice(0, 10), { exact: false }).first(),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('Home counts the new namespace', async ({ page }) => {
    await openDashboard(page, '/admin-dashboard/dashboard');
    // The Namespaces stat card reads the same list, through the dashboard's own
    // namespaceApi rather than the raw fetch above.
    const card = page.locator('.dash-stat-card', { hasText: 'Namespaces' });
    await expect(card).toContainText(/[1-9]\d*/);
  });

  test('opens the namespace and shows its detail', async ({ page }) => {
    await openDashboard(page, '/admin-dashboard/namespaces');
    await page
      .getByText(createdNamespaceId.slice(0, 10), { exact: false })
      .first()
      .click();

    // Detail view: the namespace's own heading plus the sections the node feeds.
    await expect(
      page.getByRole('heading', { name: 'Application' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: /Groups/ })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Membership/ }),
    ).toBeVisible();
  });

  test('creates a group inside the namespace', async ({ page }) => {
    await openDashboard(page, '/admin-dashboard/namespaces');
    await page
      .getByText(createdNamespaceId.slice(0, 10), { exact: false })
      .first()
      .click();

    // The form is behind a toggle; without this the fields below do not exist.
    await page.getByRole('button', { name: 'New Group' }).click();

    const groupAlias = uniqueName('e2e-grp');
    await page.getByPlaceholder('Alias (optional)').first().fill(groupAlias);
    // Subgroups are restricted by default and 403 on join; `open` (lowercase) is
    // the value the node accepts, exposed in the UI as "Open (public)".
    await page
      .locator('select')
      .filter({ hasText: 'Open (public)' })
      .first()
      .selectOption('open');
    await page.getByRole('button', { name: 'Create Group' }).click();

    // Group aliases are dropped the same way namespace aliases are, so assert on
    // the node's subgroup count instead of looking for the name we typed.
    await expect
      .poll(
        async () => {
          const { body } = await adminApi<{
            data?: { namespaceId: string; subgroupCount?: number }[];
          }>('GET', '/namespaces');
          const rows = Array.isArray(body.data) ? body.data : [];
          return (
            rows.find((ns) => ns.namespaceId === createdNamespaceId)
              ?.subgroupCount ?? 0
          );
        },
        { timeout: 60_000, intervals: [1000, 2000, 5000] },
      )
      .toBeGreaterThan(0);
  });

  test('deletes a namespace from the list', async ({ page }) => {
    // Deliberately a FRESH namespace with no subgroups. The one built up above
    // now has a group in it, and deleting a namespace with subgroups is subject
    // to the node's cascade rules — worth its own test, but it would conflate
    // "does the UI delete work" with "does the node allow this delete".
    const { body: created } = await adminApi<{
      data?: { namespaceId?: string };
    }>('POST', '/namespaces', {
      applicationId: appId,
      upgradePolicy: 'Automatic',
    });
    const doomedId = created.data?.namespaceId;
    expect(doomedId, 'failed to arrange a namespace to delete').toBeTruthy();

    await openDashboard(page, '/admin-dashboard/namespaces');

    const row = page
      .locator('tr')
      .filter({ hasText: (doomedId as string).slice(0, 10) })
      .first();
    // Two steps, both inside the row: Delete swaps itself for Confirm/Cancel.
    await row.getByRole('button', { name: 'Delete' }).click();
    await row.getByRole('button', { name: 'Confirm' }).click();

    await expect
      .poll(
        async () => {
          const { body } = await adminApi<{
            data?: { namespaceId: string }[];
          }>('GET', '/namespaces');
          const rows = Array.isArray(body.data) ? body.data : [];
          return rows.some((ns) => ns.namespaceId === doomedId);
        },
        { timeout: 60_000, intervals: [1000, 2000, 5000] },
      )
      .toBe(false);
  });
});
