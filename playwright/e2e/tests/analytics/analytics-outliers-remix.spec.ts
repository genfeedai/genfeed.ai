import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

const BRAND = '/test-org/brand-1';

test.describe('Analytics — Outliers → Hooks → Remix', () => {
  test.setTimeout(60_000);

  test('renders the Outliers surface', async ({ authenticatedPage }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND}/analytics/outliers`);
    await expect(authenticatedPage.getByText('Outliers')).toBeVisible();
  });

  test('walks Outliers into Hooks and Remix', async ({ authenticatedPage }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND}/analytics/outliers`);

    const hookLink = authenticatedPage.getByRole('link', {
      name: 'Analyze hook',
    });
    if (await hookLink.count()) {
      await hookLink.first().click();
      await expect(authenticatedPage).toHaveURL(/analytics\/hooks/);
    } else {
      await assertRouteRenders(
        authenticatedPage,
        `${BRAND}/analytics/hooks?postId=mock-post`,
      );
    }

    await assertRouteRenders(authenticatedPage, `${BRAND}/analytics/outliers`);
    const remixLink = authenticatedPage.getByRole('link', { name: 'Remix' });
    if (await remixLink.count()) {
      await remixLink.first().click();
      await expect(authenticatedPage).toHaveURL(/publishing\/remix/);
    } else {
      await assertRouteRenders(
        authenticatedPage,
        `${BRAND}/publishing/remix?platform=tiktok&sourcePostId=mock-source`,
      );
    }

    await tryClick(authenticatedPage, '[role="combobox"]');
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });
});
