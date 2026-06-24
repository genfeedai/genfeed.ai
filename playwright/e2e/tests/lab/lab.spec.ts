import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

const BRAND = '/test-org/brand-1';

test.describe('Lab', () => {
  test.setTimeout(60_000);

  const routes = [
    `${BRAND}/lab/articles`,
    `${BRAND}/lab/library-preview`,
    `${BRAND}/lab/twitter-engage`,
  ];

  for (const route of routes) {
    test(`renders ${route}`, async ({ authenticatedPage }) => {
      await assertRouteRenders(authenticatedPage, route);
    });
  }

  test('articles view stays interactive', async ({ authenticatedPage }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND}/lab/articles`);
    await tryClick(authenticatedPage, 'button');
    await tryClick(authenticatedPage, '[role="tab"]');
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });

  test('cron-jobs lab redirects to workflows', async ({
    authenticatedPage,
  }) => {
    const response = await authenticatedPage.goto(`${BRAND}/lab/cron-jobs`, {
      waitUntil: 'domcontentloaded',
    });

    expect(response?.status() ?? 0).toBeLessThan(400);
    await expect(authenticatedPage).toHaveURL(
      /\/test-org\/brand-1\/workflows(?:[?#].*)?$/,
    );
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });
});
