import { expect, test } from '@playwright/test';
import { mockNode } from './fixtures/node';

/**
 * Blobs had no functional coverage — only the layout walk-through. The page
 * also has its own fetch layer (it does not go through the SDK's apiClient), so
 * a regression in `getAppEndpointKey()` or the auth header would have shown up
 * nowhere else.
 */
const BLOBS = [
  { blob_id: 'BlobAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', size: 1024 },
  {
    blob_id: 'BlobBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
    size: 5 * 1024 * 1024,
  },
];

test.describe('Blobs', () => {
  test('lists the blobs the node stores, with totals', async ({ page }) => {
    await mockNode(page, { blobs: BLOBS });
    await page.goto('/admin-dashboard/blobs');

    await expect(page.getByTestId('shell-page-title')).toHaveText('Blobs');
    // Rendered through truncateMiddle(id, 16, 10), so match the head.
    for (const blob of BLOBS) {
      await expect(
        page.getByText(blob.blob_id.slice(0, 16), { exact: false }),
      ).toBeVisible();
    }
    await expect(page.getByText('Total blobs')).toBeVisible();
    await expect(page.getByText('Total storage')).toBeVisible();
  });

  test('empty node shows the empty state, not an error', async ({ page }) => {
    await mockNode(page, { blobs: [] });
    await page.goto('/admin-dashboard/blobs');

    await expect(page.getByText('No blobs found')).toBeVisible();
  });

  // apiFetch throws on any non-OK response; the page has to surface that rather
  // than sit silently on an empty table.
  test('a failing endpoint surfaces the error', async ({ page }) => {
    await mockNode(page, { blobs: [] });
    await page.route('**/admin-api/blobs', (route) =>
      route.fulfill({ status: 500, body: 'blob store unavailable' }),
    );
    await page.goto('/admin-dashboard/blobs');

    // The empty state renders alongside the alert — what matters is that the
    // failure is stated rather than presented as "this node has no blobs".
    await expect(
      page.getByText(/blob store unavailable|HTTP 500/i),
    ).toBeVisible();
  });
});
