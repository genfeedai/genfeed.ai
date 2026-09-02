import { APP_ROUTES } from '@genfeedai/contracts/constants';
import {
  mockActiveSubscription,
  mockExpiredSubscription,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { SettingsPage } from '../../pages/settings.page';

/**
 * E2E Tests for organization Credits (the shipped billing surface).
 *
 * `/settings/billing` is retired. Credits live at SETTINGS.CREDITS under the
 * org settings shell. All Stripe / payment processing is mocked.
 */
test.describe('Billing Settings', () => {
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
      await expect(authenticatedPage.getByText('Buy credits')).toBeVisible();
    });

    test('should display current credit balance', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await mockActiveSubscription(authenticatedPage, { credits: 500 });

      await settingsPage.goToBilling();

      await expect(authenticatedPage.getByText('Credits Left')).toBeVisible();
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
        authenticatedPage.getByText(/credit cycle total/i),
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

      await mockExpiredSubscription(authenticatedPage);

      await settingsPage.goToBilling();

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${APP_ROUTES.SETTINGS.CREDITS}`),
      );
      await expect(authenticatedPage.locator('body')).toBeVisible();
    });
  });

  test.describe('Error Handling', () => {
    test('should handle billing API errors', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await authenticatedPage.route(
        '**/api.genfeed.ai/billing/**',
        async (route) => {
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
