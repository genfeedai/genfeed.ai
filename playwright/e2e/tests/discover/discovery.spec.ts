import { APP_ROUTES } from '@genfeedai/constants';
import {
  mockActiveSubscription,
  mockAnalyticsData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { DiscoverPage } from '../../pages/discover.page';

/**
 * E2E Tests for Discover Section
 *
 * Tests verify /discover (redirects to /discover/overview),
 * /discover/overview, /discover/socials, /discover/ads,
 * /discover/ads/google, and /discover/ads/meta pages.
 * All API calls are mocked - no real backend requests occur.
 */
test.describe('Discover Section', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockAnalyticsData(authenticatedPage);
  });

  test.describe('Overview Page', () => {
    test('should redirect /discover to /discover/overview', async ({
      authenticatedPage,
    }) => {
      const discoverPage = new DiscoverPage(authenticatedPage);

      await discoverPage.goto(APP_ROUTES.DISCOVER.ROOT);
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveURL(/discover\/overview/);
    });

    test('should display /discover/overview with main content', async ({
      authenticatedPage,
    }) => {
      const discoverPage = new DiscoverPage(authenticatedPage);

      await discoverPage.gotoSection('overview');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveURL(/discover\/overview/);
      await expect(discoverPage.mainContent).toBeVisible();
    });

    test('should have proper page title for overview', async ({
      authenticatedPage,
    }) => {
      const discoverPage = new DiscoverPage(authenticatedPage);

      await discoverPage.gotoSection('overview');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveTitle(/Discover|Genfeed/i);
    });

    test('should display sidebar on overview page', async ({
      authenticatedPage,
    }) => {
      const discoverPage = new DiscoverPage(authenticatedPage);

      await discoverPage.gotoSection('overview');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(discoverPage.sidebar).toBeVisible();
    });
  });

  test.describe('Socials Page', () => {
    test('should display /discover/socials with main content', async ({
      authenticatedPage,
    }) => {
      const discoverPage = new DiscoverPage(authenticatedPage);

      await discoverPage.gotoSection('socials');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveURL(/discover\/socials/);
      await expect(discoverPage.mainContent).toBeVisible();
      await expect(
        authenticatedPage.getByRole('tab', { name: 'Overview' }),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByText('Total Posts', { exact: true }),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByRole('heading', { name: 'Viral Videos' }),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByRole('heading', {
          name: 'Trending Content Feed',
        }),
      ).toBeVisible();
    });

    test('should have proper page title for socials', async ({
      authenticatedPage,
    }) => {
      const discoverPage = new DiscoverPage(authenticatedPage);

      await discoverPage.gotoSection('socials');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveTitle(/Social|Research|Genfeed/i);
    });
  });

  test.describe('Discover Ads Pages', () => {
    test('should display /discover/ads with main content', async ({
      authenticatedPage,
    }) => {
      const discoverPage = new DiscoverPage(authenticatedPage);

      await discoverPage.gotoSection('ads');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveURL(/discover\/ads/);
      await expect(discoverPage.mainContent).toBeVisible();
      await expect(
        authenticatedPage.getByRole('tab', { name: 'Overview' }),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByText('Public Winners', { exact: true }),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByRole('heading', {
          name: 'Public Niche Winners',
        }),
      ).toBeVisible();
    });

    test('should have proper page title for ads', async ({
      authenticatedPage,
    }) => {
      const discoverPage = new DiscoverPage(authenticatedPage);

      await discoverPage.gotoSection('ads');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveTitle(
        /Ads|Intelligence|Research|Genfeed/i,
      );
    });

    test('should display /discover/ads/google with main content', async ({
      authenticatedPage,
    }) => {
      const discoverPage = new DiscoverPage(authenticatedPage);

      await discoverPage.gotoSection('ads/google');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveURL(/discover\/ads\/google/);
      await expect(discoverPage.mainContent).toBeVisible();
    });

    test('should have proper page title for Google ads', async ({
      authenticatedPage,
    }) => {
      const discoverPage = new DiscoverPage(authenticatedPage);

      await discoverPage.gotoSection('ads/google');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveTitle(
        /Google|Ads|Research|Genfeed/i,
      );
    });

    test('should display /discover/ads/meta with main content', async ({
      authenticatedPage,
    }) => {
      const discoverPage = new DiscoverPage(authenticatedPage);

      await discoverPage.gotoSection('ads/meta');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveURL(/discover\/ads\/meta/);
      await expect(discoverPage.mainContent).toBeVisible();
    });

    test('should have proper page title for Meta ads', async ({
      authenticatedPage,
    }) => {
      const discoverPage = new DiscoverPage(authenticatedPage);

      await discoverPage.gotoSection('ads/meta');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveTitle(/Meta|Ads|Research|Genfeed/i);
    });
  });

  test.describe('Navigation', () => {
    test('should maintain state after page refresh on discovery', async ({
      authenticatedPage,
    }) => {
      const discoverPage = new DiscoverPage(authenticatedPage);

      await discoverPage.gotoSection('discovery');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await authenticatedPage.reload();
      await discoverPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/discover\/discovery/);
      await expect(discoverPage.mainContent).toBeVisible();
    });

    test('should handle browser back from ads to discovery', async ({
      authenticatedPage,
    }) => {
      const discoverPage = new DiscoverPage(authenticatedPage);

      await discoverPage.gotoSection('discovery');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await discoverPage.gotoSection('ads');
      await expect(authenticatedPage).toHaveURL(/discover\/ads/);

      await authenticatedPage.goBack();
      await expect(authenticatedPage).toHaveURL(/discover\/discovery/);
    });

    test('should display a platform discover page with content feed', async ({
      authenticatedPage,
    }) => {
      const discoverPage = new DiscoverPage(authenticatedPage);

      await discoverPage.goto(`${APP_ROUTES.DISCOVER.ROOT}/twitter`);
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveURL(/discover\/twitter/);
      await expect(discoverPage.mainContent).toBeVisible();
      await expect(
        authenticatedPage.getByRole('tab', { name: 'X' }),
      ).toBeVisible();
    });
  });
});

test.describe('Discover — Unauthenticated Access', () => {
  test('should redirect unauthenticated user from /discover to login', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto(APP_ROUTES.DISCOVER.ROOT);
    await unauthenticatedPage.waitForLoadState('domcontentloaded');

    await expect(unauthenticatedPage).toHaveURL(/login|sign-in/, {
      timeout: 10000,
    });
  });

  test('should redirect unauthenticated user from /discover/overview to login', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto(APP_ROUTES.DISCOVER.OVERVIEW);
    await unauthenticatedPage.waitForLoadState('domcontentloaded');

    await expect(unauthenticatedPage).toHaveURL(/login|sign-in/, {
      timeout: 10000,
    });
  });

  test('should redirect unauthenticated user from /discover/ads to login', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto(APP_ROUTES.DISCOVER.ADS);
    await unauthenticatedPage.waitForLoadState('domcontentloaded');

    await expect(unauthenticatedPage).toHaveURL(/login|sign-in/, {
      timeout: 10000,
    });
  });
});
