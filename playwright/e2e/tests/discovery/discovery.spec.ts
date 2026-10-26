import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Page } from '@playwright/test';
import {
  mockActiveSubscription,
  mockAdsResearchResults,
  mockAnalyticsData,
  mockDiscoveryDeskFollowingFeed,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { DiscoveryPage } from '../../pages/discovery.page';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

/** Picks one platform in the Platform facet of the shared Filters menu. */
async function chooseAdsPlatform(page: Page, name: RegExp): Promise<void> {
  await page.getByRole('button', { name: /^Filters/ }).click();
  await page.getByRole('menuitem', { name: /^Platform/ }).click();
  await page.getByRole('menuitemradio', { name }).click();
}

/**
 * E2E tests for the Discovery section.
 *
 * Tests verify /discovery (redirects to /discovery/overview),
 * /discovery/overview (the Signal Desk), and /discovery/ads, including its
 * per-platform tab filter. All API calls are mocked - no real backend
 * requests occur.
 *
 * /discovery/socials, /discovery/following, /discovery/discovery,
 * /discovery/[platform], and /discovery/ads/{google,meta,tiktok,x} were
 * retired with no redirects by #4317 (closes #4299) — the Following filter,
 * per-platform pages, and Socials sub-page were folded into the Desk and the
 * Ads platform tabs. Their coverage lives in the tests below against the
 * current routes; do not re-add tests against the retired paths.
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
      await assertNoErrorBoundaryFallback(
        authenticatedPage,
        APP_ROUTES.DISCOVERY.OVERVIEW,
      );
    });

    test('should display /discovery/overview with main content', async ({
      authenticatedPage,
    }) => {
      const discoveryPage = new DiscoveryPage(authenticatedPage);

      await discoveryPage.gotoSection('overview');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await expect(authenticatedPage).toHaveURL(/discovery\/overview/);
      await assertNoErrorBoundaryFallback(
        authenticatedPage,
        APP_ROUTES.DISCOVERY.OVERVIEW,
      );
      await expect(discoveryPage.mainContent).toBeVisible();
    });

    test('should have proper page title for overview', async ({
      authenticatedPage,
    }) => {
      const discoveryPage = new DiscoveryPage(authenticatedPage);

      await discoveryPage.gotoSection('overview');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);
      await assertNoErrorBoundaryFallback(
        authenticatedPage,
        APP_ROUTES.DISCOVERY.OVERVIEW,
      );

      await expect(authenticatedPage).toHaveTitle(/Discovery|Genfeed/i);
    });

    test('should display sidebar on overview page', async ({
      authenticatedPage,
    }) => {
      const discoveryPage = new DiscoveryPage(authenticatedPage);

      await discoveryPage.gotoSection('overview');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);
      await assertNoErrorBoundaryFallback(
        authenticatedPage,
        APP_ROUTES.DISCOVERY.OVERVIEW,
      );

      await expect(discoveryPage.sidebar).toBeVisible();
    });
  });

  test.describe('Discovery ads pages', () => {
    test('should display /discovery/ads with main content', async ({
      authenticatedPage,
    }) => {
      const discoveryPage = new DiscoveryPage(authenticatedPage);

      await discoveryPage.gotoSection('ads');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);
      await assertNoErrorBoundaryFallback(
        authenticatedPage,
        APP_ROUTES.DISCOVERY.ADS,
      );

      await expect(authenticatedPage).toHaveURL(/discovery\/ads/);
      await expect(discoveryPage.mainContent).toBeVisible();
      await expect(
        authenticatedPage.getByRole('button', { name: /^Filters/ }),
      ).toBeVisible();
      // "Public Winners" / "Public Niche Winners" were the pre-#4317 copy.
      // The public-ads panel now opens with this heading (see
      // AdsPublicDiscoveryPanel.tsx, translate('pages.adsResearch.discovery.title')).
      await expect(
        authenticatedPage.getByRole('heading', {
          name: 'Browse saved competitor ads',
        }),
      ).toBeVisible();
    });

    test('should have proper page title for ads', async ({
      authenticatedPage,
    }) => {
      const discoveryPage = new DiscoveryPage(authenticatedPage);

      await discoveryPage.gotoSection('ads');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);
      await assertNoErrorBoundaryFallback(
        authenticatedPage,
        APP_ROUTES.DISCOVERY.ADS,
      );

      await expect(authenticatedPage).toHaveTitle(
        /Ads|Intelligence|Research|Genfeed/i,
      );
    });

    // #4317 collapsed the /discovery/ads/{google,meta,tiktok,x} sub-pages
    // into a platform query filter (?platform=) on this one page, now a facet
    // of the Filters menu — the per-platform capability was redesigned, not
    // removed, so it is covered here against the current menu instead of the
    // retired routes.
    test('should switch to the Google + YouTube ads platform', async ({
      authenticatedPage,
    }) => {
      await mockAdsResearchResults(authenticatedPage);
      const discoveryPage = new DiscoveryPage(authenticatedPage);

      await discoveryPage.gotoSection('ads');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);
      await assertNoErrorBoundaryFallback(
        authenticatedPage,
        APP_ROUTES.DISCOVERY.ADS,
      );

      await chooseAdsPlatform(authenticatedPage, /^Google \+ YouTube/);

      await expect(authenticatedPage).toHaveURL(/platform=google/);
      await expect(discoveryPage.mainContent).toBeVisible();
      // The platform filter is server-side — only the Google ad renders.
      await expect(
        authenticatedPage.getByRole('heading', {
          name: 'Google Search Bundle Deal',
        }),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByRole('heading', {
          name: 'Meta Winter Sale Carousel',
        }),
      ).toBeHidden();
    });

    test('should switch to the Meta ads platform', async ({
      authenticatedPage,
    }) => {
      await mockAdsResearchResults(authenticatedPage);
      const discoveryPage = new DiscoveryPage(authenticatedPage);

      await discoveryPage.gotoSection('ads');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);
      await assertNoErrorBoundaryFallback(
        authenticatedPage,
        APP_ROUTES.DISCOVERY.ADS,
      );

      await chooseAdsPlatform(authenticatedPage, /^Meta/);

      await expect(authenticatedPage).toHaveURL(/platform=meta/);
      await expect(discoveryPage.mainContent).toBeVisible();
      await expect(
        authenticatedPage.getByRole('heading', {
          name: 'Meta Winter Sale Carousel',
        }),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByRole('heading', {
          name: 'Google Search Bundle Deal',
        }),
      ).toBeHidden();
    });
  });

  test.describe('Navigation', () => {
    test('should maintain state after page refresh on discovery overview', async ({
      authenticatedPage,
    }) => {
      const discoveryPage = new DiscoveryPage(authenticatedPage);

      // Seed one 'trends' row ("Workflow demo clip", the default
      // /trends/content mock) and one 'following' row ("Creator collab
      // teaser") so the source filter has an observable effect on the
      // rendered rows, not just the URL — a reload that ignored the filter
      // would still keep `source=trends` in the URL but would show both.
      await mockDiscoveryDeskFollowingFeed(authenticatedPage);

      await discoveryPage.gotoSection('overview');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);
      await assertNoErrorBoundaryFallback(
        authenticatedPage,
        APP_ROUTES.DISCOVERY.OVERVIEW,
      );

      // The Desk's source filter is URL-backed (`?source=`) — select a
      // non-default source in the Filters menu so refresh has real state to
      // preserve.
      await authenticatedPage.getByRole('button', { name: /^Filters/ }).click();
      await authenticatedPage
        .getByRole('menuitem', { name: /^Source/ })
        .click();
      await authenticatedPage
        .getByRole('menuitemradio', { name: /^Public trends/ })
        .click();
      await expect(authenticatedPage).toHaveURL(/source=trends/);
      await expect(
        authenticatedPage.getByText('Workflow demo clip'),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByText('Creator collab teaser'),
      ).toBeHidden();

      await authenticatedPage.reload();
      await discoveryPage.waitForPageLoad();
      await assertNoErrorBoundaryFallback(
        authenticatedPage,
        APP_ROUTES.DISCOVERY.OVERVIEW,
      );

      await expect(authenticatedPage).toHaveURL(/discovery\/overview/);
      await expect(authenticatedPage).toHaveURL(/source=trends/);
      await expect(discoveryPage.mainContent).toBeVisible();

      // The active source and the row filtering it drives must both survive
      // the reload — not only the URL param.
      await expect(
        authenticatedPage.getByRole('button', { name: /^Filters/ }),
      ).toContainText('1');
      await expect(
        authenticatedPage.getByText('Workflow demo clip'),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByText('Creator collab teaser'),
      ).toBeHidden();
    });

    test('should handle browser back from ads to discovery overview', async ({
      authenticatedPage,
    }) => {
      const discoveryPage = new DiscoveryPage(authenticatedPage);

      await discoveryPage.gotoSection('overview');
      await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);

      await discoveryPage.gotoSection('ads');
      await expect(authenticatedPage).toHaveURL(/discovery\/ads/);

      await authenticatedPage.goBack();
      await expect(authenticatedPage).toHaveURL(/discovery\/overview/);
      await assertNoErrorBoundaryFallback(
        authenticatedPage,
        APP_ROUTES.DISCOVERY.OVERVIEW,
      );
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
    await assertNoErrorBoundaryFallback(unauthenticatedPage, '/login');
  });

  test('should redirect unauthenticated user from /discovery/overview to login', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto(APP_ROUTES.DISCOVERY.OVERVIEW);
    await unauthenticatedPage.waitForLoadState('domcontentloaded');

    await expect(unauthenticatedPage).toHaveURL(/login|sign-in/, {
      timeout: 10000,
    });
    await assertNoErrorBoundaryFallback(unauthenticatedPage, '/login');
  });

  test('should redirect unauthenticated user from /discovery/ads to login', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto(APP_ROUTES.DISCOVERY.ADS);
    await unauthenticatedPage.waitForLoadState('domcontentloaded');

    await expect(unauthenticatedPage).toHaveURL(/login|sign-in/, {
      timeout: 10000,
    });
    await assertNoErrorBoundaryFallback(unauthenticatedPage, '/login');
  });
});
