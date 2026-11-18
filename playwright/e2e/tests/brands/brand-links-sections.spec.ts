import {
  mockActiveSubscription,
  mockBrandWithMedia,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

// The Profile page owns the brand's social accounts (a Connect account button
// in the page header) and its website links. Both sit in the right sidebar,
// accounts under the website links. Like every other section, the website
// links title and action sit above the card.
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

  test('lists the connected accounts in the sidebar, under the website links', async ({
    authenticatedPage,
  }) => {
    const route = brandPath('/settings/profile');
    await authenticatedPage.goto(route, {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    });
    await assertNoErrorBoundaryFallback(authenticatedPage, route);

    const linksHeading = authenticatedPage.getByRole('heading', {
      exact: true,
      name: 'Website links',
    });
    const accountsHeading = authenticatedPage.getByRole('heading', {
      exact: true,
      name: 'Accounts',
    });
    await expect(linksHeading).toBeVisible({ timeout: 30000 });
    await expect(accountsHeading).toBeVisible({ timeout: 30000 });

    const linksBox = await linksHeading.boundingBox();
    const accountsBox = await accountsHeading.boundingBox();
    expect(linksBox).not.toBeNull();
    expect(accountsBox).not.toBeNull();
    // Same column as the website links, below them.
    expect(accountsBox?.x).toBeCloseTo(linksBox?.x ?? 0, 0);
    expect(accountsBox?.y ?? 0).toBeGreaterThan(linksBox?.y ?? 0);
  });
});
