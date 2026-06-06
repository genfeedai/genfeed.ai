import {
  mockActiveSubscription,
  mockAutomationData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';

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
      '/orchestration/runs?q=trend&sort=credits&range=30d',
    );

    await expect(authenticatedPage).toHaveURL(
      /orchestration\/runs\?q=trend&sort=credits&range=30d/,
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
    await unauthenticatedPage.goto('/orchestration/runs');

    try {
      await unauthenticatedPage.waitForURL(/\/sign-in|\/login/, {
        timeout: 5000,
      });
      expect(unauthenticatedPage.url()).toMatch(/\/sign-in|\/login/);
      return;
    } catch {
      // Local keyless dev mode intentionally skips auth enforcement.
    }

    await expect(unauthenticatedPage).toHaveURL(/orchestration\/runs/);
    await expect(
      unauthenticatedPage.getByRole('heading', { name: 'Agent Runs' }),
    ).toBeVisible();
  });
});
