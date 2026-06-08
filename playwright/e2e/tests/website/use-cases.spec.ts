import { expect, test } from '@playwright/test';

const useCasePages = [
  { name: 'Creators', path: '/creators' },
  { name: 'Agencies', path: '/agencies' },
  { name: 'Influencers', path: '/influencers' },
  { name: 'For Creators', path: '/for/creators' },
  { name: 'For Agencies', path: '/for/agencies' },
];

test.describe('Website Use Case Pages', () => {
  for (const { path, name } of useCasePages) {
    test(`${name} page loads and has content`, async ({ page }) => {
      await page.goto(path, {
        waitUntil: 'domcontentloaded',
      });
      // Should have at least one heading
      const heading = page.getByRole('heading').first();
      await expect(heading).toBeVisible({ timeout: 10_000 });
    });

    test(`${name} page has a CTA`, async ({ page }) => {
      await page.goto(path, {
        waitUntil: 'domcontentloaded',
      });
      // Look for call-to-action buttons or links
      const cta = page
        .getByRole('link', { name: /get started|try|sign up|start/i })
        .first();
      const ctaBtn = page
        .getByRole('button', { name: /get started|try|sign up|start/i })
        .first();
      const ctaVisible =
        (await cta.isVisible().catch(() => false)) ||
        (await ctaBtn.isVisible().catch(() => false));
      expect(ctaVisible).toBeTruthy();
    });
  }
});
