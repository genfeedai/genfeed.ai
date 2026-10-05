import {
  mockActiveSubscription,
  mockLibraryData,
} from '@e2e/fixtures/api-mocks.fixture';
import { expect, test } from '@e2e/fixtures/auth.fixture';
import {
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import { instant } from '@next/playwright';

// Library type and place URLs redirect to the existing asset list with query
// presets. Both list destinations already render without awaiting URL data.
test('library list navigation renders the destination header instantly', async ({
  authenticatedPage,
}) => {
  await mockActiveSubscription(authenticatedPage, {
    credits: 1000,
    plan: 'pro',
  });
  await mockLibraryData(authenticatedPage);
  await authenticatedPage.goto(
    createBrandAppRoute('test-org', 'brand-1', APP_ROUTES.LIBRARY.IMAGES),
  );
  const destination = createBrandAppRoute(
    'test-org',
    'brand-1',
    APP_ROUTES.LIBRARY.ASSETS,
  );
  const link = authenticatedPage.getByRole('link', {
    name: 'Recent',
    exact: true,
  });
  await expect(link).toBeVisible();
  await link.hover();
  await instant(authenticatedPage, async () => {
    await link.click();
    // Place presets preserve the Images type preset's category filters.
    await authenticatedPage.waitForURL(
      (url) =>
        url.pathname === destination &&
        url.searchParams.get('place') === 'recent' &&
        url.searchParams.getAll('categories').join(',') === 'IMAGE,IMAGE_EDIT',
    );
    const url = new URL(authenticatedPage.url());
    expect(url.pathname).toBe(destination);
    expect(url.searchParams.get('place')).toBe('recent');
    expect(url.searchParams.getAll('categories')).toEqual([
      'IMAGE',
      'IMAGE_EDIT',
    ]);
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Recent', exact: true }),
    ).toBeVisible();
  });
});
