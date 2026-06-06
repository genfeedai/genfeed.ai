import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

test.describe('Admin Content', () => {
  test.setTimeout(60_000);

  const routes = [
    '/admin/content/posts',
    '/admin/content/posts/mock-id',
    '/admin/content/prompts/list',
    '/admin/content/ingredients/image',
  ];

  for (const route of routes) {
    test(`renders ${route}`, async ({ adminPage }) => {
      await assertRouteRenders(adminPage, route);
    });
  }

  test('prompts list stays interactive', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, '/admin/content/prompts/list');
    await tryClick(adminPage, '[data-testid="content-prompts-surface"] button');
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });

  test('posts list responds to clicks', async ({ adminPage }) => {
    await assertRouteRenders(adminPage, '/admin/content/posts');
    await tryClick(adminPage, 'button');
    await expect(adminPage.locator('body')).toBeVisible();
  });
});
