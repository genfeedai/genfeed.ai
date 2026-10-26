import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { expect, test } from '../../fixtures/auth.fixture';

/**
 * A signed-in visitor without admin access must land back in the app, not on a
 * 404 wrapped in the admin rails. `__playwright_admin_denied` makes the
 * isolated build treat the mocked session as a non-superadmin.
 */
test.describe('Admin access without superadmin', () => {
  test('redirects /admin pages to the workspace with no admin chrome', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.context().addCookies(
      ['127.0.0.1', 'localhost'].map((domain) => ({
        domain,
        name: '__playwright_admin_denied',
        path: '/',
        value: 'true',
      })),
    );

    await authenticatedPage.goto(APP_ROUTES.ADMIN.OVERVIEW.DASHBOARD, {
      waitUntil: 'domcontentloaded',
    });

    await expect(authenticatedPage).not.toHaveURL(/\/admin(\/|$)/);
    await expect(
      authenticatedPage.getByTestId('app-content-shell'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('This page wandered off'),
    ).toHaveCount(0);
  });
});
