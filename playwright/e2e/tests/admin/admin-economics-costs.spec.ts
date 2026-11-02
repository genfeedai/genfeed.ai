import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { createPlaywrightMockApiRoutePattern } from '../../config/environment';
import { expect, test } from '../../fixtures/auth.fixture';

/**
 * Admin costs report: KPI tiles carry a value and a label only, and the
 * generation cost is averaged over generations that had a known price.
 */
test.describe('Admin economics costs', () => {
  test.setTimeout(90_000);

  test('shows cost per generation without explanatory sentences in the tiles', async ({
    adminPage: page,
  }) => {
    await page.route(
      createPlaywrightMockApiRoutePattern('admin/economics/costs(?:\\?.*)?$'),
      async (route) => {
        await route.fulfill({
          json: {
            data: {
              attributes: {
                daily: [],
                from: '2026-10-03',
                mediaCategories: [
                  {
                    category: 'IMAGE',
                    costPerGenerationUsd: 0.25,
                    costUsd: 0.5,
                    generations: 3,
                    pricedGenerations: 2,
                  },
                  {
                    category: 'VIDEO',
                    costPerGenerationUsd: null,
                    costUsd: 0,
                    generations: 1,
                    pricedGenerations: 0,
                  },
                ],
                models: [],
                to: '2026-11-02',
                totals: {
                  byokCalls: 3,
                  costPerGenerationUsd: 0.25,
                  llmCalls: 5,
                  llmCostUsd: 1.5,
                  mediaCostUsd: 0.5,
                  mediaGenerations: 4,
                  mediaPricedGenerations: 2,
                  providerCostUsd: 2,
                  unpricedCalls: 2,
                },
              },
              id: 'mock-economics-costs',
              type: 'economics-costs-report',
            },
          },
        });
      },
    );

    await page.goto(APP_ROUTES.ADMIN.ECONOMICS.COSTS, {
      waitUntil: 'domcontentloaded',
    });

    const tile = page
      .getByTestId('metric-card')
      .filter({ hasText: 'Cost per generation' });
    await expect(tile).toContainText('$0.25', { timeout: 60_000 });
    await expect(
      page.getByTestId('metric-card').filter({ hasText: 'Unpriced calls' }),
    ).toContainText('2');
    await expect(page.getByText(/BYOK calls are free/)).toHaveCount(0);
    await expect(page.getByRole('row', { name: /VIDEO/ })).toContainText('-');
  });
});
