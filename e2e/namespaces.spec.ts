import { expect, test } from '@playwright/test';
import {
  ABI_WITH_INIT,
  APP_WITH_FRONTEND,
  NODE_IDENTITY,
  mockNode,
} from './fixtures/node';

/**
 * Namespaces is now the only place the group hierarchy is managed — the
 * separate Contexts tab is gone, because a context belongs to exactly one
 * group and a node-global list of them mapped onto nothing.
 *
 * These run against the mocked node, so they also pin the WIRE SHAPES the page
 * depends on: `name` (not `alias`) for every display name, `{ members }` for the
 * member list and `{ subgroups }` for subgroups — all three of which were being
 * unwrapped wrongly and silently rendered as empty.
 *
 * The member list is `{ members }` and nothing else as of core 0.11.0-rc.23:
 * `selfIdentity` was removed, and "you" is now decided by comparing each row's
 * ACCOUNT against `GET /admin-api/identity`. The fixture must not keep serving
 * the old field, or the suite stays green against a shape the node no longer
 * sends — which is exactly how 1.13.0 shipped broken.
 */

const NS_ID = 'ns1111111111111111111111111111111111111111111111';
const SUB_ID = 'sub22222222222222222222222222222222222222222222';
const CTX_ID = 'ctx33333333333333333333333333333333333333333333';
// A member id is an ACCOUNT now — 64 hex characters, not the base58 a key
// renders as — and ours has to equal what `/admin-api/identity` reports or no
// row is "you".
const ME = NODE_IDENTITY.accountId;
const OTHER = 'ff'.repeat(32);

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
        { identity: OTHER, role: 'Member', name: 'other' },
      ],
      contexts: [{ contextId: CTX_ID, name: 'general' }],
      subgroups: [{ groupId: SUB_ID, name: 'engineering' }],
    },
    [SUB_ID]: {
      name: 'engineering',
      subgroupVisibility: 'restricted',
      members: [{ identity: ME, role: 'Member' }],
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
    // "you" is the row whose ACCOUNT matches `GET /admin-api/identity`. The
    // member list no longer says which one that is.
    await expect(members.getByText('you')).toBeVisible();
  });

  test('a node with no identity yet still renders the members table', async ({
    page,
  }) => {
    // `/admin-api/identity` 404s on a node that holds neither a device nor an
    // account root — it has taken part in nothing. That is a normal state, so
    // the page must render, just with nobody marked "you" and no error.
    await mockNode(page, { ...FIXTURE, nodeIdentity: null });
    await page.goto('/admin-dashboard/namespaces');
    await page.getByTestId('ns-card').click();

    const members = page.getByTestId('ns-members-section');
    await expect(members).toContainText('Members (2)');
    await expect(members.getByText('you')).toHaveCount(0);
    await expect(page.getByTestId('ns-identity-section')).toHaveCount(0);
  });

  test('the identity panel names the node, not the namespace', async ({
    page,
  }) => {
    // rc.23 deleted `GET /namespaces/:id/identity` (#3522), so there is no
    // "your namespace identity" left to show. Asking a namespace who you are
    // always answered with the node's account.
    await mockNode(page, FIXTURE);
    let namespacedIdentityCalls = 0;
    await page.route('**/admin-api/namespaces/*/identity', (route) => {
      namespacedIdentityCalls += 1;
      return route.fulfill({ status: 404, body: '{}' });
    });

    await page.goto('/admin-dashboard/namespaces');
    await page.getByTestId('ns-card').click();

    const panel = page.getByTestId('ns-identity-section');
    await expect(panel).toContainText('Your account');
    // Both encodings on screen, each labelled: the account is what the members
    // table is keyed by, the signing key is what an add-member call takes.
    await expect(panel).toContainText(NODE_IDENTITY.accountId.slice(0, 10));
    await expect(panel).toContainText(NODE_IDENTITY.publicKey.slice(0, 10));
    expect(namespacedIdentityCalls).toBe(0);
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

    const putPaths: string[] = [];
    await page.route('**/admin-api/groups/*/members/*/role', async (route) => {
      putPaths.push(new URL(route.request().url()).pathname);
      expect(route.request().method()).toBe('PUT');
      // `requester` was dropped from every admin request body in rc.23
      // (core #3492), so the body carries the role and nothing else.
      expect(route.request().postDataJSON()).toEqual({ role: 'Admin' });
      await route.fulfill({ status: 200, body: '{}' });
    });
    await memberRow.getByRole('button', { name: 'Promote' }).click();
    // The toast is page-level, not inside the section.
    await expect(page.getByText('Role set to Admin')).toBeVisible();
    // core's path segment is `:account`, so the member is addressed by the
    // 64-hex account the listing returned — not by any key.
    expect(putPaths).toEqual([
      `/admin-api/groups/${NS_ID}/members/${OTHER}/role`,
    ]);
  });

  test('add-member refuses an account, because that endpoint takes a key', async ({
    page,
  }) => {
    // The one asymmetry left on this resource: add names a base58 PublicKey,
    // every other verb names a 64-hex AccountId. Copying an id out of the table
    // into this box addresses nobody, so say so instead of letting the node
    // answer with a bare error.
    await mockNode(page, FIXTURE);
    await page.goto('/admin-dashboard/namespaces');
    await page.getByTestId('ns-card').click();

    const members = page.getByTestId('ns-members-section');
    await members.getByRole('button', { name: 'Add Member' }).click();
    const field = members.getByPlaceholder('Public key (base58)');

    await field.fill(OTHER);
    await expect(page.getByTestId('ns-add-member-hint')).toBeVisible();
    // `exact` matters: "Add Member" also matches a loose name.
    const submit = members.getByRole('button', { name: 'Add', exact: true });
    await expect(submit).toBeDisabled();

    await field.fill(NODE_IDENTITY.publicKey);
    await expect(page.getByTestId('ns-add-member-hint')).toHaveCount(0);
    await expect(submit).toBeEnabled();
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

  test('the create-context form is generated from the application ABI', async ({
    page,
  }) => {
    // Creating a context runs the app's `init`. Get its params wrong and the
    // node answers a bare 500 with no reason, so the form is built from the
    // ABI rather than from a free-text JSON box the user has to guess at.
    await mockNode(page, {
      ...FIXTURE,
      abis: { [APP_WITH_FRONTEND.id]: ABI_WITH_INIT },
    });
    await page.goto('/admin-dashboard/namespaces');
    await page.getByTestId('ns-card').click();
    await page.getByRole('button', { name: /Create Context/ }).click();

    const panel = page.getByTestId('ns-create-context-panel');
    await expect(panel).toContainText(
      'init(name: string, context_type: Channel | Dm, created_at: u64)',
    );
    await expect(page.getByTestId('ns-init-field-name')).toBeVisible();
    // A payload-free variant becomes a select of its cases.
    await expect(
      page.getByTestId('ns-init-field-context_type').locator('select'),
    ).toContainText('Channel');

    // Every param is sent, so `{}` can no longer reach the node by accident.
    let body: Record<string, unknown> | null = null;
    await page.route('**/admin-api/contexts', async (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      body = route.request().postDataJSON();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { contextId: 'ctxNew', memberPublicKey: 'pk' },
        }),
      });
    });

    await page
      .getByTestId('ns-init-field-name')
      .locator('input')
      .fill('general');
    await page
      .getByTestId('ns-init-field-created_at')
      .locator('input')
      .fill('7');
    await panel.getByRole('button', { name: 'Create Context' }).click();

    await expect(page.getByText(/Context created/)).toBeVisible();
    const sent = JSON.parse(
      new TextDecoder().decode(
        new Uint8Array((body as any).initializationParams),
      ),
    );
    expect(sent).toEqual({
      name: 'general',
      context_type: 'Channel',
      created_at: 7,
    });
  });

  test('an app with no ABI falls back to a raw JSON editor', async ({
    page,
  }) => {
    // A raw-wasm app publishes no ABI; the node answers 404 and the form has
    // nothing to generate from, so it must not pretend otherwise.
    await mockNode(page, FIXTURE);
    await page.goto('/admin-dashboard/namespaces');
    await page.getByTestId('ns-card').click();
    await page.getByRole('button', { name: /Create Context/ }).click();

    const panel = page.getByTestId('ns-create-context-panel');
    await expect(panel).toContainText('publishes no ABI');
    await expect(panel.getByLabel('Initialization params JSON')).toBeVisible();
  });

  test('a namespace with no name of its own is labelled by its application', async ({
    page,
  }) => {
    await mockNode(page, {
      ...FIXTURE,
      namespaces: [
        {
          namespaceId: NS_ID,
          targetApplicationId: APP_WITH_FRONTEND.id,
          memberCount: 0,
          contextCount: 0,
          subgroupCount: 0,
        },
      ],
    });
    await page.goto('/admin-dashboard/namespaces');

    // A namespace exists to run one application, so its name is a true and
    // useful label — far better than the raw id the title used to show. The id
    // is still on the card, just no longer standing in for a name.
    await expect(page.getByTestId('ns-card').getByRole('heading')).toHaveText(
      'Mero Blocks',
    );
  });

  test('empty state explains what a namespace is for', async ({ page }) => {
    await mockNode(page, { namespaces: [] });
    await page.goto('/admin-dashboard/namespaces');

    await expect(page.getByText('No namespaces found')).toBeVisible();
  });
});
