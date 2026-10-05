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
    APP_ROUTES.LIBRARY.RECENT,
  );
  const link = authenticatedPage.getByRole('link', {
    name: 'Recent',
    exact: true,
  });
  await expect(link).toBeVisible();
  await link.hover();
  await instant(authenticatedPage, async () => {
    await link.click();
    await authenticatedPage.waitForURL(
      (url) => `${url.pathname}${url.search}` === destination,
    );
    await expect(
      authenticatedPage.getByRole('heading', { name: 'Recent', exact: true }),
    ).toBeVisible();
  });
});
