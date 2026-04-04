import { expect, test } from '@playwright/test';

test.describe('Website Pricing Page', () => {
  test('loads and displays pricing plans', async ({ page }) => {
    await page.goto('/pricing', {
      waitUntil: 'domcontentloaded',
    });
    // Should have a heading mentioning pricing
    const heading = page.getByRole('heading', { level: 1 }).first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });

  test('displays at least 2 pricing tiers', async ({ page }) => {
    await page.goto('/pricing', {
      waitUntil: 'domcontentloaded',
    });
    // Look for pricing cards/sections - typically buttons like "Get Started" or "Subscribe"
    const ctaButtons = page.getByRole('button', {
      name: /get started|subscribe|try|start/i,
    });
    await expect(ctaButtons.first()).toBeVisible({ timeout: 10_000 });
    const count = await ctaButtons.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('page has correct meta title', async ({ page }) => {
    await page.goto('/pricing', {
      waitUntil: 'domcontentloaded',
    });
    const title = await page.title();
    expect(title.toLowerCase()).toContain('pricing');
  });
});
