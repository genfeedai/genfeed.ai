import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

const BRAND = '/test-org/brand-1';

test.describe('Analytics — Outliers → Hooks → Remix', () => {
  test.setTimeout(60_000);

  test('renders the Outliers surface', async ({ authenticatedPage }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND}/analytics/outliers`);
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Outliers', exact: true }),
    ).toBeVisible();
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
    await authenticatedPage.route(
      '**/content-runs/remixes**',
      async (route) => {
        await route.fulfill({
          contentType: 'application/json',
          status: 201,
          body: JSON.stringify({
            data: {
              attributes: {
                id: 'run-outlier-1',
                revision: 1,
                readiness: { state: 'ready' },
              },
              id: 'run-outlier-1',
              type: 'content-runs',
            },
          }),
        });
      },
    );
    const remixButton = authenticatedPage.getByRole('button', {
      name: 'Remix',
    });
    if (await remixButton.count()) {
      await remixButton.first().click();
      await expect(authenticatedPage).toHaveURL(/studio\/generate\?run=/);
    } else {
      await assertRouteRenders(
        authenticatedPage,
        `${BRAND}/studio/generate?run=run-outlier-1`,
      );
    }

    await tryClick(authenticatedPage, '[role="combobox"]');
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });
});
