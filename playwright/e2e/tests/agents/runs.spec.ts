import { APP_ROUTES } from '@genfeedai/constants';
import {
  mockActiveSubscription,
  mockAutomationData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';

test.describe('Agents Runs', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockAutomationData(authenticatedPage);
  });

  test('loads the runs page with routing analytics and query-backed history', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(
      `${brandPath(APP_ROUTES.AUTOMATE.RUNS)}?q=trend&sort=credits&range=30d`,
    );

    await expect(authenticatedPage).toHaveURL(
      /automate\/runs\?q=trend&sort=credits&range=30d/,
    );
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Agent Runs' }),
    ).toBeVisible();
    await expect(authenticatedPage.getByText('Routing Paths')).toBeVisible();
    await expect(authenticatedPage.getByText('Routing Trends')).toBeVisible();
    await expect(
      authenticatedPage.getByText('Routing Anomalies'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByDisplayValue('Window: 30d'),
    ).toBeVisible();
    await expect(authenticatedPage.getByDisplayValue('trend')).toBeVisible();
    await expect(authenticatedPage.getByText('Trend scan')).toBeVisible();
  });

  test('redirects unauthenticated users from the runs page', async ({
    unauthenticatedPage,
  }) => {
    test.skip(
      process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST === 'true',
      'Mocked app-core builds skip Better Auth in proxy.ts; login redirect is covered by app-authed.',
    );
    await unauthenticatedPage.goto(APP_ROUTES.AUTOMATE.RUNS);

    await unauthenticatedPage.waitForURL(/\/login/, { timeout: 15000 });
    expect(unauthenticatedPage.url()).toMatch(/\/login/);
  });
});
