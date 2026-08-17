import { test, expect } from '@playwright/test';
import {
  openDashboard,
  adminApi,
  installProbeApp,
  uninstallAllApps,
  uniqueName,
} from './fixtures/live';

/**
 * Namespaces against a real node.
 *
 * This is the deepest live path in the suite, and the one a mock cannot stand
 * in for: the REQUEST AND RESPONSE SHAPES are the thing under test. Three of
 * them were wrong for a long time and each failed silently rather than loudly —
 * an empty list or a missing name, never an error:
 *
 *   • display names are `name` on the wire, not `alias`;
 *   • the subgroup-creation endpoint reads `groupName`, so a request carrying
 *     only `name` is accepted and the name is dropped;
 *   • `GET /groups/:id/members` answers `{ members, selfIdentity }` and
 *     `GET /groups/:id/subgroups` answers `{ subgroups }` — neither is the
 *     `{ data }` envelope the rest of the API uses.
 *
 * So these tests assert on names, not just ids: a name that survives the round
 * trip is the proof.
 *
 * Serial: later steps operate on the namespace the first one made.
 */
test.describe.serial('Live: namespaces', () => {
  const nsName = uniqueName('e2e-ns');
  const groupName = uniqueName('e2e-grp');
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
    // Best-effort teardown so a rerun starts clean even if a step failed. The
    // node is exclusive to this run, so deleting everything is safe.
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

  test('there is no separate Contexts page', async ({ page }) => {
    // Contexts live inside their group; the old route redirects.
    await openDashboard(page, '/admin-dashboard/contexts');
    await expect(page.getByTestId('shell-page-title')).toHaveText('Namespaces');
  });

  test('creates a namespace, and its name survives the round trip', async ({
    page,
  }) => {
    await openDashboard(page, '/admin-dashboard/namespaces');

    await page.getByRole('button', { name: /Create Namespace/ }).click();
    await expect(
      page.getByRole('heading', { name: 'Create namespace' }),
    ).toBeVisible();

    // The app select is populated from the node's installed applications, so
    // choosing by value proves that list loaded.
    await page.locator('select').first().selectOption(appId);
    await page.getByPlaceholder('e.g. Team workspace').fill(nsName);
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    // The node is the source of truth, and creating a namespace writes
    // governance state — poll it rather than racing the list refresh.
    await expect
      .poll(
        async () => {
          const { body } = await adminApi<{
            data?: {
              namespaceId: string;
              targetApplicationId?: string;
              name?: string;
            }[];
          }>('GET', '/namespaces');
          const rows = Array.isArray(body.data) ? body.data : [];
          const match = rows.find((ns) => ns.targetApplicationId === appId);
          if (match) createdNamespaceId = match.namespaceId;
          return match?.name ?? null;
        },
        { timeout: 60_000, intervals: [1000, 2000, 5000] },
      )
      .toBe(nsName);

    expect(createdNamespaceId).toBeTruthy();

    // Then the UI must show it. Refresh explicitly: the list is fetched on
    // mount, so this asserts the read path, not the create path's re-render.
    await page.getByRole('button', { name: 'Refresh' }).first().click();
    await expect(
      page.getByTestId('ns-card').filter({ hasText: nsName }),
    ).toBeVisible({
      timeout: 30_000,
    });
  });

  test('Home counts the new namespace', async ({ page }) => {
    await openDashboard(page, '/admin-dashboard/dashboard');
    // The Namespaces stat card reads the same list, through the dashboard's own
    // namespaceApi rather than the raw fetch above.
    const card = page.locator('.dash-stat-card', { hasText: 'Namespaces' });
    await expect(card).toContainText(/[1-9]\d*/);
  });

  test('the detail view shows the application, structure and members', async ({
    page,
  }) => {
    await openDashboard(page, '/admin-dashboard/namespaces');
    await page.getByTestId('ns-card').filter({ hasText: nsName }).click();

    await expect(
      page.getByRole('heading', { name: 'Application' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Structure' }),
    ).toBeVisible();

    // The creator is a member of their own namespace, so an empty list here
    // means the `{ members, selfIdentity }` envelope was misread.
    const members = page.getByTestId('ns-members-section');
    await expect(members).not.toContainText('Members (0)');
    await expect(members.getByText('you')).toBeVisible();
  });

  test('creates a named subgroup, and the name persists', async ({ page }) => {
    await openDashboard(page, '/admin-dashboard/namespaces');
    await page.getByTestId('ns-card').filter({ hasText: nsName }).click();

    await page.getByRole('button', { name: /New Subgroup/ }).click();
    await page.getByPlaceholder('e.g. engineering').fill(groupName);
    await page.getByRole('button', { name: 'Create Subgroup' }).click();

    // `groupName` is the key the node reads. Sending only `name` (what the JS
    // SDK does) returns 200 and drops it, so asserting the name — not just the
    // count — is what makes this test worth having.
    await expect
      .poll(
        async () => {
          const { body } = await adminApi<{
            data?: { groupId: string; name?: string }[];
          }>('GET', `/namespaces/${createdNamespaceId}/groups`);
          const rows = Array.isArray(body.data) ? body.data : [];
          return rows.map((g) => g.name ?? null);
        },
        { timeout: 60_000, intervals: [1000, 2000, 5000] },
      )
      .toContain(groupName);

    // And it must reach the structure tree, which walks the group hierarchy
    // one level at a time.
    await page.getByRole('button', { name: 'Refresh' }).last().click();
    await expect(page.getByTestId('ns-tree-subgroup')).toContainText(
      groupName,
      { timeout: 30_000 },
    );
  });

  test('opens the subgroup and lists its own members', async ({ page }) => {
    await openDashboard(page, '/admin-dashboard/namespaces');
    await page.getByTestId('ns-card').filter({ hasText: nsName }).click();
    await page.getByTestId('ns-tree-subgroup').getByText(groupName).click();

    await expect(
      page.getByRole('heading', { level: 1, name: new RegExp(groupName) }),
    ).toBeVisible();
    await expect(page.getByTestId('ns-members-section')).toBeVisible();
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
      name: 'doomed',
    });
    const doomedId = created.data?.namespaceId;
    expect(doomedId, 'failed to arrange a namespace to delete').toBeTruthy();

    await openDashboard(page, '/admin-dashboard/namespaces');

    const card = page.getByTestId('ns-card').filter({ hasText: 'doomed' });
    // Two steps, both inside the card: Delete swaps itself for Confirm/Cancel.
    await card.getByRole('button', { name: 'Delete' }).click();
    await card.getByRole('button', { name: 'Confirm' }).click();

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
