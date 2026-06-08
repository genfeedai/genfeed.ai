import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { ComposePage } from '../../pages/compose.page';

/**
 * E2E Tests for Compose Pages
 *
 * Covers navigation and rendering of compose/post, compose/article,
 * and compose/newsletter routes.
 *
 * CRITICAL: All tests use mocked API responses.
 * No real backend calls occur.
 */
test.describe('Compose — Navigation', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
  });

  test('should load compose post page', async ({ authenticatedPage }) => {
    const composePage = new ComposePage(authenticatedPage);

    await composePage.gotoPost();
    await composePage.assertOnPostPage();
    await composePage.assertPageLoaded();
  });

  test('should load compose article page', async ({ authenticatedPage }) => {
    const composePage = new ComposePage(authenticatedPage);

    await composePage.gotoArticle();
    await composePage.assertOnArticlePage();
    await composePage.assertPageLoaded();
  });

  test('should load compose newsletter page', async ({ authenticatedPage }) => {
    const composePage = new ComposePage(authenticatedPage);

    await composePage.gotoNewsletter();
    await composePage.assertOnNewsletterPage();
    await composePage.assertPageLoaded();
  });

  test('should not redirect authenticated user away from compose', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/compose/post');
    await authenticatedPage.waitForLoadState('domcontentloaded');

    // Should stay on compose, not redirect to login
    await expect(authenticatedPage).not.toHaveURL(/\/login/);
    await expect(authenticatedPage).toHaveURL(/\/compose\/post/);
  });
});
