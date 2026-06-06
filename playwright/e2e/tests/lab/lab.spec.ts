import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

const BRAND = '/test-org/brand-1';

test.describe('Lab', () => {
  test.setTimeout(60_000);

  const routes = [
    `${BRAND}/lab/articles`,
    `${BRAND}/lab/cron-jobs`,
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

  test('cron-jobs view stays interactive', async ({ authenticatedPage }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND}/lab/cron-jobs`);
    await tryClick(authenticatedPage, '[data-testid]');
    await tryClick(authenticatedPage, 'button');
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });
});
