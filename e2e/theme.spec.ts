import { test, expect } from '@playwright/test';
import { mockNode } from './fixtures/node';

/**
 * The light theme is the largest single visual gap this port closes — the
 * pre-port dashboard was dark-only. These tests assert the token switch actually
 * takes effect and persists, because a broken `data-theme` fails silently
 * (everything just stays dark).
 */
test.describe('Theme', () => {
  test.beforeEach(async ({ page }) => {
    await mockNode(page);
  });

  test('defaults to dark', async ({ page }) => {
    await page.goto('/admin-dashboard/dashboard');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('toggling in Settings switches to light and persists', async ({
    page,
  }) => {
    await page.goto('/admin-dashboard/settings');

    const readBgToken = () =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--bg-primary')
          .trim(),
      );
    // Read the token, not body's backgroundColor: the latter is CSS-transitioned
    // and samples an intermediate colour right after the toggle.
    const darkBefore = await readBgToken();

    await page.getByLabel('Dark Mode').uncheck({ force: true });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    const lightAfter = await readBgToken();
    expect(lightAfter).not.toBe(darkBefore);
    expect(darkBefore).toBe('#0d1117');
    expect(lightAfter).toBe('#fafafa');

    // Survives a reload — the setting is persisted, not just component state.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('the sidebar logo stays visible in light mode', async ({ page }) => {
    // The pre-port sidebar inlined an SVG with fill="#fafafa" baked into every
    // path, so the wordmark vanished on a light background.
    await page.goto('/admin-dashboard/settings');
    await page.getByLabel('Dark Mode').uncheck({ force: true });

    const logo = page.getByAltText('Calimero');
    await expect(logo).toBeVisible();
    await expect(logo).toHaveCSS('filter', /brightness\(0\)$/);
  });

  test('light mode is applied across routes', async ({ page }) => {
    await page.goto('/admin-dashboard/settings');
    await page.getByLabel('Dark Mode').uncheck({ force: true });
    await page.getByRole('link', { name: 'Applications', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});
