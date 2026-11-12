import { expect, test } from '../../fixtures/auth.fixture';
import {
  expectBlockWithinShiftBudget,
  holdRequests,
  measureBlock,
} from '../../utils/block-skeleton-helpers';

const ROUTE = '/test-org/brand-1/analytics/overview';

// A block's height follows its data, so the shift budget is measured against a
// block with as many rows as the skeleton reserves (three).
function topAccountRows() {
  return ['instagram', 'tiktok', 'youtube'].map((platform) => ({
    coverage: 1,
    evaluation: null,
    freshnessHours: 2,
    identity: {
      brandId: 'brand-1',
      brandLabel: 'Brand 1',
      connectedAt: null,
      credentialId: `cred-${platform}`,
      externalAvatar: null,
      externalHandle: `@brand_${platform}`,
      externalId: null,
      externalName: null,
      firstPublishedAt: null,
      firstTrackedAt: null,
      isConnected: true,
      label: `Brand ${platform}`,
      manageHref: '/settings',
      platform,
    },
    metrics: [
      { availability: 'observed', change: 1200, metric: 'views', value: 5400 },
    ],
    publishedPosts: 12,
  }));
}

test.describe('Analytics overview — block skeletons', () => {
  test.setTimeout(90_000);

  test('shows titles and tile labels at once and fills each block on its own', async ({
    authenticatedPage: page,
  }) => {
    await page.route(
      (url) => url.pathname.endsWith('/brands/brand-1/analytics'),
      (route) =>
        route.fulfill({
          body: JSON.stringify({
            data: {
              attributes: {
                activePlatforms: ['instagram', 'tiktok'],
                avgEngagementRate: 3.2,
                totalCredentialsConnected: 2,
                totalEngagement: 640,
                totalPosts: 12,
                totalViews: 1200,
              },
              id: 'brand-1',
              type: 'analytics',
            },
          }),
          contentType: 'application/json',
          status: 200,
        }),
    );
    await page.route(
      (url) => url.pathname.endsWith('/accounts/top'),
      (route) =>
        route.fulfill({
          body: JSON.stringify({
            data: {
              attributes: { accounts: topAccountRows() },
              id: 'top',
              type: 'accounts',
            },
          }),
          contentType: 'application/json',
          status: 200,
        }),
    );
    const held = await holdRequests(page, (url) =>
      url.pathname.endsWith('/accounts/top'),
    );

    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await held.whenHeld;

    const topAccounts = page.getByTestId('analytics-top-accounts');
    await expect(
      topAccounts.getByRole('heading', { name: 'Top accounts' }),
    ).toBeVisible();
    await expect(
      topAccounts.locator('[data-slot="skeleton"]').first(),
    ).toBeVisible();

    // Metric tiles never wait on the held block.
    await expect(page.getByTestId('metric-card').first()).toBeVisible();

    const whileLoading = await measureBlock(topAccounts);
    held.release();
    await expect(topAccounts.locator('[data-slot="skeleton"]')).toHaveCount(0);
    await expectBlockWithinShiftBudget(
      whileLoading,
      await measureBlock(topAccounts),
    );
  });
});
