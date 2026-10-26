import { SubscriptionStatus } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  mockActiveSubscription,
  mockExpiredSubscription,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { SettingsPage } from '../../pages/settings.page';

/**
 * E2E Tests for organization Credits (the shipped billing surface) on the
 * Cloud build (`NEXT_PUBLIC_GENFEED_CLOUD=true`).
 *
 * Runs in the `e2e-cloud-billing` job of playwright-full-nightly.yml. The
 * Community-built full tier gates credit reads behind
 * `hasOrganizationBillingHint()`; its zero-read behavior is asserted in
 * `settings/billing.spec.ts`.
 *
 * `/settings/billing` is retired. Credits live at SETTINGS.CREDITS under the
 * org settings shell. All Stripe / payment processing is mocked.
 */
test.describe('Billing Settings (Cloud)', () => {
  test.describe('Page Load', () => {
    test('should display the credits section', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await mockActiveSubscription(authenticatedPage, {
        credits: 1000,
        plan: 'pro',
      });

      await settingsPage.goToBilling();

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${APP_ROUTES.SETTINGS.CREDITS}`),
      );
      await expect(authenticatedPage.getByText('Credits Left')).toBeVisible();
      // Org billing sells packs under "Add credits"; "Buy credits" is the
      // community managed-checkout heading, which this build must not show.
      await expect(
        authenticatedPage.getByRole('heading', { name: 'Add credits' }),
      ).toBeVisible();
      await expect(authenticatedPage.getByText('Buy credits')).toHaveCount(0);
    });

    test('should display current credit balance', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await mockActiveSubscription(authenticatedPage, { credits: 500 });

      await settingsPage.goToBilling();

      await expect(authenticatedPage.getByText('Credits Left')).toBeVisible();
      await expect(
        settingsPage.canvas.getByText('500of 625', { exact: true }),
      ).toBeVisible();
    });

    test('should display credit cycle context', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await mockActiveSubscription(authenticatedPage, {
        credits: 1000,
        plan: 'pro',
      });

      await settingsPage.goToBilling();

      await expect(
        authenticatedPage.getByText(
          "Based on this cycle's total: subscription credits plus packs bought this cycle.",
          { exact: true },
        ),
      ).toBeVisible();
    });
  });

  test.describe('Low credits', () => {
    test('should show a low credits warning', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await mockActiveSubscription(authenticatedPage, {
        credits: 10,
        plan: 'pro',
      });

      await settingsPage.goToBilling();

      await expect(
        authenticatedPage.getByText(/Low credits warning/i),
      ).toBeVisible();
    });
  });

  test.describe('Expired Subscription', () => {
    test('should still render credits after an expired subscription', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      const { servedOrganizationSubscriptions } =
        await mockExpiredSubscription(authenticatedPage);

      await settingsPage.goToBilling();
      await expect
        .poll(() => servedOrganizationSubscriptions.length)
        .toBeGreaterThan(0);
      const subscriptionDocument = servedOrganizationSubscriptions[0];
      expect(subscriptionDocument.data?.attributes.status).toBe(
        SubscriptionStatus.CANCELLED,
      );
      expect(
        Date.parse(
          subscriptionDocument.data?.attributes.currentPeriodEnd ?? '',
        ),
      ).toBeLessThan(Date.now());

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${APP_ROUTES.SETTINGS.CREDITS}`),
      );
      await expect(authenticatedPage.locator('body')).toBeVisible();
      await expect(authenticatedPage.getByText('Credits Left')).toBeVisible();
    });
  });

  test.describe('Error Handling', () => {
    test('should explain a failed credit balance read', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);
      let creditReads = 0;

      await mockActiveSubscription(authenticatedPage, { credits: 500 });
      await authenticatedPage.route(
        '**/v1/subscriptions/current/credits',
        async (route) => {
          creditReads += 1;
          await route.fulfill({
            body: JSON.stringify({
              errors: [{ title: 'Internal Server Error' }],
            }),
            contentType: 'application/json',
            status: 500,
          });
        },
      );

      await settingsPage.goToBilling();

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${APP_ROUTES.SETTINGS.CREDITS}`),
      );
      await expect(
        settingsPage.canvas.getByText(
          'Your credit balance could not be loaded.',
        ),
      ).toBeVisible();
      expect(creditReads).toBeGreaterThan(0);
    });
  });

  test.describe('Responsive Design', () => {
    test('should display credits on mobile viewport', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await mockActiveSubscription(authenticatedPage, { plan: 'pro' });

      await authenticatedPage.setViewportSize({ height: 667, width: 375 });

      await settingsPage.goToBilling();

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${APP_ROUTES.SETTINGS.CREDITS}`),
      );
    });
  });
});
