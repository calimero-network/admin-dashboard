import { expect, test } from '@playwright/test';
import { APP_WITH_FRONTEND, mockNode } from './fixtures/node';

/**
 * The Contexts page had no functional coverage at all — the layout spec walked
 * through it to check its scroll container, which says nothing about whether it
 * lists anything. Everything here is against the mocked node, so it runs in the
 * fast E2E job rather than only in the live one.
 */
const CONTEXTS = [
  {
    id: 'Ctx1111111111111111111111111111111111111111',
    applicationId: APP_WITH_FRONTEND.id,
  },
  {
    id: 'Ctx2222222222222222222222222222222222222222',
    applicationId: APP_WITH_FRONTEND.id,
  },
];

test.describe('Contexts', () => {
  test('lists the contexts the node reports', async ({ page }) => {
    await mockNode(page, { contexts: CONTEXTS });
    await page.goto('/admin-dashboard/contexts');

    await expect(page.getByTestId('shell-page-title')).toHaveText('Contexts');
    await expect(
      page.getByRole('columnheader', { name: 'Context ID' }),
    ).toBeVisible();
    // The table truncates at 32 chars, so match the head of each id.
    for (const ctx of CONTEXTS) {
      await expect(
        page.getByText(ctx.id.slice(0, 32), { exact: false }),
      ).toBeVisible();
    }
  });

  test('empty state explains how to make one', async ({ page }) => {
    await mockNode(page, { contexts: [] });
    await page.goto('/admin-dashboard/contexts');

    await expect(page.getByText('No contexts found')).toBeVisible();
    await expect(page.getByText(/New Context.*create one/i)).toBeVisible();
  });

  test('the create form opens and closes without leaving the page', async ({
    page,
  }) => {
    await mockNode(page, { contexts: [] });
    await page.goto('/admin-dashboard/contexts');

    await expect(page.getByText('Create New Context')).toHaveCount(0);
    await page.getByRole('button', { name: /New Context/i }).click();
    await expect(page.getByText('Create New Context')).toBeVisible();

    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText('Create New Context')).toHaveCount(0);
    await expect(page).toHaveURL(/\/admin-dashboard\/contexts$/);
  });

  // Both fields are required by the node, so the button stays disabled until it
  // could actually succeed — otherwise the only feedback is a failed request.
  test('Create stays disabled until the form can succeed', async ({ page }) => {
    await mockNode(page, { contexts: [] });
    await page.goto('/admin-dashboard/contexts');

    await page.getByRole('button', { name: /New Context/i }).click();
    await expect(
      page.getByRole('button', { name: 'Create Context' }),
    ).toBeDisabled();
  });
});
