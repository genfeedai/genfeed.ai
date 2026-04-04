import {
  mockActiveSubscription,
  mockPostsList,
  mockReviewQueue,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';

/**
 * E2E Tests for Posts Sub-Routes (Content Types)
 *
 * Covers: /compose, /compose/article, /posts/newsletters,
 *         /posts/remix, /posts/review
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

  test('article composer loads at /compose/article', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/compose/article');

    await expect(authenticatedPage).toHaveURL(/compose\/article/);
  });

  test('newsletters page loads newsletter list', async ({
    authenticatedPage,
  }) => {
    // Mock newsletters API endpoint so the page doesn't hit real backend
    await authenticatedPage.route('**/newsletters**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          body: JSON.stringify({
            data: [],
            meta: { page: 1, pageSize: 10, totalCount: 0 },
          }),
          contentType: 'application/json',
          status: 200,
        });
        return;
      }
      await route.continue();
    });

    await authenticatedPage.goto('/posts/newsletters');

    await expect(authenticatedPage).toHaveURL(/posts\/newsletters/);
    // Page should render newsletter-specific content
    await expect(
      authenticatedPage.getByText(/newsletter/i).first(),
    ).toBeVisible();
  });

  test('composer page opens with editor visible', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/compose');

    // /compose redirects to /compose/article
    await expect(authenticatedPage).toHaveURL(/\/compose\/article/);
    await expect(
      authenticatedPage.getByText(/article|compose|editor|write/i).first(),
    ).toBeVisible();
  });

  test('remix page loads remix interface', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/posts/remix');

    await expect(authenticatedPage).toHaveURL(/posts\/remix/);
    // Remix page should render its interface
    await expect(
      authenticatedPage.getByText(/remix|trend/i).first(),
    ).toBeVisible();
  });

  test('review page shows review queue', async ({ authenticatedPage }) => {
    await mockReviewQueue(authenticatedPage);

    await authenticatedPage.goto('/posts/review');

    await expect(authenticatedPage).toHaveURL(/posts\/review/);
    // Review queue should display batch/review UI
    await expect(
      authenticatedPage.getByText(/review|queue|batch|approve/i).first(),
    ).toBeVisible();
  });

  test('unauthenticated user is redirected from posts routes', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/compose');

    // Should redirect to login
    await unauthenticatedPage.waitForURL(/\/sign-in|\/login/, {
      timeout: 15000,
    });
    expect(unauthenticatedPage.url()).toMatch(/\/sign-in|\/login/);
  });
});
