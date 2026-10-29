import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Route } from '@playwright/test';
import { createPlaywrightMockApiRoutePattern } from '../../config/environment';
import {
  mockActiveSubscription,
  mockAnalyticsData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { DashboardPage } from '../../pages/dashboard.page';
import { orgPath } from '../../utils/app-chrome';

/**
 * The optional "Connect an AI client" card at the top of the overview
 * (`ConnectionStatusLine` in `home/content.tsx`). It shows until a verified
 * MCP connection exists, can be dismissed, and stays dismissed across reloads.
 */

const API_KEYS = createPlaywrightMockApiRoutePattern('api-keys(?:[/?]|$)');
const CONNECT_HREF = orgPath(APP_ROUTES.CONNECT);

test.describe('Dashboard connect card', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockAnalyticsData(authenticatedPage);
    await authenticatedPage.route(API_KEYS, async (route: Route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }

      await route.fulfill({
        body: JSON.stringify({ data: [], meta: { totalCount: 0 } }),
        contentType: 'application/json',
        status: 200,
      });
    });
  });

  test('offers Connect Genfeed until it is dismissed, then stays hidden after a reload', async ({
    authenticatedPage,
  }) => {
    const dashboardPage = new DashboardPage(authenticatedPage);
    const card = authenticatedPage.getByTestId('operational-home-unconfigured');

    await dashboardPage.goto();

    await expect(card).toBeVisible();
    await expect(
      card.getByText('Connect Claude Code, Codex, or another AI client'),
    ).toBeVisible();
    await expect(
      card.getByRole('link', { name: 'Connect Genfeed' }),
    ).toHaveAttribute('href', CONNECT_HREF);

    await card.getByRole('button', { name: 'Dismiss connect card' }).click();
    await expect(card).toBeHidden();

    await authenticatedPage.reload({ waitUntil: 'domcontentloaded' });
    await expect(dashboardPage.statsSection).toBeVisible();
    await expect(card).toBeHidden();
  });
});
