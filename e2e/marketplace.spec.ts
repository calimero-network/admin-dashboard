import { test, expect } from '@playwright/test';
import { mockNode, PNG_1PX } from './fixtures/node';

test.describe('Marketplace', () => {
  test.beforeEach(async ({ page }) => {
    await mockNode(page, {
      bundles: [
        {
          package: 'com.calimero.merochat',
          appVersion: '1.2.0',
          metadata: {
            name: 'Mero Chat',
            description: 'Chat over Calimero.',
            author: 'Calimero',
            icon: PNG_1PX,
            tags: ['communication', 'chat'],
          },
          verified: true,
          publisherVerified: true,
          downloads: 42,
        },
        {
          // Deliberately icon-less: 3 of the 21 published bundles are, so the
          // fallback needs a case in the suite.
          package: 'com.calimero.meroblocks',
          appVersion: '0.1.1',
          metadata: { name: 'Mero Blocks', description: 'Voxel sandbox.' },
        },
      ],
    });
    // The cache is keyed on the registry list and served stale-while-revalidate,
    // so a leftover entry from another test would mask the fetch under test.
    await page.addInitScript(() =>
      // ⚠️ BY PREFIX, NOT BY EXACT KEY. The cache key carries a schema version
      // suffix, so clearing the literal name silently stops clearing anything
      // the next time that version is bumped — and the spec then runs against
      // a warm cache while looking like it controls the state.
      Object.keys(localStorage)
        .filter((k) => k.startsWith('calimero-marketplace-cache'))
        .forEach((k) => localStorage.removeItem(k)),
    );
    await page.goto('/admin-dashboard/marketplace');
  });

  // The node release a bundle was built against, which the registry serves as
  // `min_runtime_version`. Core refuses to install a bundle whose floor is above
  // the node, and before this the only way to find out was to press Install and
  // read the toast.
  test('shows which node release a bundle was built against', async ({
    page,
  }) => {
    await mockNode(page, {
      bundles: [
        {
          package: 'com.calimero.built',
          appVersion: '1.0.0',
          metadata: { name: 'Built App' },
          min_runtime_version: '0.11.0-rc.37',
        },
        {
          // The registry DEFAULTS an absent floor to `0.1.0`
          // (bundle-sanitize.js), so this is not a runtime anybody ran. A card
          // that printed it would put a confident wrong answer on most apps.
          package: 'com.calimero.placeholder',
          appVersion: '1.0.0',
          metadata: { name: 'Placeholder App' },
          min_runtime_version: '0.1.0',
        },
        {
          package: 'com.calimero.nofloor',
          appVersion: '1.0.0',
          metadata: { name: 'No Floor App' },
        },
      ],
    });
    await page.goto('/admin-dashboard/marketplace');

    const built = page.getByTestId('app-card').filter({ hasText: 'Built App' });
    await expect(built.getByTestId('app-card-runtime')).toHaveText(
      'node 0.11.0-rc.37',
    );

    // Asserted ABSENT, both of them — the placeholder and the missing value.
    for (const name of ['Placeholder App', 'No Floor App']) {
      const card = page.getByTestId('app-card').filter({ hasText: name });
      await expect(card).toBeVisible();
      await expect(card.getByTestId('app-card-runtime')).toHaveCount(0);
    }
  });

  test('lists bundles from the configured registry', async ({ page }) => {
    await expect(page.getByTestId('app-card')).toHaveCount(2);
    await expect(page.getByText('Mero Chat')).toBeVisible();
  });

  test('marks an already-installed app', async ({ page }) => {
    // The default mock node has Mero Blocks installed, correlated by metadata
    // name — the node-assigned app id never matches a registry package id.
    const card = page
      .getByTestId('app-card')
      .filter({ hasText: 'Mero Blocks' });
    await expect(card.getByText('Installed')).toBeVisible();
  });

  test('search filters by name and clears', async ({ page }) => {
    await page.getByTestId('marketplace-search').fill('chat');
    await expect(page.getByTestId('app-card')).toHaveCount(1);

    await page.getByRole('button', { name: 'Clear search' }).click();
    await expect(page.getByTestId('app-card')).toHaveCount(2);
  });

  test('filter pills narrow by installed state', async ({ page }) => {
    await page.getByRole('button', { name: 'Installed', exact: true }).click();
    await expect(page.getByTestId('app-card')).toHaveCount(1);

    await page.getByRole('button', { name: 'Not Installed' }).click();
    await expect(page.getByTestId('app-card')).toHaveCount(1);
    await expect(page.getByText('Mero Chat')).toBeVisible();

    await page.getByRole('button', { name: 'All', exact: true }).click();
    await expect(page.getByTestId('app-card')).toHaveCount(2);
  });

  test('cards render the bundle icon, not a generic glyph', async ({
    page,
  }) => {
    // The listing used to draw one lucide box for every app while the registry,
    // reading the SAME endpoint, drew real launcher icons — the mapper was
    // dropping `metadata.icon`. Assert the <img> is really there, because the
    // component falls back to a letter tile the moment it fails to decode.
    const card = page.getByTestId('app-card').filter({ hasText: 'Mero Chat' });
    const icon = card.locator('img.app-icon-img');
    await expect(icon).toBeVisible();
    await expect(icon).toHaveJSProperty('naturalWidth', 1);
  });

  test('a bundle with no icon gets the lettered fallback, not a broken image', async ({
    page,
  }) => {
    // 3 of the 21 published bundles carry no icon, so this is a normal state.
    const card = page
      .getByTestId('app-card')
      .filter({ hasText: 'Mero Blocks' });
    await expect(card.getByTestId('app-icon-fallback')).toHaveText('M');
    await expect(card.locator('img.app-icon-img')).toHaveCount(0);
  });

  test('cards carry the structured metadata the table never showed', async ({
    page,
  }) => {
    const card = page.getByTestId('app-card').filter({ hasText: 'Mero Chat' });
    await expect(card).toContainText('com.calimero.merochat');
    await expect(card).toContainText('Chat over Calimero.');
    await expect(card).toContainText('42');
    await expect(card).toContainText('v1.2.0');
    // Two DIFFERENT claims, so two separately labelled marks.
    await expect(card.getByLabel('Verified package')).toBeVisible();
    await expect(card.getByLabel('Verified author')).toBeVisible();
  });

  test('preview images load from the registry, not from the app origin', async ({
    page,
  }) => {
    // ⚠️ THE REGISTRY SERVES ROOT-RELATIVE ASSET URLS. Used verbatim in an
    // <img src> they resolve against the dashboard's own origin — the vite dev
    // server — which answers "The server is configured with a public base URL
    // of /admin-dashboard/ — did you mean to visit /admin-dashboard/api/v2/…"
    // instead of an image, and every preview renders broken.
    await page.goto('/admin-dashboard/marketplace/com.calimero.merochat');
    const shots = page.locator('.app-detail-shot img');
    await expect(shots).toHaveCount(2);
    // Decoded, not merely requested: a broken image has naturalWidth 0.
    await expect(shots.first()).toHaveJSProperty('naturalWidth', 1);
    await expect(shots.last()).toHaveJSProperty('naturalWidth', 1);
    // Rendered in the registry's stated order, not the store's.
    await expect(shots.first()).toHaveAttribute('alt', 'First');
  });

  test('clicking a preview opens it full screen, and it really is full screen', async ({
    page,
  }) => {
    await page.goto('/admin-dashboard/marketplace/com.calimero.merochat');
    await page.getByTestId('app-detail-shot').first().click();

    const box = page.getByTestId('lightbox');
    await expect(box).toBeVisible();

    // ⚠️ THE ASSERTION THAT EARNS ITS KEEP. The preview strip is a horizontal
    // scroll container, so an overlay rendered inside it is CLIPPED to one
    // tile — it would still be "visible" while covering a 260x160 box. This
    // checks it actually fills the viewport, which is what the portal is for.
    const vp = page.viewportSize()!;
    const rect = (await box.boundingBox())!;
    expect(rect.width).toBeGreaterThanOrEqual(vp.width - 1);
    expect(rect.height).toBeGreaterThanOrEqual(vp.height - 1);
    // And it is a direct child of <body>, not of the strip.
    await expect(box).toHaveJSProperty('parentElement.tagName', 'BODY');

    // The FULL image, not the thumbnail the strip renders.
    await expect(page.getByTestId('lightbox-image')).toHaveJSProperty(
      'naturalWidth',
      1,
    );
  });

  test('the full-screen preview steps between images and closes', async ({
    page,
  }) => {
    await page.goto('/admin-dashboard/marketplace/com.calimero.merochat');
    await page.getByTestId('app-detail-shot').first().click();
    const box = page.getByTestId('lightbox');
    await expect(box).toContainText('1 / 2');

    await page.getByTestId('lightbox-next').click();
    await expect(box).toContainText('2 / 2');
    // Wrapping, so the arrow never reads as a dead key at the end of the set.
    await page.getByTestId('lightbox-next').click();
    await expect(box).toContainText('1 / 2');

    await page.keyboard.press('ArrowRight');
    await expect(box).toContainText('2 / 2');
    await page.keyboard.press('ArrowLeft');
    await expect(box).toContainText('1 / 2');

    await page.keyboard.press('Escape');
    await expect(box).toHaveCount(0);

    // Re-open and close via the button and the backdrop.
    await page.getByTestId('app-detail-shot').first().click();
    await page.getByTestId('lightbox-close').click();
    await expect(box).toHaveCount(0);

    await page.getByTestId('app-detail-shot').first().click();
    // A click on the IMAGE must not close it — only the backdrop.
    await page.getByTestId('lightbox-image').click();
    await expect(box).toBeVisible();
    await page.mouse.click(8, 8);
    await expect(box).toHaveCount(0);
  });

  test('an app with no preview images says so', async ({ page }) => {
    await page.goto('/admin-dashboard/marketplace/com.calimero.meroblocks');
    await expect(page.getByText('No preview images published')).toBeVisible();
  });

  test('opening a card navigates to the application page', async ({ page }) => {
    await page.getByTestId('app-card').filter({ hasText: 'Mero Chat' }).click();
    await expect(page).toHaveURL(/\/marketplace\/com\.calimero\.merochat$/);
    const detail = page.getByTestId('app-detail-page');
    await expect(detail).toBeVisible();
    await expect(
      detail.getByText('com.calimero.merochat').first(),
    ).toBeVisible();
    await expect(detail.getByTestId('detail-install')).toBeVisible();
  });

  test('the application page survives a reload', async ({ page }) => {
    // The whole reason this is a route and not a modal. Landing on it directly
    // means there is no in-memory listing to read, so the page has to refetch.
    await page.goto('/admin-dashboard/marketplace/com.calimero.merochat');
    const detail = page.getByTestId('app-detail-page');
    await expect(detail).toBeVisible();
    await expect(detail.getByText('Mero Chat')).toBeVisible();
  });

  test('the version picker offers this app versions and not another app', async ({
    page,
  }) => {
    // Regression guard: fetchAppVersions trusted the registry's ?package=
    // filter, so an unfiltered response offered another app's versions — the
    // Mero Blocks page showed Mero Chat's 1.2.0 and installing it would have
    // resolved an artifact URL that does not exist for this package.
    await page.goto('/admin-dashboard/marketplace/com.calimero.merochat');
    const picker = page.getByTestId('version-picker');
    await expect(picker).toBeVisible();
    await expect(picker).toContainText('1.2.0');
    await expect(picker).not.toContainText('0.1.1');
  });

  test('Install posts the chosen version to the node', async ({ page }) => {
    // The install path moved out of the listing when the modal became a page,
    // so this asserts the button still reaches the node — and that it installs
    // the version the PICKER is on, not `latest_version`.
    // ⚠️ `admin-api/install-application`, NOT a POST to `admin-api/applications`
    // — that is the route the SDK actually uses, and routing the plural one
    // catches nothing while the fixture's catch-all still answers 200, so the
    // success toast appears and the assertion passes against zero requests.
    const posted: string[] = [];
    await page.route('**/admin-api/install-application', (route) => {
      posted.push(route.request().postData() ?? '');
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: { applicationId: 'installed-1' } }),
      });
    });

    await page.goto('/admin-dashboard/marketplace/com.calimero.merochat');
    await expect(page.getByTestId('version-picker')).toBeVisible();
    await page.getByTestId('detail-install').click();

    await expect(page.getByText(/Mero Chat installed/)).toBeVisible();
    expect(posted).toHaveLength(1);
    expect(posted[0]).toContain('com.calimero.merochat-1.2.0.mpk');
  });

  test('back returns to the listing', async ({ page }) => {
    await page.getByTestId('app-card').filter({ hasText: 'Mero Chat' }).click();
    await expect(page.getByTestId('app-detail-page')).toBeVisible();
    await page
      .getByTestId('app-detail-page')
      .getByRole('link', { name: 'Marketplace' })
      .click();
    await expect(page.getByTestId('app-card')).toHaveCount(2);
  });

  test('empty registry shows the empty state', async ({ page }) => {
    await mockNode(page, { bundles: [] });
    await page.addInitScript(() =>
      // ⚠️ BY PREFIX, NOT BY EXACT KEY. The cache key carries a schema version
      // suffix, so clearing the literal name silently stops clearing anything
      // the next time that version is bumped — and the spec then runs against
      // a warm cache while looking like it controls the state.
      Object.keys(localStorage)
        .filter((k) => k.startsWith('calimero-marketplace-cache'))
        .forEach((k) => localStorage.removeItem(k)),
    );
    await page.goto('/admin-dashboard/marketplace');
    await expect(page.getByText('No applications found')).toBeVisible();
  });
});

test.describe('Settings → Registries', () => {
  test.beforeEach(async ({ page }) => {
    await mockNode(page);
    await page.goto('/admin-dashboard/settings');
    await page.getByRole('tab', { name: 'Registries' }).click();
  });

  test('shows the default registry and can add another', async ({ page }) => {
    await expect(
      page.getByText('https://apps.calimero.network/'),
    ).toBeVisible();

    await page.getByLabel('Registry URL').fill('https://other.example/');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText('https://other.example/')).toBeVisible();
  });

  test('rejects a non-URL', async ({ page }) => {
    await page.getByLabel('Registry URL').fill('not a url');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText(/valid absolute URL/)).toBeVisible();
  });

  test('refuses to remove the last registry', async ({ page }) => {
    // An empty registry list leaves the Marketplace dead with no way back.
    await expect(page.getByRole('button', { name: 'Remove' })).toBeDisabled();
  });

  test('About tab reports the node it is bound to', async ({ page }) => {
    await page.getByRole('tab', { name: 'About' }).click();
    const origin = new URL(page.url()).origin;
    await expect(page.getByText(`${origin}/admin-api`)).toBeVisible();
    await expect(page.getByText(/bound to exactly one node/)).toBeVisible();
  });
});
