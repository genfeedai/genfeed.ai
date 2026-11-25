import {
  mockActiveSubscription,
  mockBrandWithMedia,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

// The Profile page mirrors the public profile and adds what only the owner
// needs on its Settings tab: the brand's social accounts (a Connect account
// button in the Accounts header) and its website links, accounts above the
// website links. Like every other section, the website links title
// and action sit above the card.
test.describe('Brand accounts and website links', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockBrandWithMedia(authenticatedPage);
  });

  test('connects accounts from the Accounts header and keeps the links title and action outside the card', async ({
    authenticatedPage,
  }) => {
    const route = brandPath('/settings/profile?tab=settings');
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
    const linksSection = authenticatedPage.getByRole('region', {
      name: 'Website links',
    });
    await expect(
      linksSection.getByRole('button', { name: 'Add link' }),
    ).toBeVisible();
    await expect(
      linksSection
        .locator('.rounded-card')
        .getByRole('heading', { name: 'No website links yet.' }),
    ).toBeVisible();

    await expect(
      authenticatedPage.getByRole('heading', { name: 'Social & links' }),
    ).toHaveCount(0);
  });

  test('lists the connected accounts above the website links', async ({
    authenticatedPage,
  }) => {
    const route = brandPath('/settings/profile?tab=settings');
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
    expect(accountsBox?.x).toBeCloseTo(linksBox?.x ?? 0, 0);
    expect(accountsBox?.y ?? 0).toBeLessThan(linksBox?.y ?? 0);
  });

  test('shows the published articles the public profile shows, and a single visibility control', async ({
    authenticatedPage,
  }) => {
    await mockBrandWithMedia(authenticatedPage, undefined, [
      {
        attributes: {
          createdAt: '2026-11-24T08:00:00.000Z',
          label: 'Token pricing has a half-life',
          publishedAt: '2026-11-24T08:00:00.000Z',
          slug: 'token-pricing-half-life',
          status: 'PUBLISHED',
          summary: 'Every price cut resets the clock.',
        },
        id: 'article-1',
      },
    ]);
    const route = brandPath('/settings/profile');
    await authenticatedPage.goto(route, {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    });
    await assertNoErrorBoundaryFallback(authenticatedPage, route);

    await expect(
      authenticatedPage.getByRole('link', {
        name: 'Open Token pricing has a half-life',
      }),
    ).toBeVisible({ timeout: 30000 });
    await expect(
      authenticatedPage.getByRole('link', { name: /^Articles 1$/ }),
    ).toBeVisible();

    // Copy link and View public profile sit in the same group as the switch,
    // and stay off while the profile is private.
    const visibility = authenticatedPage.getByRole('group', {
      name: 'Profile visibility',
    });
    await expect(
      visibility.getByRole('switch', { name: 'Public Profile' }),
    ).not.toBeChecked();
    await expect(
      visibility.getByRole('button', { name: 'Copy public profile link' }),
    ).toBeDisabled();
    await expect(
      visibility.getByRole('button', { name: 'View public profile' }),
    ).toBeDisabled();
  });

  test('shows the reach line and two tabs, with Connect account only under Settings', async ({
    authenticatedPage,
  }) => {
    const route = brandPath('/settings/profile');
    await authenticatedPage.goto(route, {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    });
    await assertNoErrorBoundaryFallback(authenticatedPage, route);

    await expect(authenticatedPage.getByTestId('metric-summary')).toContainText(
      '1.2K',
      { timeout: 30000 },
    );
    const tabs = authenticatedPage.getByRole('navigation', {
      name: 'Profile sections',
    });
    await expect(tabs.getByRole('link')).toHaveText([/^Articles/, 'Settings']);
    await expect(
      authenticatedPage.getByRole('button', { name: 'Connect account' }),
    ).toHaveCount(0);

    await tabs.getByRole('link', { name: 'Settings' }).click();
    await expect(
      authenticatedPage.getByRole('button', { name: 'Connect account' }),
    ).toBeVisible({ timeout: 30000 });
  });

  test('turns Public analytics off from Settings', async ({
    authenticatedPage,
  }) => {
    const route = brandPath('/settings/profile?tab=settings');
    await authenticatedPage.goto(route, {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    });
    await assertNoErrorBoundaryFallback(authenticatedPage, route);

    const toggle = authenticatedPage.getByRole('switch', {
      name: 'Public analytics',
    });
    await expect(toggle).toBeChecked({ timeout: 30000 });

    await toggle.click();

    await expect(toggle).not.toBeChecked();
    await expect(toggle).toBeEnabled();
  });
});
