import { test, expect } from '@playwright/test';
import {
  adminApi,
  clearNamespaces,
  installByCoords,
  openNamespacesForApp,
  REAL_PACKAGE,
  REAL_VERSION,
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
 * kv-store fixture the namespaces spec installs has a parameterless `init`,
 * so it cannot exercise the generated form.
 *
 * Serial: every test works off the one installed app and namespace.
 */
test.describe.serial('Live: create context', () => {
  let appId = '';
  let namespaceId = '';

  test.beforeAll(async () => {
    test.setTimeout(300_000);
    await uninstallAllApps();

    // By coordinates, not through the Marketplace UI: this spec is about the
    // context form. The node fetches the pinned bundle from the local stub.
    appId = await installByCoords(REAL_PACKAGE, REAL_VERSION);

    const ns = await adminApi<{ data?: { namespaceId?: string } }>(
      'POST',
      '/namespaces',
      { applicationId: appId, name: 'ctx-live' },
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

  test('the node refuses `{}` as a client error, not an opaque 500', async () => {
    // ⚠️ THIS USED TO ASSERT 500 / "Internal server error", and the note here
    // said that if core ever started reporting the reason, the failure would be
    // GOOD NEWS. That happened: somewhere in rc.24-rc.28 a malformed init
    // payload became a 400 instead of a 500, so the node is now telling the
    // caller it is their input at fault.
    //
    // Still asserted against the node rather than deleted: the generated form
    // exists to keep users out of this path at all, and a regression back to an
    // opaque 500 would change what its error copy has to say.
    const res = await adminApi<{ error?: string }>('POST', '/contexts', {
      applicationId: appId,
      groupId: namespaceId,
      initializationParams: Array.from(new TextEncoder().encode('{}')),
    });
    expect(res.status).toBe(400);
    expect(res.status).toBeLessThan(500);
  });

  test('the form is generated from the application ABI', async ({ page }) => {
    await openNamespacesForApp(page, appId);
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
    await openNamespacesForApp(page, appId);
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
    await openNamespacesForApp(page, appId);
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
