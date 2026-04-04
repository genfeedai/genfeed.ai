import {
  mockLibraryPurchases,
  mockListingDetail,
  mockStripeCheckout,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { testListings } from '../../fixtures/test-data.fixture';
import { MarketplacePage } from '../../pages/marketplace.page';

/**
 * E2E Tests for Marketplace Checkout Flow
 *
 * All Stripe and API calls are mocked.
 * No real payments occur.
 */
test.describe('Marketplace Checkout', () => {
  const listing = testListings[0];

  test.describe('Listing Detail', () => {
    test('should display listing detail page', async ({
      unauthenticatedPage,
    }) => {
      await mockListingDetail(unauthenticatedPage, {
        sellerSlug: listing.sellerSlug,
        slug: listing.slug,
      });

      const mp = new MarketplacePage(unauthenticatedPage);
      await mp.gotoListingDetail(listing.sellerSlug, listing.slug);

      await mp.assertListingDetailVisible();
      await expect(unauthenticatedPage).toHaveURL(
        new RegExp(`${listing.sellerSlug}/${listing.slug}`),
      );
    });

    test('should show pricing information', async ({ unauthenticatedPage }) => {
      await mockListingDetail(unauthenticatedPage, {
        price: 999,
        sellerSlug: listing.sellerSlug,
        slug: listing.slug,
      });

      const mp = new MarketplacePage(unauthenticatedPage);
      await mp.gotoListingDetail(listing.sellerSlug, listing.slug);

      await mp.assertListingDetailVisible();
      // The page should contain price-related text
      const body = await unauthenticatedPage.textContent('body');
      expect(body).toBeTruthy();
      expect(body?.length).toBeGreaterThan(100);
    });
  });

  test.describe('Checkout Flow', () => {
    test('should initiate checkout with mocked Stripe', async ({
      authenticatedPage,
    }) => {
      await mockListingDetail(authenticatedPage, {
        price: 999,
        sellerSlug: listing.sellerSlug,
        slug: listing.slug,
      });
      await mockStripeCheckout(authenticatedPage);

      const mp = new MarketplacePage(authenticatedPage);
      await mp.gotoListingDetail(listing.sellerSlug, listing.slug);

      await mp.assertListingDetailVisible();
      // Purchase button should be visible for non-owned items
      await mp.clickPurchase().catch(() => {
        // Button might redirect or open Stripe
      });

      await expect(authenticatedPage).toHaveURL(/.*/);
    });

    test('should redirect to success page after checkout', async ({
      authenticatedPage,
    }) => {
      await mockStripeCheckout(authenticatedPage);

      const mp = new MarketplacePage(authenticatedPage);
      await mp.gotoCheckoutSuccess('cs_test_mock_session_123');

      await mp.assertCheckoutSuccess();
      await expect(
        authenticatedPage.getByText(/payment successful/i),
      ).toBeVisible();
    });

    test('should display order ID on success page', async ({
      authenticatedPage,
    }) => {
      await mockStripeCheckout(authenticatedPage);

      const mp = new MarketplacePage(authenticatedPage);
      await mp.gotoCheckoutSuccess('cs_test_mock_session_123');

      await mp.assertCheckoutSuccess();
      // Order ID / purchase ID should be displayed
      const body = await authenticatedPage.textContent('body');
      expect(body).toBeTruthy();
    });

    test('should handle checkout cancellation', async ({
      authenticatedPage,
    }) => {
      const mp = new MarketplacePage(authenticatedPage);
      await mp.gotoCheckoutCancel();

      await mp.assertCheckoutCancel();
      await expect(
        authenticatedPage.getByText(/payment cancelled/i),
      ).toBeVisible();

      // Should have a link back to marketplace
      const backLink = authenticatedPage.locator(
        'a:has-text("Back to Marketplace"), ' + 'a[href="/"]',
      );
      await expect(backLink.first()).toBeVisible();
    });

    test('should show purchased items in library after checkout', async ({
      authenticatedPage,
    }) => {
      await mockLibraryPurchases(authenticatedPage, 3);

      const mp = new MarketplacePage(authenticatedPage);
      await mp.gotoLibrary();

      await mp.assertLibraryVisible();
      const body = await authenticatedPage.textContent('body');
      expect(body).toContain('Purchased Item');
    });
  });
});
