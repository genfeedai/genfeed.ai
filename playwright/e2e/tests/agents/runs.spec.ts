import { APP_ROUTES } from '@genfeedai/constants';
import {
  mockActiveSubscription,
  mockAutomationData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';
import { skipIfPlaywrightAuthBypassed } from '../../utils/playwright-auth-bypass';

test.describe('Workflow Execution Runs', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockAutomationData(authenticatedPage);
  });

  test('loads the runs page with execution stats and history', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(brandPath(APP_ROUTES.AUTOMATION.RUNS));

    await expect(authenticatedPage).toHaveURL(/automation\/runs/);
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Workflow Executions' }),
    ).toBeAttached();
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Recent Runs' }),
    ).toBeVisible();
    await expect(authenticatedPage.getByText('Trend scan')).toBeVisible();
    await expect(authenticatedPage.getByText('Caption draft')).toBeVisible();
    await expect(authenticatedPage.getByText('trends.scan')).toBeVisible();
  });

  test('filters execution history from the search box', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(brandPath(APP_ROUTES.AUTOMATION.RUNS));

    await expect(authenticatedPage.getByText('Caption draft')).toBeVisible();

    await authenticatedPage
      .getByPlaceholder('Search workflow executions')
      .fill('trend');

    await expect(authenticatedPage.getByText('Trend scan')).toBeVisible();
    await expect(authenticatedPage.getByText('Caption draft')).toBeHidden();
  });

  test('redirects unauthenticated users from the runs page', async ({
    unauthenticatedPage,
  }) => {
    skipIfPlaywrightAuthBypassed();
    await unauthenticatedPage.goto(APP_ROUTES.AUTOMATION.RUNS);

    await unauthenticatedPage.waitForURL(/\/login/, { timeout: 15000 });
    expect(unauthenticatedPage.url()).toMatch(/\/login/);
  });
});
