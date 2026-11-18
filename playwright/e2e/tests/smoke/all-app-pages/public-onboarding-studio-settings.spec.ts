import { test } from '../../../fixtures/auth.fixture';
import {
  oauthRoutes,
  onboardingRoutes,
  publicRoutes,
  sweepAdminBucket,
  sweepProtectedBucket,
  sweepRoutes,
  useMockApiServer,
} from '../../../utils/app-page-sweep';

test.describe('All App Pages', () => {
  test.setTimeout(900_000);
  useMockApiServer();

  test('public pages render', async ({ unauthenticatedPage }) => {
    await sweepRoutes(unauthenticatedPage, publicRoutes, {
      allowRedirectToLogin: true,
    });
  });

  test('oauth callback pages render', async ({ authenticatedPage }) => {
    await authenticatedPage.route('**/services/*/verify**', async (route) => {
      await route.fulfill({
        body: JSON.stringify({ success: true }),
        contentType: 'application/json',
        status: 200,
      });
    });

    await sweepRoutes(authenticatedPage, oauthRoutes);
  });

  test('onboarding pages render', async ({ authenticatedPage }) => {
    await sweepRoutes(authenticatedPage, onboardingRoutes);
  });

  test('protected root pages render', async ({ authenticatedPage }) => {
    await sweepProtectedBucket(authenticatedPage, 'protected root');
  });

  test('protected studio apps pages render', async ({ authenticatedPage }) => {
    await sweepProtectedBucket(authenticatedPage, 'protected studio apps');
  });

  test('protected brand settings pages render', async ({
    authenticatedPage,
  }) => {
    await sweepProtectedBucket(authenticatedPage, 'protected brand settings');
  });

  test('admin economics pages render', async ({ adminPage }) => {
    await sweepAdminBucket(adminPage, 'admin economics');
  });
});
