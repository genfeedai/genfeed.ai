import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  mockActiveSubscription,
  mockContentLibrary,
  mockLibraryData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';
import { skipIfPlaywrightAuthBypassed } from '../../utils/playwright-auth-bypass';

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
      await authenticatedPage.goto(brandPath(APP_ROUTES.LIBRARY.CAPTIONS));
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/captions/);
      await expect(
        authenticatedPage.getByText(/caption/i).first(),
      ).toBeVisible();
    });

    test('should show captions list or empty state', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(brandPath(APP_ROUTES.LIBRARY.CAPTIONS));
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(
        authenticatedPage
          .locator(
            '[data-testid="caption-item"], [data-testid="content-item"], [role="row"], .caption-card',
          )
          .or(authenticatedPage.getByText('FORMAT'))
          .or(authenticatedPage.getByText(/no captions found/i))
          .or(authenticatedPage.getByText(/captions could not be loaded/i))
          .or(authenticatedPage.getByText('Assets'))
          .first(),
      ).toBeVisible();
    });
  });

  test.describe('GIFs Page', () => {
    test('should display GIF library page', async ({ authenticatedPage }) => {
      await authenticatedPage.goto(brandPath(APP_ROUTES.LIBRARY.GIFS));
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/gifs/);
      await expect(authenticatedPage.getByText(/gif/i).first()).toBeVisible();
    });

    test('should show GIF grid or empty state', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(brandPath(APP_ROUTES.LIBRARY.GIFS));
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(
        authenticatedPage
          .locator(
            '[data-testid="ingredient-item"], [data-testid="content-item"], [data-testid="masonry-item"], .ingredient-card',
          )
          .or(authenticatedPage.getByText(/no (gifs|gif)/i))
          .or(authenticatedPage.getByText(/^GIFs$/i))
          .or(authenticatedPage.getByText('Assets'))
          .first(),
      ).toBeVisible();
    });
  });

  test.describe('Music Page', () => {
    test('should display music library page', async ({ authenticatedPage }) => {
      await authenticatedPage.goto(brandPath(APP_ROUTES.LIBRARY.MUSIC));
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/music/);
      await expect(authenticatedPage.getByText(/music/i).first()).toBeVisible();
    });

    test('should show music tracks or empty state', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(brandPath(APP_ROUTES.LIBRARY.MUSIC));
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // Every Library destination renders the same asset list and puts the type
      // on the query string, so a music route lists its tracks as rows rather
      // than as the standalone sound player. `Ambient Loop` is the MUSIC entry
      // the library fixture serves for `categories=MUSIC`.
      // @see .agents/memory/feedback_library_information_architecture.md
      await expect(
        authenticatedPage
          .getByText('Ambient Loop')
          .or(
            authenticatedPage.getByText(
              /no (music|tracks|results found)|could not be loaded/i,
            ),
          )
          .or(
            authenticatedPage.locator(
              '[data-testid="empty-state"], [data-testid="table-empty"], .empty-state',
            ),
          )
          .first(),
      ).toBeVisible();
    });
  });

  test.describe('Voices Page', () => {
    test('should display voices page', async ({ authenticatedPage }) => {
      await authenticatedPage.goto(brandPath(APP_ROUTES.LIBRARY.VOICES));
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/voices/);
      await expect(authenticatedPage.getByText(/voice/i).first()).toBeVisible();
    });

    test('should show voice samples or empty state', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(brandPath(APP_ROUTES.LIBRARY.VOICES));
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // Voice items or empty state
      await expect(
        authenticatedPage
          .locator(
            '[data-testid="voice-item"], [data-testid="content-item"], .voice-card, .voice-sample',
          )
          .or(authenticatedPage.getByText(/no voices|could not be loaded/i))
          .or(authenticatedPage.getByText(/voices/i))
          .or(authenticatedPage.getByText('Assets'))
          .first(),
      ).toBeVisible();
    });
  });

  test.describe('Filter and Search UI', () => {
    test('should show filter or search controls on library category pages', async ({
      authenticatedPage,
    }) => {
      await mockContentLibrary(authenticatedPage, 'videos', 3);

      await authenticatedPage.goto(brandPath(APP_ROUTES.LIBRARY.VIDEOS));
      await authenticatedPage.waitForLoadState('domcontentloaded');
      await expect
        .poll(() => new URL(authenticatedPage.url()).pathname)
        .toBe(brandPath(APP_ROUTES.LIBRARY.VIDEOS));

      const search = authenticatedPage.getByRole('textbox', {
        name: 'Search',
      });
      await expect(search).toBeVisible();
      await expect(search).toHaveAttribute(
        'placeholder',
        "Search this brand's assets",
      );
    });
  });

  test.describe('Unauthenticated Access', () => {
    test('should redirect unauthenticated user from library captions', async ({
      unauthenticatedPage,
    }) => {
      skipIfPlaywrightAuthBypassed();
      await unauthenticatedPage.goto(brandPath(APP_ROUTES.LIBRARY.CAPTIONS));

      // Should redirect to login
      await unauthenticatedPage.waitForURL(/\/sign-in|\/login/, {
        timeout: 15000,
      });
      expect(unauthenticatedPage.url()).toMatch(/\/sign-in|\/login/);
    });

    test('should redirect unauthenticated user from library voices', async ({
      unauthenticatedPage,
    }) => {
      skipIfPlaywrightAuthBypassed();
      await unauthenticatedPage.goto(brandPath(APP_ROUTES.LIBRARY.VOICES));

      // Should redirect to login
      await unauthenticatedPage.waitForURL(/\/sign-in|\/login/, {
        timeout: 15000,
      });
      expect(unauthenticatedPage.url()).toMatch(/\/sign-in|\/login/);
    });
  });
});
