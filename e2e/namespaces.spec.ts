import { expect, test } from '@playwright/test';
import { APP_WITH_FRONTEND, mockNode } from './fixtures/node';

/**
 * Namespaces is now the only place the group hierarchy is managed — the
 * separate Contexts tab is gone, because a context belongs to exactly one
 * group and a node-global list of them mapped onto nothing.
 *
 * These run against the mocked node, so they also pin the WIRE SHAPES the page
 * depends on: `name` (not `alias`) for every display name, `{ members,
 * selfIdentity }` for the member list and `{ subgroups }` for subgroups — all
 * three of which were being unwrapped wrongly and silently rendered as empty.
 */

const NS_ID = 'ns1111111111111111111111111111111111111111111111';
const SUB_ID = 'sub22222222222222222222222222222222222222222222';
const CTX_ID = 'ctx33333333333333333333333333333333333333333333';
const ME = 'meidentity4444444444444444444444444444444444444';

const FIXTURE = {
  namespaces: [
    {
      namespaceId: NS_ID,
      targetApplicationId: APP_WITH_FRONTEND.id,
      name: 'Team workspace',
      appVersion: '0.1.1',
      memberCount: 2,
      contextCount: 1,
      subgroupCount: 1,
    },
  ],
  groups: {
    [NS_ID]: {
      members: [
        { identity: ME, role: 'Admin', name: 'Fran' },
        { identity: 'other5555555555555555555555555555555', role: 'Member' },
      ],
      selfIdentity: ME,
      contexts: [{ contextId: CTX_ID, name: 'general' }],
      subgroups: [{ groupId: SUB_ID, name: 'engineering' }],
    },
    [SUB_ID]: {
      name: 'engineering',
      subgroupVisibility: 'restricted',
      members: [{ identity: ME, role: 'Member' }],
      selfIdentity: ME,
      contexts: [],
      subgroups: [],
    },
  },
};

test.describe('Namespaces', () => {
  test('there is no Contexts tab, and its old URL lands on Namespaces', async ({
    page,
  }) => {
    await mockNode(page, FIXTURE);
    await page.goto('/admin-dashboard/contexts');

    await expect(page.getByTestId('shell-page-title')).toHaveText('Namespaces');
    await expect(
      page.getByRole('link', { name: 'Contexts', exact: true }),
    ).toHaveCount(0);
  });

  test('lists namespaces with their name and meta', async ({ page }) => {
    await mockNode(page, FIXTURE);
    await page.goto('/admin-dashboard/namespaces');

    const card = page.getByTestId('ns-card');
    await expect(card).toHaveCount(1);
    // The name comes from `name` on the wire; reading `alias` rendered nothing.
    await expect(card).toContainText('Team workspace');
    await expect(card).toContainText('Mero Blocks');
    await expect(card).toContainText('v0.1.1');
    await expect(card).toContainText('Automatic');
  });

  test('both entry points — Join and Create — are on the list', async ({
    page,
  }) => {
    await mockNode(page, FIXTURE);
    await page.goto('/admin-dashboard/namespaces');

    await page.getByRole('button', { name: /Join Namespace/i }).click();
    await expect(page.getByTestId('ns-join-panel')).toBeVisible();

    await page.getByRole('button', { name: /Create Namespace/i }).click();
    await expect(
      page.getByRole('heading', { name: 'Create namespace' }),
    ).toBeVisible();
  });

  test('a namespace shows its members, contexts and subgroups', async ({
    page,
  }) => {
    await mockNode(page, FIXTURE);
    await page.goto('/admin-dashboard/namespaces');
    await page.getByTestId('ns-card').click();

    // Counts span the whole tree, not just the root level.
    await expect(page.getByText('Team workspace').first()).toBeVisible();
    await expect(page.getByTestId('ns-tree-context')).toContainText('general');
    await expect(page.getByTestId('ns-tree-subgroup')).toContainText(
      'engineering',
    );

    const members = page.getByTestId('ns-members-section');
    await expect(members).toContainText('Members (2)');
    await expect(members).toContainText('Fran');
    // `selfIdentity` from the member-list response identifies the caller.
    await expect(members.getByText('you')).toBeVisible();
  });

  test('members can be promoted and demoted', async ({ page }) => {
    await mockNode(page, FIXTURE);
    await page.goto('/admin-dashboard/namespaces');
    await page.getByTestId('ns-card').click();

    const members = page.getByTestId('ns-members-section');
    const memberRow = members.locator('tr', {
      has: page.getByRole('combobox', { name: /Role of other/ }),
    });
    // Member sits mid-ladder, so both directions are offered.
    await expect(
      memberRow.getByRole('button', { name: 'Promote' }),
    ).toBeVisible();
    await expect(
      memberRow.getByRole('button', { name: 'Demote' }),
    ).toBeVisible();

    const putRoles: string[] = [];
    await page.route('**/admin-api/groups/*/members/*/role', async (route) => {
      putRoles.push(route.request().method());
      await route.fulfill({ status: 200, body: '{}' });
    });
    await memberRow.getByRole('button', { name: 'Promote' }).click();
    // The toast is page-level, not inside the section.
    await expect(page.getByText('Role set to Admin')).toBeVisible();
    expect(putRoles).toEqual(['PUT']);
  });

  test('opening a subgroup shows its own members and visibility', async ({
    page,
  }) => {
    await mockNode(page, FIXTURE);
    await page.goto('/admin-dashboard/namespaces');
    await page.getByTestId('ns-card').click();
    await page.getByTestId('ns-tree-subgroup').getByText('engineering').click();

    await expect(
      page.getByRole('heading', { level: 1, name: /engineering/ }),
    ).toBeVisible();
    await expect(page.getByText('restricted')).toBeVisible();
    await expect(page.getByTestId('ns-members-section')).toContainText(
      'Members (1)',
    );
  });

  test('subgroups can be created from a namespace', async ({ page }) => {
    await mockNode(page, FIXTURE);
    await page.goto('/admin-dashboard/namespaces');
    await page.getByTestId('ns-card').click();

    let body: Record<string, unknown> | null = null;
    await page.route(
      `**/admin-api/namespaces/${NS_ID}/groups`,
      async (route) => {
        if (route.request().method() !== 'POST') return route.fallback();
        body = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: { groupId: 'newgroup' } }),
        });
      },
    );

    await page.getByRole('button', { name: /New Subgroup/i }).click();
    await page.getByPlaceholder('e.g. engineering').fill('design');
    await page.getByRole('button', { name: 'Create Subgroup' }).click();

    await expect(page.getByText(/Subgroup created/)).toBeVisible();
    // The name key core reads is `groupName`; sending only `name` (what the JS
    // SDK does) is silently dropped and the subgroup comes back unnamed.
    expect(body).toMatchObject({ groupName: 'design', visibility: 'open' });
  });

  test('empty state explains what a namespace is for', async ({ page }) => {
    await mockNode(page, { namespaces: [] });
    await page.goto('/admin-dashboard/namespaces');

    await expect(page.getByText('No namespaces found')).toBeVisible();
  });
});
