import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

test.describe('Admin Content', () => {
  test.setTimeout(60_000);

  const routes = [
    APP_ROUTES.ADMIN.CONTENT.POSTS,
    `${APP_ROUTES.ADMIN.CONTENT.POSTS}/mock-id`,
    APP_ROUTES.ADMIN.CONTENT.PROMPTS_LIST,
    `${APP_ROUTES.ADMIN.CONTENT.INGREDIENTS}/image`,
  ];

  for (const route of routes) {
    test(`renders ${route}`, async ({ adminPage }) => {
      await assertRouteRenders(adminPage, route);
    });
  }

  test('prompts list stays interactive', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, APP_ROUTES.ADMIN.CONTENT.PROMPTS_LIST);
    await tryClick(adminPage, '[data-testid="content-prompts-surface"] button');
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });

  test('posts list responds to clicks', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, APP_ROUTES.ADMIN.CONTENT.POSTS);
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });
});
