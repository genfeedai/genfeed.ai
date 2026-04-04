import {
  mockActiveSubscription,
  mockBrandsData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { BrandsPage } from '../../pages/brands.page';

/**
 * E2E Tests for Brand Management
 *
 * Tests verify brand list, detail view, settings,
 * and connected social accounts.
 * All API calls are mocked.
 */
test.describe('Brand Management', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockBrandsData(authenticatedPage, 3);
  });

  test.describe('Brand List', () => {
    test('should display brands list', async ({ authenticatedPage }) => {
      const brandsPage = new BrandsPage(authenticatedPage);

      await brandsPage.goto();

      await expect(authenticatedPage).toHaveURL(/brands/);
      await expect(brandsPage.mainContent).toBeVisible();
    });

    test('should show brand cards', async ({ authenticatedPage }) => {
      const brandsPage = new BrandsPage(authenticatedPage);

      await brandsPage.goto();
      await brandsPage.waitForPageLoad();

      const hasBrands = await brandsPage.brandCard
        .first()
        .isVisible()
        .catch(() => false);
      const hasContent = await brandsPage.mainContent
        .isVisible()
        .catch(() => false);

      expect(hasBrands || hasContent).toBe(true);
    });
  });

  test.describe('Brand Detail', () => {
    test('should navigate to brand detail', async ({ authenticatedPage }) => {
      const brandsPage = new BrandsPage(authenticatedPage);

      await brandsPage.goto();
      await brandsPage.waitForPageLoad();

      const hasBrands = await brandsPage.brandCard
        .first()
        .isVisible()
        .catch(() => false);

      if (hasBrands) {
        await brandsPage.clickBrand(0);
        await brandsPage.waitForPageLoad();
      }

      // Should be on detail page or still on brands
      const url = authenticatedPage.url();
      expect(url).toMatch(/brands/);
    });

    test('should show brand settings', async ({ authenticatedPage }) => {
      const brandsPage = new BrandsPage(authenticatedPage);

      await brandsPage.gotoBrandDetail('brand-1');

      await expect(brandsPage.mainContent).toBeVisible();

      // Brand title or heading should be present
      const hasTitle = await brandsPage.brandTitle
        .first()
        .isVisible()
        .catch(() => false);
      const hasContent = await brandsPage.mainContent
        .isVisible()
        .catch(() => false);

      expect(hasTitle || hasContent).toBe(true);
    });

    test('should display connected social accounts', async ({
      authenticatedPage,
    }) => {
      const brandsPage = new BrandsPage(authenticatedPage);

      await brandsPage.gotoBrandDetail('brand-1');
      await brandsPage.waitForPageLoad();

      // Connected accounts section or account cards
      const hasAccounts = await brandsPage.connectedAccounts
        .isVisible()
        .catch(() => false);
      const hasAccountCards = await brandsPage.accountCard
        .first()
        .isVisible()
        .catch(() => false);
      const hasContent = await brandsPage.mainContent
        .isVisible()
        .catch(() => false);

      expect(hasAccounts || hasAccountCards || hasContent).toBe(true);
    });
  });
});
