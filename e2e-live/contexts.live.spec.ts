import { test, expect } from '@playwright/test';
import {
  adminApi,
  clearNamespaces,
  openDashboard,
  uninstallAllApps,
} from './fixtures/live';

/**
 * Creating a context against a real node, with a real application.
 *
 * This exists because of a bug the mocked suite structurally cannot catch:
 * creating a context RUNS the app's `init` inside the WASM, and if the
 * initialization params do not match its signature the node answers a bare
 * `500 {"error":"Internal server error"}` — core does not echo untyped internal
 * errors, and in rc.20 the node-side log line came through empty too. So the
 * old form, which offered a free-text "params (JSON, optional)" box defaulting
 * to `{}`, produced an unexplainable 500 for every app whose `init` takes
 * arguments.
 *
 * mero-chat's `init` takes five, which is why it is the fixture here: the
 * probe app used by the other live specs is an 8-byte stub with no ABI and no
 * runnable `init`, so it can only ever prove the failure path.
 *
 * Serial: every test works off the one installed app and namespace.
 */
const PACKAGE = 'com.calimero.chat';
const VERSION = '2.0.0';
const ARTIFACT = `https://apps.calimero.network/artifacts/${PACKAGE}/${VERSION}/${PACKAGE}-${VERSION}.mpk`;

test.describe.serial('Live: create context', () => {
  let appId = '';
  let namespaceId = '';

  test.beforeAll(async () => {
    test.setTimeout(300_000);
    await uninstallAllApps();

    // Installed by URL, not through the Marketplace UI: this spec is about the
    // context form. The node must fetch it from apps.calimero.network — core
    // refuses loopback install URLs — so this is the second test in the suite
    // that needs egress.
    const install = await adminApi<{ data?: { applicationId?: string } }>(
      'POST',
      '/install-application',
      { url: ARTIFACT, metadata: [] },
    );
    expect(
      install.status,
      `install failed: ${JSON.stringify(install.body)}. The node downloads the ` +
        'bundle from apps.calimero.network; check egress and that the package ' +
        'is still published.',
    ).toBeLessThan(300);
    appId = install.body.data?.applicationId as string;
    expect(appId).toBeTruthy();

    const ns = await adminApi<{ data?: { namespaceId?: string } }>(
      'POST',
      '/namespaces',
      { applicationId: appId, upgradePolicy: 'Automatic', name: 'ctx-live' },
    );
    namespaceId = ns.body.data?.namespaceId as string;
    expect(namespaceId).toBeTruthy();
  });

  test.afterAll(async () => {
    // Everything, not just what this spec named: a namespace left behind is
    // invisible here but breaks the next spec, which starts from "no
    // namespaces".
    await clearNamespaces();
    await uninstallAllApps();
  });

  test('the node really does refuse `{}` with an opaque 500', async () => {
    // Pinning the behaviour the form exists to route around. If core ever
    // starts reporting the reason, this failing is good news — read the body
    // and simplify the form's error copy.
    const res = await adminApi<{ error?: string }>('POST', '/contexts', {
      applicationId: appId,
      groupId: namespaceId,
      initializationParams: Array.from(new TextEncoder().encode('{}')),
    });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Internal server error');
  });

  test('the form is generated from the application ABI', async ({ page }) => {
    await openDashboard(page, '/admin-dashboard/namespaces');
    await page.getByTestId('ns-card').first().click();
    await page.getByRole('button', { name: /Create Context/ }).click();

    const panel = page.getByTestId('ns-create-context-panel');
    await expect(panel).toBeVisible();

    // The signature is read off `GET /applications/:id/abi` — every parameter
    // gets its own control, so `{}` can no longer be submitted by accident.
    await expect(panel).toContainText('init(');
    for (const param of [
      'name',
      'context_type',
      'description',
      'created_at',
      'creator_username',
    ]) {
      await expect(page.getByTestId(`ns-init-field-${param}`)).toBeVisible();
    }
    // `ContextType` is a payload-free variant, so it becomes a select of its
    // cases rather than a free-text field.
    await expect(
      page.getByTestId('ns-init-field-context_type').locator('select'),
    ).toContainText('Channel');
  });

  test('a context is created with the ABI-derived params', async ({ page }) => {
    await openDashboard(page, '/admin-dashboard/namespaces');
    await page.getByTestId('ns-card').first().click();
    await page.getByRole('button', { name: /Create Context/ }).click();

    const panel = page.getByTestId('ns-create-context-panel');
    await panel.getByPlaceholder('e.g. general').fill('general');
    // Each init param has its own control, keyed by the param's ABI name.
    const initField = (param: string) =>
      page.getByTestId(`ns-init-field-${param}`).locator('input, textarea');
    await initField('name').fill('general');
    await initField('description').fill('live e2e');
    await initField('created_at').fill('0');
    await initField('creator_username').fill('e2e');

    await panel.getByRole('button', { name: 'Create Context' }).click();

    // The node is the source of truth: the context has to exist under the
    // namespace's group, which is also what makes it show in the tree.
    await expect
      .poll(
        async () => {
          const { body } = await adminApi<{ data?: { contextId: string }[] }>(
            'GET',
            `/groups/${namespaceId}/contexts`,
          );
          return (body.data ?? []).length;
        },
        { timeout: 60_000, intervals: [1000, 2000, 5000] },
      )
      .toBeGreaterThan(0);

    await expect(page.getByTestId('ns-tree-context')).toContainText('general', {
      timeout: 30_000,
    });
  });

  test('a bad value is reported by the form, not as a 500', async ({
    page,
  }) => {
    await openDashboard(page, '/admin-dashboard/namespaces');
    await page.getByTestId('ns-card').first().click();
    await page.getByRole('button', { name: /Create Context/ }).click();

    const panel = page.getByTestId('ns-create-context-panel');
    // `created_at` is a u64; blanking it must be caught here, with the field
    // named, rather than travelling to the node to come back as "500".
    await page
      .getByTestId('ns-init-field-created_at')
      .locator('input')
      .fill('');
    await panel.getByRole('button', { name: 'Create Context' }).click();

    await expect(page.locator('.ns-toast')).toContainText('created_at');
    await expect(page.locator('.ns-toast')).not.toContainText('500');
  });
});
