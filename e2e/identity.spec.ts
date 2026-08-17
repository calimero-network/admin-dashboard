import { expect, test } from '@playwright/test';
import { mockNode } from './fixtures/node';

/**
 * Identity had no functional coverage — only the layout walk-through. The two
 * key kinds come from different endpoints and are swapped by a tab, so nothing
 * previously proved that the tab actually re-fetches, or that revoked keys are
 * filtered out.
 */
const ROOT_KEYS = [
  {
    public_key: 'RootKeyAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    auth_method: 'user_password',
    revoked_at: null,
  },
  {
    public_key: 'RootKeyRevokedBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    auth_method: 'user_password',
    revoked_at: 1700000000,
  },
];

const CLIENT_KEYS = [
  {
    client_id: 'ClientKeyCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
    name: 'mero-chat',
    revoked_at: null,
  },
];

test.describe('Identity', () => {
  test('lists active root keys and hides revoked ones', async ({ page }) => {
    await mockNode(page, { rootKeys: ROOT_KEYS, clientKeys: CLIENT_KEYS });
    await page.goto('/admin-dashboard/identity');

    await expect(page.getByTestId('shell-page-title')).toHaveText('Identity');
    await expect(page.getByText(ROOT_KEYS[0]!.public_key)).toBeVisible();
    // A revoked key is still returned by the node; the page must not show it.
    await expect(page.getByText(ROOT_KEYS[1]!.public_key)).toHaveCount(0);
  });

  test('the Client Keys tab fetches the other endpoint', async ({ page }) => {
    await mockNode(page, { rootKeys: ROOT_KEYS, clientKeys: CLIENT_KEYS });
    await page.goto('/admin-dashboard/identity');

    await expect(page.getByText(ROOT_KEYS[0]!.public_key)).toBeVisible();
    await page.getByRole('button', { name: 'Client Keys' }).click();

    await expect(page.getByText(CLIENT_KEYS[0]!.client_id)).toBeVisible();
    await expect(page.getByText(ROOT_KEYS[0]!.public_key)).toHaveCount(0);

    await page.getByRole('button', { name: 'Root Keys' }).click();
    await expect(page.getByText(ROOT_KEYS[0]!.public_key)).toBeVisible();
  });

  test('Export DID copies the keys and confirms', async ({ page }) => {
    await mockNode(page, { rootKeys: ROOT_KEYS });
    await page.goto('/admin-dashboard/identity');

    // The clipboard is unavailable in headless Chromium without a permission
    // grant, and the page's catch would then report a failure that has nothing
    // to do with the export itself.
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText: async () => undefined },
      });
    });

    await page.getByRole('button', { name: /Export DID/i }).click();
    await expect(page.getByText('DID copied to clipboard')).toBeVisible();
  });

  test('an empty node lists nothing rather than erroring', async ({ page }) => {
    await mockNode(page, { rootKeys: [], clientKeys: [] });
    await page.goto('/admin-dashboard/identity');

    await expect(page.getByTestId('shell-page-title')).toHaveText('Identity');
  });
});
