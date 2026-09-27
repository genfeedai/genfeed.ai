import {
  mockActiveSubscription,
  mockAdsResearchResults,
  mockAnalyticsData,
  mockDiscoveryDeskFollowingFeed,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import {
  assertNoErrorBoundaryFallback,
  assertRouteRenders,
} from '../../utils/route-assertions';

/**
 * Deep interaction E2E coverage for the Discovery surface.
 *
 * Exercises the Signal Desk (`/discovery/overview`: search, refresh, source
 * tabs) and the Ads page (`/discovery/ads`: search, refresh, platform tabs).
 *
 * Every navigated route goes through `assertRouteRenders`, which fails on an
 * HTTP error status, a framework error overlay, an application ErrorBoundary
 * fallback, or a blank body — so a retired route with no page can no longer
 * pass by accident. Interactions require their controls to be visible (no
 * best-effort `tryClick`/`assertHealthy` skipping) and assert an observable
 * result: URL/query state, the clicked tab's `data-state`, or which mocked
 * rows are actually visible.
 *
 * #4317 (closes #4299) hard-retired /discovery/socials, /discovery/following,
 * /discovery/discovery, /discovery/[platform], and
 * /discovery/ads/{google,meta,tiktok,x} with no redirects — the interactions
 * that only exercised those routes were deleted rather than rewritten; the
 * Desk source-tab test below covers the same "switch between sources /
 * platforms" intent against the routes that replaced them.
 *
 * Functional tab interactions use ordinary pointer clicks (#5400 fixed
 * SectionTopbar so the Desk's tab row wraps instead of collapsing to 0px
 * under the workspace-inspector rail at 1280px). Keyboard operability of
 * the same tabs is covered separately below by a dedicated,
 * explicitly-named accessibility test.
 */

const BASE = '/test-org/brand-1/discovery';

test.describe('Discovery — deep interactions', () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockAnalyticsData(authenticatedPage);
  });

  test('Desk renders, search filters visible rows, and refresh re-fetches', async ({
    authenticatedPage,
  }) => {
    await mockDiscoveryDeskFollowingFeed(authenticatedPage);

    await assertRouteRenders(authenticatedPage, `${BASE}/overview`);

    await expect(
      authenticatedPage.getByText('Workflow demo clip'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('Creator collab teaser'),
    ).toBeVisible();

    const search = authenticatedPage.getByPlaceholder('Search the Desk');
    await expect(search).toBeVisible();
    await search.fill('workflow');

    await expect(
      authenticatedPage.getByText('Workflow demo clip'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('Creator collab teaser'),
    ).toBeHidden();

    await search.fill('');
    await expect(
      authenticatedPage.getByText('Creator collab teaser'),
    ).toBeVisible();

    const refreshButton = authenticatedPage.getByRole('button', {
      name: 'Refresh',
    });
    await expect(refreshButton).toBeVisible();
    const refetched = authenticatedPage.waitForResponse(
      (response) =>
        response.url().includes('/trends/content') &&
        response.request().method() === 'GET',
    );
    await refreshButton.click();
    await refetched;

    await assertNoErrorBoundaryFallback(authenticatedPage, `${BASE}/overview`);
  });

  test('Desk source tabs filter visible rows and update the URL', async ({
    authenticatedPage,
  }) => {
    await mockDiscoveryDeskFollowingFeed(authenticatedPage);

    await assertRouteRenders(authenticatedPage, `${BASE}/overview`);

    await expect(
      authenticatedPage.getByText('Workflow demo clip'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('Creator collab teaser'),
    ).toBeVisible();

    const trendsTab = authenticatedPage.getByRole('tab', {
      name: 'Public trends',
    });
    await trendsTab.click();
    await expect(trendsTab).toHaveAttribute('data-state', 'active');
    await expect(authenticatedPage).toHaveURL(/source=trends/);
    await expect(
      authenticatedPage.getByText('Workflow demo clip'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('Creator collab teaser'),
    ).toBeHidden();

    const ownedTab = authenticatedPage.getByRole('tab', {
      name: 'My accounts',
    });
    await ownedTab.click();
    await expect(ownedTab).toHaveAttribute('data-state', 'active');
    await expect(authenticatedPage).toHaveURL(/source=owned/);
    await expect(
      authenticatedPage.getByText('Workflow demo clip'),
    ).toBeHidden();
    await expect(
      authenticatedPage.getByText('Creator collab teaser'),
    ).toBeHidden();
    await expect(
      authenticatedPage.getByRole('heading', { name: 'No saved posts yet' }),
    ).toBeVisible();

    const allTab = authenticatedPage.getByRole('tab', { name: 'All' });
    await allTab.click();
    await expect(allTab).toHaveAttribute('data-state', 'active');
    await expect(
      authenticatedPage.getByText('Workflow demo clip'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('Creator collab teaser'),
    ).toBeVisible();

    await assertNoErrorBoundaryFallback(authenticatedPage, `${BASE}/overview`);
  });

  test('accessibility: Desk source tabs are keyboard operable', async ({
    authenticatedPage,
  }) => {
    await mockDiscoveryDeskFollowingFeed(authenticatedPage);

    await assertRouteRenders(authenticatedPage, `${BASE}/overview`);

    // WAI-ARIA tab pattern: a role="tab" button must be operable by
    // keyboard, not only by pointer. This is a dedicated accessibility
    // check, kept separate from the functional coverage above (which now
    // uses ordinary pointer clicks after #5400 fixed the header so the
    // tabs no longer collapse under the workspace-inspector rail).
    const trendsTab = authenticatedPage.getByRole('tab', {
      name: 'Public trends',
    });
    await trendsTab.focus();
    await trendsTab.press('Enter');
    await expect(trendsTab).toHaveAttribute('data-state', 'active');
    await expect(authenticatedPage).toHaveURL(/source=trends/);

    const allTab = authenticatedPage.getByRole('tab', { name: 'All' });
    await allTab.focus();
    await allTab.press('Enter');
    await expect(allTab).toHaveAttribute('data-state', 'active');
  });

  test('Ads page renders, refresh re-fetches, and platform tabs switch with observable state', async ({
    authenticatedPage,
  }) => {
    await mockAdsResearchResults(authenticatedPage);

    await assertRouteRenders(authenticatedPage, `${BASE}/ads`);

    // Both seeded ads (one Meta, one Google) render on the default "all"
    // platform filter.
    await expect(
      authenticatedPage.getByRole('heading', {
        name: 'Meta Winter Sale Carousel',
      }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('heading', {
        name: 'Google Search Bundle Deal',
      }),
    ).toBeVisible();

    const search = authenticatedPage.getByPlaceholder('Search ads');
    await expect(search).toBeVisible();
    await search.fill('winter');

    // Search is client-side over the fetched ads (title/headline/body/
    // accountName) — it must narrow to the matching ad only.
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
    await search.fill('');

    const refreshButton = authenticatedPage.getByRole('button', {
      name: 'Refresh',
    });
    await expect(refreshButton).toBeVisible();
    const refetched = authenticatedPage.waitForResponse(
      (response) =>
        response.url().includes('/ads/research') &&
        response.request().method() === 'GET',
    );
    await refreshButton.click();
    await refetched;

    const googleTab = authenticatedPage.getByRole('tab', {
      name: 'Google + YouTube',
    });
    await googleTab.click();
    await expect(googleTab).toHaveAttribute('data-state', 'active');
    await expect(authenticatedPage).toHaveURL(/platform=google/);
    // The platform filter is server-side (`filters.platform` on
    // `service.list()`) — the mock must honor it, so only the Google ad
    // should remain.
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

    const metaTab = authenticatedPage.getByRole('tab', { name: 'Meta' });
    await metaTab.click();
    await expect(metaTab).toHaveAttribute('data-state', 'active');
    await expect(googleTab).toHaveAttribute('data-state', 'inactive');
    await expect(authenticatedPage).toHaveURL(/platform=meta/);
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

    await assertNoErrorBoundaryFallback(authenticatedPage, `${BASE}/ads`);
  });

  test('bare Discovery path redirects to the overview Desk', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, BASE);

    await expect(authenticatedPage).not.toHaveURL(/login|sign-in/);
    await expect(authenticatedPage).toHaveURL(/discovery\/overview/);
  });

  test('browser back navigation between Discovery pages works', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BASE}/overview`);

    await assertRouteRenders(authenticatedPage, `${BASE}/ads`);
    await expect(authenticatedPage).toHaveURL(/discovery\/ads/);

    await authenticatedPage.goBack();
    await expect(authenticatedPage).toHaveURL(/discovery\/overview/);
    await assertNoErrorBoundaryFallback(authenticatedPage, `${BASE}/overview`);
  });
});
