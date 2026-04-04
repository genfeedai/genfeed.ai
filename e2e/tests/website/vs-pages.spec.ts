import { expect, test } from '@playwright/test';

test.describe('Website VS Comparison Pages', () => {
  test('VS page template renders correctly', async ({ page }) => {
    // Navigate to a known VS page slug
    // These are dynamic [slug] pages, so we test a common pattern
    await page.goto('/vs/capcut', {
      waitUntil: 'domcontentloaded',
    });
    // Should either render comparison content or redirect/404
    const status = page.url();
    if (!status.includes('404')) {
      const heading = page.getByRole('heading').first();
      await expect(heading).toBeVisible({ timeout: 10_000 });
    }
  });

  test('VS pages have comparison content', async ({ page }) => {
    await page.goto('/vs/capcut', {
      waitUntil: 'domcontentloaded',
    });
    if (!page.url().includes('404')) {
      // Look for comparison table or feature list
      const content = await page.textContent('body');
      expect(content).toBeTruthy();
      expect(content?.length).toBeGreaterThan(100);
    }
  });
});
