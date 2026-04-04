import {
  mockActiveSubscription,
  mockContentLibrary,
  mockLibraryData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';

/**
 * E2E Tests for Library Media Types
 *
 * Tests verify that library sub-pages (captions, gifs,
 * ingredients, music, voices) load correctly with expected
 * UI structure, filter/search controls, and content display.
 * All API calls are mocked.
 */
test.describe('Library Media Types', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockLibraryData(authenticatedPage);
  });

  test.describe('Captions Page', () => {
    test('should display captions page', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/library/captions');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/captions/);
      await expect(
        authenticatedPage.getByText(/caption/i).first(),
      ).toBeVisible();
    });

    test('should show captions list or empty state', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/library/captions');
      await authenticatedPage.waitForLoadState('domcontentloaded');

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

      expect(
        hasItems || hasEmptyState,
        'Expected caption items or empty state to be visible',
      ).toBe(true);
    });
  });

  test.describe('GIFs Page', () => {
    test('should display GIF library page', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/library/gifs');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/gifs/);
      await expect(authenticatedPage.getByText(/gif/i).first()).toBeVisible();
    });

    test('should show GIF grid or empty state', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/library/gifs');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // GIF items in masonry/grid layout or empty state
      const hasItems = await authenticatedPage
        .locator(
          '[data-testid="ingredient-item"],' +
            ' [data-testid="content-item"],' +
            ' [data-testid="masonry-item"],' +
            ' .ingredient-card',
        )
        .first()
        .isVisible()
        .catch(() => false);

      const hasEmptyState = await authenticatedPage
        .locator('[data-testid="empty-state"],' + ' .empty-state')
        .isVisible()
        .catch(() => false);

      expect(
        hasItems || hasEmptyState,
        'Expected GIF items or empty state to be visible',
      ).toBe(true);
    });
  });

  test.describe('Library Landing', () => {
    test('should display the Library landing with workspace controls', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/library/ingredients');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/ingredients/);
      await expect(
        authenticatedPage.getByTestId('library-landing-title'),
      ).toHaveText('Library');
      await expect(
        authenticatedPage.getByTestId('organization-switcher-trigger'),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByTestId('brand-switcher-trigger'),
      ).toBeVisible();
    });

    test('should show a compact low-credit notice on the Library landing', async ({
      authenticatedPage,
    }) => {
      await mockActiveSubscription(authenticatedPage, {
        credits: 250,
        plan: 'pro',
      });

      await authenticatedPage.goto('/library/ingredients');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(
        authenticatedPage.getByTestId('library-credit-notice'),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByTestId('shell-credit-notice'),
      ).toHaveCount(0);
    });

    test('should expose usable category entry points from the Library landing', async ({
      authenticatedPage,
    }) => {
      await mockContentLibrary(authenticatedPage, 'videos', 3);

      await authenticatedPage.goto('/library/ingredients');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      const videosEntry = authenticatedPage.getByTestId(
        'library-category-videos',
      );

      await expect(videosEntry).toHaveAttribute('href', '/library/videos');
      await expect(
        authenticatedPage.getByTestId('library-category-images'),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByTestId('library-category-gifs'),
      ).toBeVisible();
      await expect(
        authenticatedPage.getByTestId('library-category-voices'),
      ).toBeVisible();

      await videosEntry.click();

      await authenticatedPage.waitForLoadState('domcontentloaded');
      await expect(authenticatedPage).toHaveURL(/library\/videos/);
    });
  });

  test.describe('Music Page', () => {
    test('should display music library page', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/library/music');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/music/);
      await expect(authenticatedPage.getByText(/music/i).first()).toBeVisible();
    });

    test('should show music tracks or empty state', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/library/music');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // Music track items or empty state
      const hasItems = await authenticatedPage
        .locator(
          '[data-testid="music-item"],' +
            ' [data-testid="ingredient-item"],' +
            ' [data-testid="content-item"],' +
            ' .music-card,' +
            ' .track-item',
        )
        .first()
        .isVisible()
        .catch(() => false);

      const hasEmptyState = await authenticatedPage
        .locator('[data-testid="empty-state"],' + ' .empty-state')
        .isVisible()
        .catch(() => false);

      expect(
        hasItems || hasEmptyState,
        'Expected music items or empty state to be visible',
      ).toBe(true);
    });
  });

  test.describe('Voices Page', () => {
    test('should display voices page', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/library/voices');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/voices/);
      await expect(authenticatedPage.getByText(/voice/i).first()).toBeVisible();
    });

    test('should show voice samples or empty state', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/library/voices');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // Voice items or empty state
      const hasItems = await authenticatedPage
        .locator(
          '[data-testid="voice-item"],' +
            ' [data-testid="content-item"],' +
            ' .voice-card,' +
            ' .voice-sample',
        )
        .first()
        .isVisible()
        .catch(() => false);

      const hasEmptyState = await authenticatedPage
        .locator('[data-testid="empty-state"],' + ' .empty-state')
        .isVisible()
        .catch(() => false);

      expect(
        hasItems || hasEmptyState,
        'Expected voice items or empty state to be visible',
      ).toBe(true);
    });
  });

  test.describe('Filter and Search UI', () => {
    test('should show filter or search controls on library category pages', async ({
      authenticatedPage,
    }) => {
      await mockContentLibrary(authenticatedPage, 'videos', 3);

      await authenticatedPage.goto('/library/videos');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // Search input, filter buttons, or sort controls
      const hasSearch = await authenticatedPage
        .locator(
          'input[type="search"],' +
            ' input[placeholder*="Search"],' +
            ' input[placeholder*="search"],' +
            ' [data-testid="search-input"],' +
            ' [data-testid="search"]',
        )
        .first()
        .isVisible()
        .catch(() => false);

      const hasFilter = await authenticatedPage
        .locator(
          '[data-testid="filter"],' +
            ' [data-testid="filter-button"],' +
            ' button:has-text("Filter"),' +
            ' button:has-text("Sort")',
        )
        .first()
        .isVisible()
        .catch(() => false);

      expect(
        hasSearch || hasFilter,
        'Expected search input or filter button to be visible',
      ).toBe(true);
    });
  });

  test.describe('Unauthenticated Access', () => {
    test('should redirect unauthenticated user from library captions', async ({
      unauthenticatedPage,
    }) => {
      await unauthenticatedPage.goto('/library/captions');

      // Should redirect to login
      await unauthenticatedPage.waitForURL(/\/sign-in|\/login/, {
        timeout: 15000,
      });
      expect(unauthenticatedPage.url()).toMatch(/\/sign-in|\/login/);
    });

    test('should redirect unauthenticated user from library voices', async ({
      unauthenticatedPage,
    }) => {
      await unauthenticatedPage.goto('/library/voices');

      // Should redirect to login
      await unauthenticatedPage.waitForURL(/\/sign-in|\/login/, {
        timeout: 15000,
      });
      expect(unauthenticatedPage.url()).toMatch(/\/sign-in|\/login/);
    });
  });
});
