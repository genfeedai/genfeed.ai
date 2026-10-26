import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { expect, test } from '../../fixtures/auth.fixture';
import { SettingsPage } from '../../pages/settings.page';

/**
 * E2E Tests for the organization Credits route (the shipped billing surface).
 *
 * `/settings/billing` is retired. Credits live at SETTINGS.CREDITS under the
 * org settings shell. The e2e app is built in community mode, where credit
 * reads are gated behind `hasOrganizationBillingHint()`, so the page renders
 * without a wallet balance. Balance, low-credit, cycle and retry states are
 * covered by the Credits page unit tests (`credits/content.test.tsx`) and, on the
 * Cloud build, by `cloud/billing-credits.spec.ts` and
 * `cloud/credits-recovery.spec.ts`.
 */
test.describe('Billing Settings', () => {
  test('should open the credits route under organization settings', async ({
    authenticatedPage,
  }) => {
    const settingsPage = new SettingsPage(authenticatedPage);
    const creditReads: string[] = [];
    authenticatedPage.on('request', (request) => {
      if (/\/subscriptions\/current\/credits/.test(request.url())) {
        creditReads.push(request.url());
      }
    });

    await settingsPage.goToBilling();

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`${APP_ROUTES.SETTINGS.CREDITS}`),
    );
    await expect(
      settingsPage.canvas.getByRole('heading', {
        exact: true,
        level: 1,
        name: 'Credits',
      }),
    ).toBeVisible();
    // Community builds never read a wallet balance.
    expect(creditReads).toEqual([]);
  });

  test('should open the credits route on a mobile viewport', async ({
    authenticatedPage,
  }) => {
    const settingsPage = new SettingsPage(authenticatedPage);

    await authenticatedPage.setViewportSize({ height: 667, width: 375 });
    await settingsPage.goToBilling();

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`${APP_ROUTES.SETTINGS.CREDITS}`),
    );
  });
});
