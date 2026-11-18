import { expect, test } from '../../fixtures/auth.fixture';
import {
  expectBlockWithinShiftBudget,
  expectTileLabelsVisible,
  holdRequests,
  measureBlock,
} from '../../utils/block-skeleton-helpers';

const ROUTE = '/test-org/brand-1/publishing/overview';

// A block's height follows its data, so the shift budget is measured against a
// block with as many rows as the skeleton reserves (three).
function accountHealthRows() {
  return ['instagram', 'tiktok', 'youtube'].map((platform) => ({
    credentialId: `cred-${platform}`,
    handle: `@brand_${platform}`,
    holdPublishing: false,
    label: `Brand ${platform}`,
    override: { isActive: false },
    platform,
    riskLevel: 'low',
    score: 82,
    signals: {
      connectedDays: 40,
      profileSignals: 3,
      publishedPosts: 12,
      recentFailures: 0,
    },
    state: 'healthy',
    thresholds: {
      maxRecentFailures: 2,
      minConnectedDays: 14,
      minProfileSignals: 2,
      minPublishedPosts: 5,
    },
  }));
}

test.describe('Publishing overview — block skeletons', () => {
  test.setTimeout(90_000);

  test('shows titles and tile labels at once and fills each block on its own', async ({
    authenticatedPage: page,
  }) => {
    await page.route(
      (url) => url.pathname.endsWith('/account-health'),
      (route) =>
        route.fulfill({
          body: JSON.stringify(accountHealthRows()),
          contentType: 'application/json',
          status: 200,
        }),
    );
    const held = await holdRequests(page, (url) =>
      url.pathname.endsWith('/account-health'),
    );

    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await held.whenHeld;

    const health = page.getByTestId('publishing-overview-health');
    await expect(
      health.getByRole('heading', { name: 'Account health' }),
    ).toBeVisible();
    await expectTileLabelsVisible(page, ['Ready to review', 'Published']);

    // The held block is a skeleton; the queue block has filled by itself.
    await expect(
      health.locator('[data-slot="skeleton"]').first(),
    ).toBeVisible();
    await expect(
      page
        .getByTestId('publishing-overview-next-24h')
        .locator('[data-slot="skeleton"]'),
    ).toHaveCount(0);

    const whileLoading = await measureBlock(health);
    held.release();
    await expect(health.locator('[data-slot="skeleton"]')).toHaveCount(0);
    await expectBlockWithinShiftBudget(
      whileLoading,
      await measureBlock(health),
    );
  });

  test('keeps metric tile labels on screen and the tile size when its value arrives', async ({
    authenticatedPage: page,
  }) => {
    const held = await holdRequests(page, (url) =>
      url.pathname.endsWith('/turbo-runs'),
    );

    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await held.whenHeld;

    const tile = page.getByTestId('metric-card').first();
    await expect(tile).toHaveAttribute('aria-busy', 'true');
    await expect(tile.getByText('Ready to review')).toBeVisible();
    const whileLoading = await measureBlock(tile);

    held.release();
    await expect(tile).not.toHaveAttribute('aria-busy', 'true');
    await expectBlockWithinShiftBudget(whileLoading, await measureBlock(tile));
  });
});
