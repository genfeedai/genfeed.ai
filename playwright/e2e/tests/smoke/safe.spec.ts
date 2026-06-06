import { expect, test } from '@playwright/test';

test.describe('Safe Smoke', () => {
  test('base app responds on configured baseURL', async ({ page, baseURL }) => {
    const response = await page.goto(baseURL ?? 'http://localhost:3015', {
      waitUntil: 'domcontentloaded',
    });

    expect(response?.status() ?? 0).toBeLessThan(400);
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
