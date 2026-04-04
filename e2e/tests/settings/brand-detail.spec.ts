import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { testBrands } from '../../fixtures/test-data.fixture';
import { BrandsPage } from '../../pages/brands.page';

/**
 * E2E Tests for Brand Detail (parameterized /settings/brands/[id])
 *
 * CRITICAL: All tests use mocked API responses.
 * No real backend calls occur during tests.
 *
 * Tests verify that navigating to a specific brand and its sub-pages
 * (voice, publishing, agent-defaults) loads correctly.
 */
test.describe('Brand Detail — /settings/brands/[id]', () => {
  const brand = testBrands[0];

  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });

    // Mock brand detail endpoint
    await authenticatedPage.route(
      `**/api.genfeed.ai/**/brands/${brand.id}**`,
      async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            body: JSON.stringify({
              data: {
                attributes: {
                  connectedAccounts: brand.connectedAccounts,
                  createdAt: new Date().toISOString(),
                  description: brand.description,
                  imageUrl: brand.imageUrl,
                  name: brand.name,
                  slug: brand.slug,
                  updatedAt: new Date().toISOString(),
                },
                id: brand.id,
                type: 'brands',
              },
            }),
            contentType: 'application/json',
            status: 200,
          });
          return;
        }
        await route.continue();
      },
    );

    // Mock brands list endpoint
    await authenticatedPage.route(
      '**/api.genfeed.ai/**/brands**',
      async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            body: JSON.stringify({
              data: testBrands.map((b) => ({
                attributes: {
                  connectedAccounts: b.connectedAccounts,
                  createdAt: new Date().toISOString(),
                  description: b.description,
                  imageUrl: b.imageUrl,
                  name: b.name,
                  slug: b.slug,
                  updatedAt: new Date().toISOString(),
                },
                id: b.id,
                type: 'brands',
              })),
              meta: { totalCount: testBrands.length },
            }),
            contentType: 'application/json',
            status: 200,
          });
          return;
        }
        await route.continue();
      },
    );
  });

  test('should load brand detail page by ID', async ({ authenticatedPage }) => {
    const brandsPage = new BrandsPage(authenticatedPage);

    await brandsPage.gotoBrandDetail(brand.id);

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`settings/brands/${brand.id}`),
    );
    await expect(brandsPage.mainContent).toBeVisible({ timeout: 15000 });
  });

  test('should not redirect away from brand detail', async ({
    authenticatedPage,
  }) => {
    const brandsPage = new BrandsPage(authenticatedPage);

    await brandsPage.gotoBrandDetail(brand.id);

    const url = authenticatedPage.url();
    expect(url).toContain(`settings/brands/${brand.id}`);
    expect(url).not.toContain('/login');
  });

  test.describe('Brand Sub-Pages', () => {
    test('should load brand voice settings', async ({ authenticatedPage }) => {
      await authenticatedPage.goto(`/settings/brands/${brand.id}/voice`);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`settings/brands/${brand.id}/voice`),
      );

      const mainContent = authenticatedPage.locator(
        'main, [data-testid="main-content"]',
      );
      await expect(mainContent).toBeVisible({ timeout: 15000 });
    });

    test('should load brand publishing settings', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(`/settings/brands/${brand.id}/publishing`);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`settings/brands/${brand.id}/publishing`),
      );

      const mainContent = authenticatedPage.locator(
        'main, [data-testid="main-content"]',
      );
      await expect(mainContent).toBeVisible({ timeout: 15000 });
    });

    test('should load brand agent-defaults settings', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(
        `/settings/brands/${brand.id}/agent-defaults`,
      );
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`settings/brands/${brand.id}/agent-defaults`),
      );

      const mainContent = authenticatedPage.locator(
        'main, [data-testid="main-content"]',
      );
      await expect(mainContent).toBeVisible({ timeout: 15000 });
    });
  });

  test('should render brand detail on mobile viewport', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.setViewportSize({ height: 667, width: 375 });

    const brandsPage = new BrandsPage(authenticatedPage);

    await brandsPage.gotoBrandDetail(brand.id);

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`settings/brands/${brand.id}`),
    );
  });
});

test.describe('Brand Detail — Unauthenticated Access', () => {
  test('should redirect brand detail page to login', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto(`/settings/brands/${testBrands[0].id}`, {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });

    await expect(unauthenticatedPage).toHaveURL(/login|sign-in/, {
      timeout: 10000,
    });
  });

  test('should redirect brand voice sub-page to login', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto(
      `/settings/brands/${testBrands[0].id}/voice`,
      {
        timeout: 30000,
        waitUntil: 'domcontentloaded',
      },
    );

    await expect(unauthenticatedPage).toHaveURL(/login|sign-in/, {
      timeout: 10000,
    });
  });
});
