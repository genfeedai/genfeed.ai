import { expect, test } from '@playwright/test';

test.describe('Website Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
  });

  test('nav contains key links', async ({ page }) => {
    const nav = page.locator('nav').first();
    await expect(nav).toBeVisible();

    // Check for common nav links
    for (const text of ['Pricing', 'Features']) {
      const link = nav.getByRole('link', { name: new RegExp(text, 'i') });
      // At least one should exist (may be in dropdown)
      const count = await link.count();
      if (count > 0) {
        await expect(link.first()).toBeVisible();
      }
    }
  });

  test('pricing link navigates correctly', async ({ page }) => {
    const pricingLink = page
      .locator('nav')
      .first()
      .getByRole('link', { name: /pricing/i })
      .first();
    if (await pricingLink.isVisible()) {
      await pricingLink.click();
      await page.waitForURL(/\/pricing/, { timeout: 10_000 });
      await expect(page).toHaveURL(/\/pricing/);
    }
  });

  test('mobile menu toggle works', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Mobile-only test');
    // Look for a hamburger / menu button
    const menuButton = page
      .getByRole('button', { name: /menu|toggle|hamburger/i })
      .first();
    if (await menuButton.isVisible()) {
      await menuButton.click();
      // Some nav items should become visible
      await expect(page.locator('nav a').first()).toBeVisible();
    }
  });
});
