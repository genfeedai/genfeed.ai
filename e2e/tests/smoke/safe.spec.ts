import { expect, test } from '@playwright/test';

test.describe('Safe Smoke', () => {
  test('base app responds on configured baseURL', async ({ page, baseURL }) => {
    await page.goto(baseURL ?? 'http://localhost:3015', {
      waitUntil: 'domcontentloaded',
    });

    await expect(page).toHaveURL(/\/(overview|login)(?:$|[?#])/);
  });
});
