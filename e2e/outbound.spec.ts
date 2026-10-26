import { expect, test, type Page } from '@playwright/test';
import {
  bundleMetadata,
  metadataBytes,
  mockNode,
  type MockApp,
} from './fixtures/node';

/**
 * Outbound approvals: an app's signed manifest declares the URL prefixes it
 * sends requests to (`outbound` in the metadata JSON), and its requests go out
 * only for prefixes the namespace approved for its publisher.
 *
 * Mocked node, so these pin the WIRE the page sends: `approveOutbound` on
 * create ("manifest" or a list, absent when nothing is declared) and the
 * `{ applicationId, approve }` PUT, which replaces the list and so must always
 * carry all of it.
 */

const STRIPE = 'https://api.stripe.com/v1/';
const TURNSTILE = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const SIGNER = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK';
const NS_ID = 'ab'.repeat(32);

const FORMS_APP: MockApp = {
  id: 'FormsApp333333333333333333333333333333333333',
  signer_id: SIGNER,
  metadata: metadataBytes(
    bundleMetadata({
      name: 'Mero Forms',
      package: 'com.calimero.mero-forms',
      outbound: [TURNSTILE, STRIPE],
    }),
  ),
};

async function openCreate(page: Page) {
  await page.goto('/admin-dashboard/namespaces');
  await page
    .locator(`.ns-app-card[data-application-id="${FORMS_APP.id}"]`)
    .click();
  await page.getByRole('button', { name: /Create Namespace/i }).click();
}

test.describe('Outbound approvals', () => {
  test('create lists the declared prefixes, all checked, and sends "manifest"', async ({
    page,
  }) => {
    await mockNode(page, { apps: [FORMS_APP] });
    let body: unknown;
    await page.route('**/admin-api/namespaces', (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      body = route.request().postDataJSON();
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            namespaceId: NS_ID,
            outboundApproval: {
              signer: SIGNER,
              prefixes: [TURNSTILE, STRIPE],
              reviewed: [TURNSTILE, STRIPE],
            },
          },
        }),
      });
    });
    await openCreate(page);

    const list = page.getByTestId('ns-outbound-checklist');
    await expect(list).toContainText('This app sends requests to:');
    await expect(list.getByRole('checkbox')).toHaveCount(2);
    for (const box of await list.getByRole('checkbox').all()) {
      await expect(box).toBeChecked();
    }

    await page
      .getByTestId('ns-create-panel')
      .getByRole('button', { name: 'Create', exact: true })
      .click();
    await expect
      .poll(() => body)
      .toEqual({
        applicationId: FORMS_APP.id,
        approveOutbound: 'manifest',
      });
  });

  test('an unchecked prefix is left out of the list sent', async ({ page }) => {
    await mockNode(page, { apps: [FORMS_APP] });
    let body: unknown;
    await page.route('**/admin-api/namespaces', (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      body = route.request().postDataJSON();
      return route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ data: { namespaceId: NS_ID } }),
      });
    });
    await openCreate(page);

    await page.getByLabel(`Approve requests to ${TURNSTILE}`).uncheck();
    await expect(page.getByTestId('ns-outbound-unchecked')).toHaveText(
      '1 prefix will be refused.',
    );
    await page
      .getByTestId('ns-create-panel')
      .getByRole('button', { name: 'Create', exact: true })
      .click();
    await expect
      .poll(() => body)
      .toEqual({
        applicationId: FORMS_APP.id,
        approveOutbound: [STRIPE],
      });
  });

  test('a create whose approval failed names the namespace it created', async ({
    page,
  }) => {
    await mockNode(page, { apps: [FORMS_APP] });
    await page.route('**/admin-api/namespaces', (route) => {
      if (route.request().method() !== 'POST') return route.fallback();
      return route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          error: `namespace ${NS_ID} was created, but approving outbound requests failed: not permitted`,
        }),
      });
    });
    await openCreate(page);
    await page
      .getByTestId('ns-create-panel')
      .getByRole('button', { name: 'Create', exact: true })
      .click();

    const alert = page.getByTestId('ns-outbound-partial');
    await expect(alert).toContainText(
      'Namespace created, but approving its outbound requests failed.',
    );
    await expect(alert).toContainText(NS_ID);
    await expect(alert).toContainText('not permitted');
  });

  test('the namespace lists its approvals, and revoking PUTs the rest', async ({
    page,
  }) => {
    await mockNode(page, {
      apps: [FORMS_APP],
      namespaces: [
        {
          namespaceId: NS_ID,
          targetApplicationId: FORMS_APP.id,
          name: 'Survey',
        },
      ],
    });
    let put: unknown;
    await page.route(
      '**/admin-api/namespaces/*/outbound-approvals',
      (route) => {
        if (route.request().method() === 'PUT') {
          put = route.request().postDataJSON();
          return route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
              data: {
                namespaceId: NS_ID,
                signer: SIGNER,
                prefixes: [STRIPE],
                reviewed: [TURNSTILE, STRIPE],
                published: true,
              },
            }),
          });
        }
        return route.fulfill({
          contentType: 'application/json',
          body: JSON.stringify({
            data: [
              {
                signer: SIGNER,
                prefixes: [TURNSTILE, STRIPE],
                reviewed: [TURNSTILE, STRIPE],
              },
            ],
          }),
        });
      },
    );
    await page.goto('/admin-dashboard/namespaces');
    await page
      .locator(`.ns-app-card[data-application-id="${FORMS_APP.id}"]`)
      .click();
    await page.getByTestId('ns-card').click();

    const section = page.getByTestId('ns-outbound-section');
    await expect(section).toContainText('Outbound access');
    const row = section
      .getByTestId('ns-outbound-row')
      .filter({ hasText: TURNSTILE });
    await expect(row).toContainText('Approved');

    await row.getByRole('button', { name: 'Revoke' }).click();
    await row.getByRole('button', { name: 'Confirm revoke' }).click();
    await expect(row).toContainText('Revoked');
    expect(put).toEqual({ applicationId: FORMS_APP.id, approve: [STRIPE] });
  });
});
