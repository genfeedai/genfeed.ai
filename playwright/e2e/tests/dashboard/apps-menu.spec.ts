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
 * The topbar Apps menu (`TopbarAppsMenu`): the Desktop app, the MCP connector
 * and the CLI in one place. It replaces the Connect card the Overview used to
 * show until an agent had verified a connection (#11279).
 */

const API_KEYS = createPlaywrightMockApiRoutePattern('api-keys(?:[/?]|$)');
const CONNECT_HREF = orgPath(APP_ROUTES.CONNECTORS.AGENTS);

test.describe('Topbar Apps menu', () => {
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

  test('offers Connect and the CLI install command, and the Overview shows no Connect card', async ({
    authenticatedPage,
  }) => {
    const dashboardPage = new DashboardPage(authenticatedPage);

    await dashboardPage.goto();
    await expect(dashboardPage.statsSection).toBeVisible();
    await expect(
      authenticatedPage.getByTestId('operational-home-unconfigured'),
    ).toHaveCount(0);

    await authenticatedPage.getByTestId('topbar-apps-menu').click();
    const menu = authenticatedPage.getByTestId('apps-menu');

    await expect(menu.getByRole('link', { name: 'Connect' })).toHaveAttribute(
      'href',
      CONNECT_HREF,
    );

    await menu.getByRole('button', { name: 'Install' }).click();
    await expect(menu.getByText('bun add -g @genfeedai/cli')).toBeVisible();
    await menu.getByRole('radio', { name: 'npm' }).click();
    await expect(menu.getByText('npm install -g @genfeedai/cli')).toBeVisible();
  });
});
