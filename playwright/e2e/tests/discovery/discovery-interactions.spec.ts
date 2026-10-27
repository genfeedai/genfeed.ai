import {
  mockActiveSubscription,
  mockAdsResearchResults,
  mockAnalyticsData,
  mockDiscoveryDeskFollowingFeed,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { chooseFilterOption } from '../../utils/filter-menu';
import {
  assertNoErrorBoundaryFallback,
  assertRouteRenders,
} from '../../utils/route-assertions';

/**
 * Deep interaction E2E coverage for the Discovery surface.
 *
 * Exercises the Signal Desk (`/discovery/overview`: search, refresh, source
 * tabs) and the Ads page (`/discovery/ads`: search, refresh, platform filter).
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

  test('Desk Source filter narrows visible rows and updates the URL', async ({
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

    // The source tab strip lives in the one nested Filters menu.
    await expect(authenticatedPage.getByRole('tab')).toHaveCount(0);
    const chooseSource = async (name: RegExp) => {
      await chooseFilterOption(authenticatedPage, 'Source', name);
    };

    await chooseSource(/^Public trends/);
    await expect(authenticatedPage).toHaveURL(/source=trends/);
    await expect(
      authenticatedPage.getByText('Workflow demo clip'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('Creator collab teaser'),
    ).toBeHidden();

    await chooseSource(/^My accounts/);
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

    await chooseSource(/^All/);
    await expect(
      authenticatedPage.getByText('Workflow demo clip'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('Creator collab teaser'),
    ).toBeVisible();

    await assertNoErrorBoundaryFallback(authenticatedPage, `${BASE}/overview`);
  });

  test('accessibility: the Desk Source filter is keyboard operable', async ({
    authenticatedPage,
  }) => {
    await mockDiscoveryDeskFollowingFeed(authenticatedPage);

    await assertRouteRenders(authenticatedPage, `${BASE}/overview`);

    const filters = authenticatedPage.getByRole('button', { name: /^Filters/ });
    await filters.focus();
    await filters.press('Enter');
    const source = authenticatedPage.getByRole('menuitem', { name: /^Source/ });
    await source.focus();
    await source.press('ArrowRight');
    await authenticatedPage
      .getByRole('menuitemradio', { name: /^Public trends/ })
      .press('Enter');
    await expect(authenticatedPage).toHaveURL(/source=trends/);
  });

  test('Ads page renders, refresh re-fetches, and the platform filter switches with observable state', async ({
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

    // The platform strip lives in the one nested Filters menu.
    await expect(authenticatedPage.getByRole('tab')).toHaveCount(0);
    const choosePlatform = async (name: RegExp) => {
      await chooseFilterOption(authenticatedPage, 'Platform', name);
    };

    await choosePlatform(/^Google \+ YouTube/);
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

    await choosePlatform(/^Meta/);
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
