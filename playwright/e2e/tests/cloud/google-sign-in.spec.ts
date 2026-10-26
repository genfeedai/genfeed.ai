import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { expect, test } from '../../fixtures/auth.fixture';

/**
 * E2E Tests for Google sign-in on the Cloud build
 * (`NEXT_PUBLIC_GENFEED_CLOUD=true`).
 *
 * Runs in the `e2e-cloud-billing` job of playwright-full-nightly.yml. Cloud
 * holds the Google OAuth credentials on the API, not on the web app, so the
 * web app has no `GOOGLE_OAUTH_CLIENT_*` and must still offer Google. A
 * self-hosted install without credentials hides it; Cloud never does.
 */
test.describe('Google sign-in (Cloud)', () => {
  for (const route of [APP_ROUTES.LOGIN, APP_ROUTES.SIGN_UP]) {
    test(`offers Google on ${route} without web-app credentials`, async ({
      unauthenticatedPage,
    }) => {
      await unauthenticatedPage.goto(route, { waitUntil: 'domcontentloaded' });

      await expect(
        unauthenticatedPage.getByRole('button', { name: 'Google' }),
      ).toBeVisible();
    });
  }
});
