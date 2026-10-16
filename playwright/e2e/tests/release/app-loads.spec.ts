import { expect, test } from '@playwright/test';

test.describe('Released image — default login boundary', () => {
  test('a fresh visitor reaches login without a seeded admin session', async ({
    page,
  }) => {
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(response?.status() ?? 0).toBeLessThan(400);
    await expect(page).toHaveURL(/\/login(?:\?|$)/);
    await expect(page.locator('body')).not.toBeEmpty();
  });
});
