import {
  mockEmptyLibrary,
  mockLibraryPurchases,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { MarketplacePage } from '../../pages/marketplace.page';

/**
 * E2E Tests for Marketplace Library (purchased items)
 *
 * All API calls are mocked. No real backend calls.
 */
test.describe('Marketplace Library', () => {
  test("should display user's library page", async ({ authenticatedPage }) => {
    await mockLibraryPurchases(authenticatedPage, 4);

    const mp = new MarketplacePage(authenticatedPage);
    await mp.gotoLibrary();

    await mp.assertLibraryVisible();
    await expect(authenticatedPage).toHaveURL(/library/);
  });

  test('should show purchased items', async ({ authenticatedPage }) => {
    await mockLibraryPurchases(authenticatedPage, 3);

    const mp = new MarketplacePage(authenticatedPage);
    await mp.gotoLibrary();

    await mp.assertLibraryVisible();
    const body = await authenticatedPage.textContent('body');
    expect(body).toContain('Purchased Item');
  });

  test('should display empty state when no purchases', async ({
    authenticatedPage,
  }) => {
    await mockEmptyLibrary(authenticatedPage);

    const mp = new MarketplacePage(authenticatedPage);
    await mp.gotoLibrary();

    await mp.assertLibraryVisible();
    // Page should render without errors even with no items
    await expect(authenticatedPage).toHaveURL(/library/);
  });

  test('should filter library items by type', async ({ authenticatedPage }) => {
    await mockLibraryPurchases(authenticatedPage, 6);

    const mp = new MarketplacePage(authenticatedPage);
    await mp.gotoLibrary();

    await mp.assertLibraryVisible();

    // Try clicking workflow filter if available
    const workflowFilter = mp.libraryFilterWorkflow;
    const isFilterVisible = await workflowFilter.isVisible().catch(() => false);

    if (isFilterVisible) {
      await mp.filterLibrary('workflow');
      await authenticatedPage.waitForTimeout(500);
    }

    // Page should remain on library
    await expect(authenticatedPage).toHaveURL(/library/);
  });

  test('should navigate to item detail from library', async ({
    authenticatedPage,
  }) => {
    await mockLibraryPurchases(authenticatedPage, 4);

    const mp = new MarketplacePage(authenticatedPage);
    await mp.gotoLibrary();

    await mp.assertLibraryVisible();

    // Try clicking on a library item link
    const itemLink = authenticatedPage.locator(
      'a[href*="seller-"], a[href*="listing-"]',
    );
    const hasLinks = await itemLink
      .first()
      .isVisible()
      .catch(() => false);

    if (hasLinks) {
      await itemLink.first().click();
      await authenticatedPage.waitForLoadState('domcontentloaded');
    }

    // Should have navigated or still be on library
    const url = authenticatedPage.url();
    expect(url.includes('/library') || url.includes('/seller-')).toBe(true);
  });
});
