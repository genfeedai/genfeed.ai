import { APP_ROUTES } from '@genfeedai/contracts/constants';
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
    const history = authenticatedPage.getByRole('table', {
      exact: true,
      name: 'Recent runs',
    });
    await expect(history.getByRole('row')).toHaveCount(3);

    for (const execution of [
      { credits: '6', duration: '18s', id: 'execution-1', label: 'Trend scan' },
      {
        credits: '3',
        duration: '9s',
        id: 'execution-2',
        label: 'Caption draft',
      },
    ]) {
      const row = history.getByRole('row').filter({ hasText: execution.label });
      await expect(row).toBeVisible();
      await expect(
        row.getByRole('cell', { exact: true, name: 'Completed' }),
      ).toBeVisible();
      await expect(
        row.getByRole('cell', { exact: true, name: execution.credits }),
      ).toBeVisible();
      await expect(
        row.getByRole('cell', { exact: true, name: execution.duration }),
      ).toBeVisible();
      await expect(
        row.getByRole('link', { exact: true, name: 'View Details' }),
      ).toHaveAttribute(
        'href',
        brandPath(`${APP_ROUTES.AUTOMATION.RUNS}/${execution.id}`),
      );
    }
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
