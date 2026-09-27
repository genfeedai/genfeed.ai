import {
  mockActiveSubscription,
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
    // The Desk's crowded header (search + source tabs + view toggle +
    // sources menu + refresh, all in one row) can lay the tab out under the
    // fixed workspace-inspector rail at this viewport width, which fails a
    // pointer click's hit-test even though the tab itself is visible and
    // enabled. Activate it by keyboard instead — a `role="tab"` button must
    // support this per the WAI-ARIA tab pattern, and it exercises the same
    // `onTabChange` handler as a click.
    await trendsTab.focus();
    await trendsTab.press('Enter');
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
    await ownedTab.focus();
    await ownedTab.press('Enter');
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
    await allTab.focus();
    await allTab.press('Enter');
    await expect(allTab).toHaveAttribute('data-state', 'active');
    await expect(
      authenticatedPage.getByText('Workflow demo clip'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('Creator collab teaser'),
    ).toBeVisible();

    await assertNoErrorBoundaryFallback(authenticatedPage, `${BASE}/overview`);
  });

  test('Ads page renders, refresh re-fetches, and platform tabs switch with observable state', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BASE}/ads`);

    const search = authenticatedPage.getByPlaceholder('Search ads');
    await expect(search).toBeVisible();
    await search.fill('niche');

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

    // Keyboard-activate rather than click: the header's tab row can lay
    // out under another header control at this viewport width right after
    // the refresh spinner swaps back to an icon, which fails a pointer
    // click's hit-test even though the tab is visible and enabled (see the
    // Desk source-tabs test above for the same reasoning).
    const googleTab = authenticatedPage.getByRole('tab', {
      name: 'Google + YouTube',
    });
    await googleTab.focus();
    await googleTab.press('Enter');
    await expect(googleTab).toHaveAttribute('data-state', 'active');
    await expect(authenticatedPage).toHaveURL(/platform=google/);

    const metaTab = authenticatedPage.getByRole('tab', { name: 'Meta' });
    await metaTab.focus();
    await metaTab.press('Enter');
    await expect(metaTab).toHaveAttribute('data-state', 'active');
    await expect(googleTab).toHaveAttribute('data-state', 'inactive');
    await expect(authenticatedPage).toHaveURL(/platform=meta/);

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
