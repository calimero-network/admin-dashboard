import { test, expect } from '@playwright/test';
import {
  apiFor,
  discoverNodes,
  openDashboardOn,
  type MeroboxNode,
  type NodeApi,
} from './fixtures/merobox';

/**
 * Membership across two real nodes.
 *
 * This is the claim the invite/join UI rests on and that no single-node test
 * can check: **the invitation code the dashboard renders can be redeemed by
 * somebody else's node**, and what follows — the joiner sees the namespace,
 * the inviter sees the new member, a role change reaches them, and leaving
 * removes them — actually happens between two parties.
 *
 * It is also the test that would have caught the encoding change: the codes
 * are base64 so they interchange with the desktop app, and a client that
 * encodes one way and decodes another passes every single-node test.
 *
 * Cross-node effects travel by gossip, so every assertion about the OTHER node
 * polls. A failure here is either the dashboard or the mesh — check the node
 * logs (`merobox logs <name>`) before assuming the former.
 */
const PACKAGE = 'com.calimero.chat';
const VERSION = '2.0.0';
const ARTIFACT = `https://apps.calimero.network/artifacts/${PACKAGE}/${VERSION}/${PACKAGE}-${VERSION}.mpk`;

/** Long enough for gossip to settle on a co-located pair, short enough to fail. */
const PROPAGATION = { timeout: 120_000, intervals: [1000, 2000, 5000] };

interface NamespaceRow {
  namespaceId: string;
  name?: string;
  memberCount?: number;
}

test.describe.serial('Merobox: membership between two nodes', () => {
  let alice: MeroboxNode;
  let bob: MeroboxNode;
  let aliceApi: NodeApi;
  let bobApi: NodeApi;
  let appId = '';
  let namespaceId = '';
  let invitation = '';

  test.beforeAll(async () => {
    const nodes = await discoverNodes();
    expect(
      nodes.length,
      'the merobox cluster is not running — global-setup should have started it',
    ).toBeGreaterThanOrEqual(2);
    [alice, bob] = nodes as [MeroboxNode, MeroboxNode];
    aliceApi = await apiFor(alice);
    bobApi = await apiFor(bob);

    // Only the inviter needs the application installed: a namespace is bound
    // to one, and the joiner resolves it over P2P when it joins.
    const install = await aliceApi.post<{ data?: { applicationId?: string } }>(
      '/install-application',
      { url: ARTIFACT, metadata: [] },
    );
    expect(
      install.status,
      `install failed on ${alice.name}: ${JSON.stringify(install.body)}. ` +
        'The container downloads the bundle from apps.calimero.network — check ' +
        'egress from Docker.',
    ).toBeLessThan(300);
    appId = install.body.data?.applicationId as string;
    expect(appId).toBeTruthy();
  });

  test.afterAll(async () => {
    if (namespaceId) {
      await aliceApi?.del(`/namespaces/${namespaceId}`).catch(() => undefined);
    }
    await aliceApi?.dispose();
    await bobApi?.dispose();
  });

  test('alice creates a namespace in the dashboard', async ({ page }) => {
    await openDashboardOn(page, alice, '/admin-dashboard/namespaces');

    await page.getByRole('button', { name: /Create Namespace/ }).click();
    await page.locator('select').first().selectOption(appId);
    await page.getByPlaceholder('e.g. Team workspace').fill('shared');
    await page.getByRole('button', { name: 'Create', exact: true }).click();

    await expect
      .poll(async () => {
        const { body } = await aliceApi.get<{ data?: NamespaceRow[] }>(
          '/namespaces',
        );
        const match = (body.data ?? []).find((n) => n.name === 'shared');
        if (match) namespaceId = match.namespaceId;
        return match?.name ?? null;
      }, PROPAGATION)
      .toBe('shared');

    await expect(
      page.getByTestId('ns-card').filter({ hasText: 'shared' }),
    ).toBeVisible();
  });

  test('alice generates an invitation code', async ({ page }) => {
    await openDashboardOn(page, alice, '/admin-dashboard/namespaces');
    await page.getByTestId('ns-card').filter({ hasText: 'shared' }).click();

    await page.getByRole('button', { name: 'Invite' }).click();
    const panel = page.getByTestId('ns-invite-panel');
    await panel.getByRole('button', { name: /Generate invitation/ }).click();

    const code = await panel.locator('textarea').inputValue();
    expect(code.length, 'no invitation code was rendered').toBeGreaterThan(32);
    invitation = code;

    // Base64 of the join request body — the same encoding the desktop app
    // reads, which is the whole point of the format.
    const decoded = JSON.parse(atob(code));
    expect(
      decoded.invitation,
      'the code is not a join request body',
    ).toBeTruthy();
  });

  test('bob redeems it from his own dashboard', async ({ page }) => {
    expect(invitation, 'no invitation from the previous test').toBeTruthy();

    await openDashboardOn(page, bob, '/admin-dashboard/namespaces');
    await page.getByRole('button', { name: /Join Namespace/ }).click();

    const panel = page.getByTestId('ns-join-panel');
    await panel.getByLabel('Invitation code').fill(invitation);
    await panel.getByRole('button', { name: 'Join' }).click();

    // Bob's own node is the proof, not Alice's UI: the namespace has to exist
    // on the node that redeemed the code.
    await expect
      .poll(async () => {
        const { body } = await bobApi.get<{ data?: NamespaceRow[] }>(
          '/namespaces',
        );
        return (body.data ?? []).some((n) => n.namespaceId === namespaceId);
      }, PROPAGATION)
      .toBe(true);

    await expect(page.getByTestId('ns-card')).toContainText(/shared|Mero Chat/);
  });

  test('alice sees bob in the member list', async ({ page }) => {
    await expect
      .poll(async () => {
        const { body } = await aliceApi.get<{
          members?: { identity: string }[];
        }>(`/groups/${namespaceId}/members`);
        return (body.members ?? []).length;
      }, PROPAGATION)
      .toBeGreaterThan(1);

    await openDashboardOn(page, alice, '/admin-dashboard/namespaces');
    await page.getByTestId('ns-card').filter({ hasText: 'shared' }).click();

    const members = page.getByTestId('ns-members-section');
    await expect(members).toContainText('Members (2)');
    // Exactly one row is the local node — `selfIdentity` off the member-list
    // response, not a guess from the JWT.
    await expect(members.getByText('you')).toHaveCount(1);
  });

  test('promoting bob reaches bob', async ({ page }) => {
    const { body: before } = await aliceApi.get<{
      members?: { identity: string; role: string }[];
      selfIdentity?: string;
    }>(`/groups/${namespaceId}/members`);
    const bobIdentity = (before.members ?? []).find(
      (m) => m.identity !== before.selfIdentity,
    )?.identity;
    expect(bobIdentity, 'could not tell the two members apart').toBeTruthy();

    await openDashboardOn(page, alice, '/admin-dashboard/namespaces');
    await page.getByTestId('ns-card').filter({ hasText: 'shared' }).click();

    const row = page
      .getByTestId('ns-members-section')
      .locator('tr')
      .filter({ hasText: bobIdentity!.slice(0, 10) });
    await row.getByRole('button', { name: 'Promote' }).click();
    await expect(page.getByText('Role set to Admin')).toBeVisible();

    // The role is governance state, so it has to converge on bob's node too.
    await expect
      .poll(async () => {
        const { body } = await bobApi.get<{
          members?: { identity: string; role: string }[];
        }>(`/groups/${namespaceId}/members`);
        return (body.members ?? []).find((m) => m.identity === bobIdentity)
          ?.role;
      }, PROPAGATION)
      .toBe('Admin');
  });

  test('bob leaves, and alice stops seeing him', async ({ page }) => {
    await openDashboardOn(page, bob, '/admin-dashboard/namespaces');
    await page.getByTestId('ns-card').first().click();

    // Bob is an Admin after the previous test, so the header offers Delete.
    // Leaving is the member-side exit; take whichever the UI presents, since
    // both are legitimate ways for bob to drop the namespace.
    const leave = page.getByRole('button', { name: 'Leave' });
    if (await leave.count()) {
      await leave.click();
      await page.getByRole('button', { name: 'Confirm leave' }).click();
    } else {
      await bobApi.post(`/namespaces/${namespaceId}/leave`);
    }

    await expect
      .poll(async () => {
        const { body } = await aliceApi.get<{
          members?: { identity: string }[];
        }>(`/groups/${namespaceId}/members`);
        return (body.members ?? []).length;
      }, PROPAGATION)
      .toBe(1);
  });
});
