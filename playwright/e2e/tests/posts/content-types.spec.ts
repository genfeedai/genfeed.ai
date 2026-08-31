import { APP_ROUTES, LEGACY_APP_ROUTES } from '@genfeedai/constants';
import {
  mockActiveSubscription,
  mockPostsList,
  mockReviewQueue,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { skipIfPlaywrightAuthBypassed } from '../../utils/playwright-auth-bypass';

/**
 * E2E Tests for Posts Sub-Routes (Content Types)
 *
 * Covers: retired /publishing/newsletters redirect, /publishing/remix,
 *         /publishing/review
 *
 * CRITICAL: All tests use mocked API responses.
 * No real backend calls occur.
 */
test.describe('Posts — Content Types', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockPostsList(authenticatedPage);
  });

  test('retired newsletters path redirects to the agent composer', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(LEGACY_APP_ROUTES.PUBLISHING_NEWSLETTERS);

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`${APP_ROUTES.AGENT.NEW}|${APP_ROUTES.PUBLISHING.POSTS}`),
    );
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });

  test('remix page loads remix interface', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(APP_ROUTES.PUBLISHING.REMIX);

    await expect(authenticatedPage).toHaveURL(/publishing\/remix/);
    // Remix page should render its interface
    await expect(
      authenticatedPage.getByText(/remix|trend/i).first(),
    ).toBeVisible();
  });

  test('review page shows review queue', async ({ authenticatedPage }) => {
    await mockReviewQueue(authenticatedPage);

    await authenticatedPage.goto(APP_ROUTES.PUBLISHING.REVIEW);

    await expect(authenticatedPage).toHaveURL(/publishing\/review/);
    // Review queue should display batch/review UI
    await expect(
      authenticatedPage.getByText(/review|queue|batch|approve/i).first(),
    ).toBeVisible();
  });

  test('unauthenticated user is redirected from posts routes', async ({
    unauthenticatedPage,
  }) => {
    skipIfPlaywrightAuthBypassed();
    await unauthenticatedPage.goto(APP_ROUTES.PUBLISHING.ROOT);

    // Should redirect to login
    await unauthenticatedPage.waitForURL(/\/sign-in|\/login/, {
      timeout: 15000,
    });
    expect(unauthenticatedPage.url()).toMatch(/\/sign-in|\/login/);
  });
});
