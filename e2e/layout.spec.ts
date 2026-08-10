import { test, expect } from '@playwright/test';
import { mockNode } from './fixtures/node';

/**
 * Layout invariants for pages that predate the shell.
 *
 * Those pages are their own `.page-content` scroll container with their own
 * 28px/32px padding. Rendered inside AppShell's `<main>` — which already scrolls
 * and pads — that nests two scrollbars and doubles the gutter, so the shell
 * neutralises it. Easy to regress by editing either stylesheet.
 */
const SHELL_PAGES = [
  ['/admin-dashboard/namespaces', 'Namespaces'],
  ['/admin-dashboard/contexts', 'Contexts'],
  ['/admin-dashboard/blobs', 'Blobs'],
  ['/admin-dashboard/identity', 'Identity'],
] as const;

test.describe('Shell layout', () => {
  test.beforeEach(async ({ page }) => {
    await mockNode(page);
  });

  for (const [path, title] of SHELL_PAGES) {
    test(`${title} has a single scroll container and no doubled padding`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(page.getByTestId('shell-page-title')).toHaveText(title);

      const metrics = await page.evaluate(() => {
        const pc = document.querySelector('.main > .page-content');
        if (!pc) return null;
        const cs = getComputedStyle(pc);
        return {
          overflowY: cs.overflowY,
          paddingTop: cs.paddingTop,
          paddingLeft: cs.paddingLeft,
        };
      });

      expect(metrics).not.toBeNull();
      expect(metrics?.overflowY).toBe('visible');
      expect(metrics?.paddingTop).toBe('0px');
      expect(metrics?.paddingLeft).toBe('0px');
    });
  }

  test('the page body never scrolls horizontally', async ({ page }) => {
    await page.goto('/admin-dashboard/dashboard');
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflows).toBe(false);
  });
});
