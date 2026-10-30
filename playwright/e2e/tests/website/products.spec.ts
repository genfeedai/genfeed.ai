import { expect, test } from '@playwright/test';
import { appProducts } from '../../../../apps/website/src/data/app-products.data';

async function readJsonLdTypes(
  page: import('@playwright/test').Page,
): Promise<string[]> {
  const blocks = await page
    .locator('script[type="application/ld+json"]')
    .allTextContents();

  return blocks.map((block) => String(JSON.parse(block)['@type']));
}

test.describe('Website product pages', () => {
  test('hub links every app product', async ({ page }) => {
    await page.goto('/products', { waitUntil: 'domcontentloaded' });

    await expect(
      page.getByRole('heading', { level: 1, name: 'Genfeed Products' }),
    ).toBeVisible();

    for (const product of appProducts) {
      await expect(
        page.locator(`main a[href="/products/${product.slug}"]`).first(),
      ).toBeVisible();
    }

    expect(await readJsonLdTypes(page)).toEqual(
      expect.arrayContaining(['CollectionPage', 'BreadcrumbList']),
    );
  });

  for (const product of appProducts) {
    test(`${product.name} defines the product and shows the real app`, async ({
      page,
    }) => {
      await page.goto(`/products/${product.slug}`, {
        waitUntil: 'domcontentloaded',
      });

      await expect(
        page.getByRole('heading', {
          level: 1,
          name: `Genfeed ${product.name}`,
        }),
      ).toBeVisible();
      await expect(
        page.getByRole('heading', {
          level: 2,
          name: `What is ${product.name}?`,
        }),
      ).toBeVisible();
      await expect(page.getByText(product.definition)).toBeVisible();

      // A screenshot of the app page, never a hand-built mock: it must load.
      const screenshot = page.getByRole('img', {
        name: product.screenshot.alt,
      });
      await expect(screenshot.first()).toBeVisible();
      await expect
        .poll(() =>
          screenshot
            .first()
            .evaluate((img: HTMLImageElement) => img.naturalWidth),
        )
        .toBeGreaterThan(0);

      expect(await readJsonLdTypes(page)).toEqual(
        expect.arrayContaining([
          'SoftwareApplication',
          'BreadcrumbList',
          'FAQPage',
        ]),
      );
    });
  }

  test('the retired /studio page is gone, with no redirect', async ({
    page,
  }) => {
    const response = await page.goto('/studio', {
      waitUntil: 'domcontentloaded',
    });

    expect(response?.status()).toBe(404);
    expect(new URL(page.url()).pathname).toBe('/studio');
  });

  test('an unknown product is a 404', async ({ page }) => {
    const response = await page.goto('/products/not-a-product', {
      waitUntil: 'domcontentloaded',
    });

    expect(response?.status()).toBe(404);
  });
});
