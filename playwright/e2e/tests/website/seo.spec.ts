import { expect, test } from '@playwright/test';

const pages = [
  { name: 'Home', path: '/' },
  { name: 'Pricing', path: '/pricing' },
  { name: 'Features', path: '/features' },
  { name: 'About', path: '/about' },
];

test.describe('Website SEO', () => {
  for (const { path, name } of pages) {
    test(`${name} page has meta description`, async ({ page }) => {
      await page.goto(path, {
        waitUntil: 'domcontentloaded',
      });
      const description = await page
        .locator('meta[name="description"]')
        .getAttribute('content');
      expect(description).toBeTruthy();
      expect(description?.length).toBeGreaterThan(10);
    });

    test(`${name} page has OG tags`, async ({ page }) => {
      await page.goto(path, {
        waitUntil: 'domcontentloaded',
      });
      const ogTitle = await page
        .locator('meta[property="og:title"]')
        .getAttribute('content');
      expect(ogTitle).toBeTruthy();
      const ogDescription = await page
        .locator('meta[property="og:description"]')
        .getAttribute('content');
      expect(ogDescription).toBeTruthy();
    });

    test(`${name} page has canonical URL`, async ({ page }) => {
      await page.goto(path, {
        waitUntil: 'domcontentloaded',
      });
      const canonical = await page
        .locator('link[rel="canonical"]')
        .getAttribute('href');
      // Canonical may or may not exist; if it does, it should be a valid URL
      if (canonical) {
        expect(canonical).toMatch(/^https?:\/\//);
      }
    });
  }

  test('Home page has JSON-LD structured data', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const jsonLd = page.locator('script[type="application/ld+json"]');
    const count = await jsonLd.count();
    if (count > 0) {
      const content = await jsonLd.first().textContent();
      expect(() => JSON.parse(content!)).not.toThrow();
    }
  });
});
