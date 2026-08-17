import { APP_ROUTES } from '@genfeedai/constants';
import {
  mockActiveSubscription,
  mockAnalyticsData,
  mockWorkspaceTasks,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { skipIfPlaywrightAuthBypassed } from '../../utils/playwright-auth-bypass';

test.describe('Overview Compatibility Redirect', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockAnalyticsData(authenticatedPage);
    await mockWorkspaceTasks(authenticatedPage);
  });

  test('redirects authenticated users from /overview to /workspace', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(APP_ROUTES.OVERVIEW.ROOT, {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).toHaveURL(
      /\/workspace\/overview(?:$|[?#])/,
    );
    await expect(
      authenticatedPage.getByTestId('sidebar-shell').first(),
    ).toBeVisible();
  });

  test('keeps /overview as a compatibility redirect for unauthenticated users', async ({
    unauthenticatedPage,
  }) => {
    skipIfPlaywrightAuthBypassed();
    await unauthenticatedPage.goto(APP_ROUTES.OVERVIEW.ROOT, {
      waitUntil: 'domcontentloaded',
    });

    await expect(unauthenticatedPage).toHaveURL(
      /\/workspace\/overview(?:$|[?#])/,
    );
  });
});
