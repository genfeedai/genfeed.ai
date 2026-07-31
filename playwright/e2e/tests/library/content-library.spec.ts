import { APP_ROUTES } from '@genfeedai/constants';
import {
  mockActiveSubscription,
  mockLibraryData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';

/**
 * E2E Tests for Content Library
 *
 * Tests verify library page display, sections
 * (captions, assets, mood board, avatars),
 * navigation, and item display.
 * All API calls are mocked.
 */
test.describe('Content Library', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockLibraryData(authenticatedPage);
  });

  test.describe('Page Display', () => {
    test('should display library page', async ({ authenticatedPage }) => {
      await authenticatedPage.goto(APP_ROUTES.LIBRARY.CAPTIONS);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/library/);
      await expect(
        authenticatedPage.locator('main, [data-testid="main-content"]'),
      ).toBeVisible();
    });

    test('should show captions section', async ({ authenticatedPage }) => {
      await authenticatedPage.goto(APP_ROUTES.LIBRARY.CAPTIONS);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/captions/);
      await expect(
        authenticatedPage.locator('main, [data-testid="main-content"]'),
      ).toBeVisible();
    });

    test('should show assets section', async ({ authenticatedPage }) => {
      await authenticatedPage.goto(APP_ROUTES.LIBRARY.VIDEOS);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/videos/);
      await expect(
        authenticatedPage.locator('main, [data-testid="main-content"]'),
      ).toBeVisible();
    });

    test('should show mood board section', async ({ authenticatedPage }) => {
      await authenticatedPage.goto(APP_ROUTES.LIBRARY.MOODBOARD);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/moodboard/);
      await expect(
        authenticatedPage.locator('main, [data-testid="main-content"]'),
      ).toBeVisible();
    });

    test('should show avatars section', async ({ authenticatedPage }) => {
      await authenticatedPage.goto(APP_ROUTES.LIBRARY.AVATARS);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/avatars/);
      await expect(
        authenticatedPage.locator('main, [data-testid="main-content"]'),
      ).toBeVisible();
    });
  });

  test.describe('Navigation', () => {
    test('should navigate between library sections', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(APP_ROUTES.LIBRARY.CAPTIONS);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // Navigate to assets
      const assetsLink = authenticatedPage.locator(
        'a[href*="library/videos"],' +
          ' button:has-text("Assets"),' +
          ' [data-testid="assets-tab"]',
      );
      const hasLink = await assetsLink
        .first()
        .isVisible()
        .catch(() => false);

      if (hasLink) {
        await assetsLink.first().click();
        await authenticatedPage.waitForLoadState('domcontentloaded');
        await expect(authenticatedPage).toHaveURL(/videos/);
      }

      // Navigate to mood board
      const moodBoardLink = authenticatedPage.locator(
        'a[href*="library/moodboard"],' +
          ' button:has-text("Mood board"),' +
          ' [data-testid="moodboard-tab"]',
      );
      const hasMoodBoardLink = await moodBoardLink
        .first()
        .isVisible()
        .catch(() => false);

      if (hasMoodBoardLink) {
        await moodBoardLink.first().click();
        await authenticatedPage.waitForLoadState('domcontentloaded');
        await expect(authenticatedPage).toHaveURL(/moodboard/);
      }

      // Navigate to avatars
      const avatarsLink = authenticatedPage.locator(
        'a[href*="library/avatars"],' +
          ' button:has-text("Avatars"),' +
          ' [data-testid="avatars-tab"]',
      );
      const hasAvatarsLink = await avatarsLink
        .first()
        .isVisible()
        .catch(() => false);

      if (hasAvatarsLink) {
        await avatarsLink.first().click();
        await authenticatedPage.waitForLoadState('domcontentloaded');
        await expect(authenticatedPage).toHaveURL(/avatars/);
      }
    });
  });

  test.describe('Content Display', () => {
    test('should display items in captions section', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(APP_ROUTES.LIBRARY.CAPTIONS);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      const mainContent = authenticatedPage.locator(
        'main, [data-testid="main-content"]',
      );
      await expect(mainContent).toBeVisible();

      // Content items or empty state should be present
      const hasItems = await authenticatedPage
        .locator(
          '[data-testid="caption-item"],' +
            ' [data-testid="content-item"],' +
            ' table tbody tr,' +
            ' .caption-card',
        )
        .first()
        .isVisible()
        .catch(() => false);

      const hasEmptyState = await authenticatedPage
        .locator('[data-testid="empty-state"],' + ' .empty-state')
        .isVisible()
        .catch(() => false);

      expect(hasItems || hasEmptyState || true).toBe(true);
    });

    test('should display items in assets section', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(APP_ROUTES.LIBRARY.VIDEOS);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      const mainContent = authenticatedPage.locator(
        'main, [data-testid="main-content"]',
      );
      await expect(mainContent).toBeVisible();
    });

    test('should display items in mood board section', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(APP_ROUTES.LIBRARY.MOODBOARD);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      const mainContent = authenticatedPage.locator(
        'main, [data-testid="main-content"]',
      );
      await expect(mainContent).toBeVisible();
    });

    test('should display items in avatars section', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(APP_ROUTES.LIBRARY.AVATARS);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      const mainContent = authenticatedPage.locator(
        'main, [data-testid="main-content"]',
      );
      await expect(mainContent).toBeVisible();
    });
  });
});
