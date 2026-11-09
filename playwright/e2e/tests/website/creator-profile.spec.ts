import { expect, test } from '@playwright/test';

/**
 * A creator profile that does not exist (or is not public) answers a real 404
 * and shows the site's "Page not found" page. A shared boundary once swallowed
 * the framework's not-found signal, so visitors saw "Something went wrong"
 * with a minified React error instead.
 */
test.describe('Creator profile: unknown handle', () => {
  for (const path of [
    '/@no-such-creator-handle',
    '/@no-such-creator-handle/posts',
    '/@no-such-creator-handle/articles/no-such-article',
  ]) {
    test(`${path} shows the not found page`, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: 'networkidle' });

      expect(response?.status()).toBe(404);
      await expect(
        page.getByRole('heading', { name: 'Page not found' }),
      ).toBeVisible();
      await expect(page.getByText('Something went wrong')).toHaveCount(0);
    });
  }
});
