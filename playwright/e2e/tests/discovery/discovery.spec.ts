import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  mockActiveSubscription,
  mockAnalyticsData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { DiscoveryPage } from '../../pages/discovery.page';

/**
 * E2E tests for the Discovery section.
 *
 * Tests verify /discovery (redirects to /discovery/overview),
 * /discovery/overview, /discovery/socials, /discovery/ads,
 * /discovery/ads/google, and /discovery/ads/meta pages.
 * All API calls are mocked - no real backend requests occur.
 */
test.describe('Discovery section', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockAnalyticsData(authenticatedPage);
  });

  test.describe('Overview Page', () => {
    test('should redirect /discovery to /discovery/overview', async ({
      authenticatedPage,
    }) => {
      const discoveryPage = new DiscoveryPage(authenticatedPage);

      await discoveryPage.goto(APP_ROUTES.DISCOVERY.ROOT);
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveURL(/discovery\/overview/);
    });

    test('should display /discovery/overview with main content', async ({
      authenticatedPage,
    }) => {
      const discoveryPage = new DiscoveryPage(authenticatedPage);

      await discoveryPage.gotoSection('overview');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveURL(/discovery\/overview/);
      await expect(discoveryPage.mainContent).toBeVisible();
    });

    test('should have proper page title for overview', async ({
      authenticatedPage,
    }) => {
      const discoveryPage = new DiscoveryPage(authenticatedPage);

      await discoveryPage.gotoSection('overview');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveTitle(/Discovery|Genfeed/i);
    });

    test('should display sidebar on overview page', async ({
      authenticatedPage,
    }) => {
      const discoveryPage = new DiscoveryPage(authenticatedPage);

      await discoveryPage.gotoSection('overview');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(discoveryPage.sidebar).toBeVisible();
    });
  });

  test.describe('Socials Page', () => {
    test('should display /discovery/socials with main content', async ({
      authenticatedPage,
    }) => {
      const discoveryPage = new DiscoveryPage(authenticatedPage);

      await discoveryPage.gotoSection('socials');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveURL(/discovery\/socials/);
      await expect(discoveryPage.mainContent).toBeVisible();
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
      const discoveryPage = new DiscoveryPage(authenticatedPage);

      await discoveryPage.gotoSection('socials');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveTitle(/Social|Research|Genfeed/i);
    });
  });

  test.describe('Discovery ads pages', () => {
    test('should display /discovery/ads with main content', async ({
      authenticatedPage,
    }) => {
      const discoveryPage = new DiscoveryPage(authenticatedPage);

      await discoveryPage.gotoSection('ads');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveURL(/discovery\/ads/);
      await expect(discoveryPage.mainContent).toBeVisible();
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
      const discoveryPage = new DiscoveryPage(authenticatedPage);

      await discoveryPage.gotoSection('ads');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveTitle(
        /Ads|Intelligence|Research|Genfeed/i,
      );
    });

    test('should display /discovery/ads/google with main content', async ({
      authenticatedPage,
    }) => {
      const discoveryPage = new DiscoveryPage(authenticatedPage);

      await discoveryPage.gotoSection('ads/google');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveURL(/discovery\/ads\/google/);
      await expect(discoveryPage.mainContent).toBeVisible();
    });

    test('should have proper page title for Google ads', async ({
      authenticatedPage,
    }) => {
      const discoveryPage = new DiscoveryPage(authenticatedPage);

      await discoveryPage.gotoSection('ads/google');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveTitle(
        /Google|Ads|Research|Genfeed/i,
      );
    });

    test('should display /discovery/ads/meta with main content', async ({
      authenticatedPage,
    }) => {
      const discoveryPage = new DiscoveryPage(authenticatedPage);

      await discoveryPage.gotoSection('ads/meta');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveURL(/discovery\/ads\/meta/);
      await expect(discoveryPage.mainContent).toBeVisible();
    });

    test('should have proper page title for Meta ads', async ({
      authenticatedPage,
    }) => {
      const discoveryPage = new DiscoveryPage(authenticatedPage);

      await discoveryPage.gotoSection('ads/meta');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveTitle(/Meta|Ads|Research|Genfeed/i);
    });
  });

  test.describe('Navigation', () => {
    test('should maintain state after page refresh on discovery', async ({
      authenticatedPage,
    }) => {
      const discoveryPage = new DiscoveryPage(authenticatedPage);

      await discoveryPage.gotoSection('discovery');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await authenticatedPage.reload();
      await discoveryPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/discovery\/discovery/);
      await expect(discoveryPage.mainContent).toBeVisible();
    });

    test('should handle browser back from ads to discovery', async ({
      authenticatedPage,
    }) => {
      const discoveryPage = new DiscoveryPage(authenticatedPage);

      await discoveryPage.gotoSection('discovery');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await discoveryPage.gotoSection('ads');
      await expect(authenticatedPage).toHaveURL(/discovery\/ads/);

      await authenticatedPage.goBack();
      await expect(authenticatedPage).toHaveURL(/discovery\/discovery/);
    });

    test('should display a Discovery platform page with content feed', async ({
      authenticatedPage,
    }) => {
      const discoveryPage = new DiscoveryPage(authenticatedPage);

      await discoveryPage.goto(`${APP_ROUTES.DISCOVERY.ROOT}/twitter`);
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveURL(/discovery\/twitter/);
      await expect(discoveryPage.mainContent).toBeVisible();
      await expect(
        authenticatedPage.getByRole('tab', { name: 'X' }),
      ).toBeVisible();
    });
  });
});

test.describe('Discovery — unauthenticated access', () => {
  test('should redirect unauthenticated user from /discovery to login', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto(APP_ROUTES.DISCOVERY.ROOT);
    await unauthenticatedPage.waitForLoadState('domcontentloaded');

    await expect(unauthenticatedPage).toHaveURL(/login|sign-in/, {
      timeout: 10000,
    });
  });

  test('should redirect unauthenticated user from /discovery/overview to login', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto(APP_ROUTES.DISCOVERY.OVERVIEW);
    await unauthenticatedPage.waitForLoadState('domcontentloaded');

    await expect(unauthenticatedPage).toHaveURL(/login|sign-in/, {
      timeout: 10000,
    });
  });

  test('should redirect unauthenticated user from /discovery/ads to login', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto(APP_ROUTES.DISCOVERY.ADS);
    await unauthenticatedPage.waitForLoadState('domcontentloaded');

    await expect(unauthenticatedPage).toHaveURL(/login|sign-in/, {
      timeout: 10000,
    });
  });
});
