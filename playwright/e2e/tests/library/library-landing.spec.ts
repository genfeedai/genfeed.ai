import {
  mockActiveSubscription,
  mockContentLibrary,
  mockLibraryData,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';

test.describe('Library Landing', () => {
  test.fixme(
    true,
    'Protected Library landing remains behind the route loading shell in app-core E2E; enable once the route stabilizes in browser automation.',
  );

  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockLibraryData(authenticatedPage);
  });

  test('loads the Library landing with workspace controls', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/library/ingredients');
    await authenticatedPage.waitForLoadState('domcontentloaded');

    await expect(authenticatedPage).toHaveURL(/library\/ingredients/);
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

  test('shows a compact inline low-credit notice on the Library landing', async ({
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

  test('exposes usable category entry points from the Library landing', async ({
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
