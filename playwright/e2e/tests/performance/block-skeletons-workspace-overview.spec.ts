import { mockAnalyticsData } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import {
  expectBlockWithinShiftBudget,
  expectTileLabelsVisible,
  holdRequests,
  measureBlock,
} from '../../utils/block-skeleton-helpers';

const ROUTE = '/test-org/brand-1/workspace/overview';

// The home activity block asks for exactly five rows of the brand's activity.
function isHomeActivityRead(url: URL): boolean {
  return (
    url.pathname.endsWith('/activities') &&
    url.searchParams.get('limit') === '5' &&
    url.searchParams.has('brandId')
  );
}

// A block's height follows its data, so the shift budget is measured against a
// block with as many rows as the skeleton reserves (five).
function recentActivities() {
  const keys = [
    'video-generated',
    'image-generated',
    'video-generated',
    'image-generated',
    'video-generated',
  ];
  return {
    data: keys.map((key, index) => ({
      attributes: {
        createdAt: new Date(Date.now() - index * 3_600_000).toISOString(),
        isRead: index > 0,
        key,
        source: key.replace('-generated', '-generate'),
        value: '',
      },
      id: `e2e-activity-${index}`,
      type: 'activities',
    })),
    meta: { page: 1, pageSize: keys.length, totalCount: keys.length },
  };
}

test.describe('Workspace overview — block skeletons', () => {
  test.setTimeout(90_000);

  test('shows titles and tile labels at once and fills each block on its own', async ({
    authenticatedPage: page,
  }) => {
    await mockAnalyticsData(page);
    await page.route(
      (url) => isHomeActivityRead(url),
      (route) =>
        route.fulfill({
          body: JSON.stringify(recentActivities()),
          contentType: 'application/json',
          status: 200,
        }),
    );
    const held = await holdRequests(page, (url) => isHomeActivityRead(url));

    await page.goto(ROUTE, { waitUntil: 'domcontentloaded' });
    await held.whenHeld;

    const activity = page.getByTestId('operational-home-activity');
    await expect(
      activity.getByRole('heading', { name: 'Recent activity' }),
    ).toBeVisible();
    await expectTileLabelsVisible(page, ['Ready to review', 'Failed today']);
    await expect(
      activity.locator('[data-slot="skeleton"]').first(),
    ).toBeVisible();

    const whileLoading = await measureBlock(activity);
    held.release();
    await expect(activity.locator('[data-slot="skeleton"]')).toHaveCount(0);
    await expectBlockWithinShiftBudget(
      whileLoading,
      await measureBlock(activity),
    );
  });
});
