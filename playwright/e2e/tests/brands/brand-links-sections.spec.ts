import {
  mockActiveSubscription,
  mockBrandWithMedia,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

// The Profile page owns the brand's social accounts (a Connect account button
// in the page header) and its website links. Like every other section, the
// website links title and action sit above the card.
test.describe('Brand accounts and website links', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockBrandWithMedia(authenticatedPage);
  });

  test('connects accounts from the header and keeps the links title and action outside the card', async ({
    authenticatedPage,
  }) => {
    const route = brandPath('/settings/profile');
    await authenticatedPage.goto(route, {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    });
    await assertNoErrorBoundaryFallback(authenticatedPage, route);

    await expect(
      authenticatedPage
        .getByRole('button', { name: 'Connect account' })
        .first(),
    ).toBeVisible({ timeout: 30000 });

    const heading = authenticatedPage.getByRole('heading', {
      exact: true,
      name: 'Website links',
    });
    await expect(heading).toBeVisible({ timeout: 30000 });
    await expect(
      heading.locator('xpath=ancestor::*[contains(@class,"rounded-card")]'),
    ).toHaveCount(0);
    await expect(
      heading
        .locator('xpath=ancestor::section[1]')
        .getByRole('button', { name: 'Add link' }),
    ).toBeVisible();

    await expect(
      authenticatedPage.getByRole('heading', { name: 'Social & links' }),
    ).toHaveCount(0);
  });
});
