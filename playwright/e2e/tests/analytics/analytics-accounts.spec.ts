import { expect, test } from '../../fixtures/auth.fixture';
import { assertRouteRenders, tryClick } from '../../utils/route-assertions';

const BRAND = '/test-org/brand-1';

test.describe('Analytics — Accounts', () => {
  test.setTimeout(60_000);

  const routes = [
    `${BRAND}/analytics/accounts`,
    `${BRAND}/analytics/accounts/mock-id`,
  ];

  for (const route of routes) {
    test(`renders ${route}`, async ({ authenticatedPage }) => {
      await assertRouteRenders(authenticatedPage, route);
    });
  }

  test('fleet table stays interactive after exercising controls', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BRAND}/analytics/accounts`);

    await tryClick(authenticatedPage, '[aria-label="Search accounts"]');
    await tryClick(authenticatedPage, '[aria-label="Rank by metric"]');
    await tryClick(authenticatedPage, 'button:has-text("Save evaluation")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
  });

  test('account drill-down exposes Manage account', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${BRAND}/analytics/accounts/mock-id`,
    );

    await tryClick(authenticatedPage, 'button:has-text("Manage account")');
    await expect(authenticatedPage.locator('body')).toBeVisible();
  });

  test('an X account shows its activity and growth with every limit stated', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${BRAND}/analytics/accounts/mock-x-id`,
    );

    await expect(
      authenticatedPage.getByRole('heading', { name: 'X activity and growth' }),
    ).toBeVisible();
    await expect(authenticatedPage.getByText('+50 followers')).toBeVisible();
    await expect(
      authenticatedPage.getByText(/does not show that any post or reply/),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('link', { name: 'Mock quote publication' }),
    ).toHaveAttribute('href', 'https://x.com/mock/status/1');
    await expect(
      authenticatedPage.getByText('Mock reply publication'),
    ).toBeVisible();
    await expect(authenticatedPage.getByText('No send receipt')).toBeVisible();
    await expect(
      authenticatedPage.getByText(/no tracked-link journey is connected/),
    ).toBeVisible();
  });

  test('a non-X account does not show the X report', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${BRAND}/analytics/accounts/mock-id`,
    );

    await expect(
      authenticatedPage.getByRole('heading', { name: 'X activity and growth' }),
    ).toHaveCount(0);
  });
});
