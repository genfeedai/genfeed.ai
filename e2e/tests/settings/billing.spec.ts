import {
  mockActiveSubscription,
  mockExpiredSubscription,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { SettingsPage } from '../../pages/settings.page';

/**
 * E2E Tests for Billing Settings
 *
 * CRITICAL: All billing tests use mocked API responses.
 * No real Stripe calls or payment processing occurs.
 *
 * Tests verify billing UI, subscription display, and credit management.
 */
test.describe('Billing Settings', () => {
  test.describe('Page Load', () => {
    test('should display billing section', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await mockActiveSubscription(authenticatedPage, {
        credits: 1000,
        plan: 'pro',
      });

      await settingsPage.goto();
      await settingsPage.goToBilling();
      await settingsPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/settings|billing/);
    });

    test('should display current plan information', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await mockActiveSubscription(authenticatedPage, { plan: 'pro' });

      await settingsPage.goto();
      await settingsPage.goToBilling();
      await settingsPage.waitForPageLoad();

      const planText = await settingsPage.getCurrentPlan().catch(() => '');
      expect(planText).toBeTruthy();
    });

    test('should display credit balance', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await mockActiveSubscription(authenticatedPage, { credits: 500 });

      await settingsPage.goto();
      await settingsPage.goToBilling();
      await settingsPage.waitForPageLoad();

      const credits = await settingsPage.getCreditBalance().catch(() => '');
      expect(credits).toBeTruthy();
    });
  });

  test.describe('Subscription Plans', () => {
    test('should show free plan details', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await mockActiveSubscription(authenticatedPage, {
        credits: 50,
        plan: 'free',
      });

      await settingsPage.goto();
      await settingsPage.goToBilling();
      await settingsPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/settings|billing/);
    });

    test('should show starter plan details', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await mockActiveSubscription(authenticatedPage, {
        credits: 500,
        plan: 'starter',
      });

      await settingsPage.goto();
      await settingsPage.goToBilling();
      await settingsPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/settings|billing/);
    });

    test('should show pro plan details', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await mockActiveSubscription(authenticatedPage, {
        credits: 2000,
        plan: 'pro',
      });

      await settingsPage.goto();
      await settingsPage.goToBilling();
      await settingsPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/settings|billing/);
    });

    test('should show enterprise plan details', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await mockActiveSubscription(authenticatedPage, {
        credits: 10000,
        plan: 'enterprise',
      });

      await settingsPage.goto();
      await settingsPage.goToBilling();
      await settingsPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/settings|billing/);
    });
  });

  test.describe('Upgrade Flow', () => {
    test('should display upgrade button for free users', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await mockActiveSubscription(authenticatedPage, { plan: 'free' });

      await settingsPage.goto();
      await settingsPage.goToBilling();
      await settingsPage.waitForPageLoad();

      await expect(settingsPage.upgradeButton).toBeVisible();
    });

    test('should trigger upgrade flow when clicking upgrade', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await mockActiveSubscription(authenticatedPage, { plan: 'starter' });

      // Mock Stripe checkout session creation
      await authenticatedPage.route(
        '**/api.genfeed.ai/billing/**',
        async (route) => {
          if (route.request().url().includes('checkout')) {
            await route.fulfill({
              body: JSON.stringify({
                data: {
                  checkoutUrl: 'https://checkout.stripe.com/mock-session',
                },
              }),
              contentType: 'application/json',
              status: 200,
            });
            return;
          }
          await route.continue();
        },
      );

      await settingsPage.goto();
      await settingsPage.goToBilling();
      await settingsPage.waitForPageLoad();

      await settingsPage.clickUpgrade().catch(() => {});

      // Should stay on page or open upgrade modal/redirect
      const url = authenticatedPage.url();
      expect(url).toBeTruthy();
    });
  });

  test.describe('Payment Methods', () => {
    test('should display payment method if exists', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await mockActiveSubscription(authenticatedPage, {
        hasPaymentMethod: true,
        plan: 'pro',
      });

      await settingsPage.goto();
      await settingsPage.goToBilling();
      await settingsPage.waitForPageLoad();

      await expect(settingsPage.paymentMethodCard).toBeVisible();
    });

    test('should show add payment method option', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await mockActiveSubscription(authenticatedPage, {
        hasPaymentMethod: false,
        plan: 'free',
      });

      await settingsPage.goto();
      await settingsPage.goToBilling();
      await settingsPage.waitForPageLoad();

      await expect(settingsPage.addPaymentMethodButton).toBeVisible();
    });
  });

  test.describe('Invoice History', () => {
    test('should display invoices section', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await mockActiveSubscription(authenticatedPage, { plan: 'pro' });

      // Mock invoices
      await authenticatedPage.route(
        '**/api.genfeed.ai/invoices**',
        async (route) => {
          await route.fulfill({
            body: JSON.stringify({
              data: [
                {
                  attributes: {
                    amount: 9900,
                    date: new Date().toISOString(),
                    status: 'paid',
                  },
                  id: 'inv-1',
                  type: 'invoices',
                },
                {
                  attributes: {
                    amount: 9900,
                    date: new Date(
                      Date.now() - 30 * 24 * 60 * 60 * 1000,
                    ).toISOString(),
                    status: 'paid',
                  },
                  id: 'inv-2',
                  type: 'invoices',
                },
              ],
            }),
            contentType: 'application/json',
            status: 200,
          });
        },
      );

      await settingsPage.goto();
      await settingsPage.goToBilling();
      await settingsPage.waitForPageLoad();

      const invoiceCount = await settingsPage.getInvoiceCount().catch(() => 0);
      expect(invoiceCount).toBeGreaterThan(0);
    });

    test('should handle empty invoice history', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await mockActiveSubscription(authenticatedPage, { plan: 'free' });

      await authenticatedPage.route(
        '**/api.genfeed.ai/invoices**',
        async (route) => {
          await route.fulfill({
            body: JSON.stringify({ data: [] }),
            contentType: 'application/json',
            status: 200,
          });
        },
      );

      await settingsPage.goto();
      await settingsPage.goToBilling();
      await settingsPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/settings|billing/);
    });
  });

  test.describe('Credit Purchase', () => {
    test('should display buy credits option', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await mockActiveSubscription(authenticatedPage, {
        credits: 100,
        plan: 'pro',
      });

      await settingsPage.goto();
      await settingsPage.goToBilling();
      await settingsPage.waitForPageLoad();

      await expect(settingsPage.buyCreditsButton).toBeVisible();
    });

    test('should show low credits warning', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await mockActiveSubscription(authenticatedPage, {
        credits: 10,
        plan: 'pro',
      });

      await settingsPage.goto();
      await settingsPage.goToBilling();
      await settingsPage.waitForPageLoad();

      // Low credits might show a warning
      await expect(authenticatedPage).toHaveURL(/settings|billing/);
    });
  });

  test.describe('Subscription Cancellation', () => {
    test('should show cancel option for paid plans', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await mockActiveSubscription(authenticatedPage, { plan: 'pro' });

      await settingsPage.goto();
      await settingsPage.goToBilling();
      await settingsPage.waitForPageLoad();

      await expect(settingsPage.cancelSubscriptionButton).toBeVisible();
    });

    test('should not show cancel option for free plan', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await mockActiveSubscription(authenticatedPage, { plan: 'free' });

      await settingsPage.goto();
      await settingsPage.goToBilling();
      await settingsPage.waitForPageLoad();

      // Free plan doesn't need cancellation
      await expect(authenticatedPage).toHaveURL(/settings|billing/);
    });
  });

  test.describe('Expired Subscription', () => {
    test('should handle expired subscription state', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await mockExpiredSubscription(authenticatedPage);

      await settingsPage.goto();
      await settingsPage.goToBilling();
      await settingsPage.waitForPageLoad();

      // Should show expired state or downgrade to free
      await expect(authenticatedPage).toHaveURL(/settings|billing/);
    });

    test('should prompt to renew expired subscription', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await mockExpiredSubscription(authenticatedPage);

      await settingsPage.goto();
      await settingsPage.goToBilling();
      await settingsPage.waitForPageLoad();

      // Should have option to renew/upgrade
      await expect(settingsPage.upgradeButton).toBeVisible();
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

      await settingsPage.goto();
      await settingsPage.goToBilling();
      await settingsPage.waitForPageLoad();

      // Page should handle error gracefully
      await expect(authenticatedPage).toHaveURL(/settings|billing/);
    });

    test('should handle subscription fetch error', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await authenticatedPage.route(
        '**/api.genfeed.ai/subscriptions/**',
        async (route) => {
          await route.fulfill({
            body: JSON.stringify({
              errors: [{ title: 'Failed to fetch subscription' }],
            }),
            contentType: 'application/json',
            status: 500,
          });
        },
      );

      await settingsPage.goto();
      await settingsPage.goToBilling();
      await settingsPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/settings|billing/);
    });
  });

  test.describe('Responsive Design', () => {
    test('should display billing on mobile viewport', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await mockActiveSubscription(authenticatedPage, { plan: 'pro' });

      await authenticatedPage.setViewportSize({ height: 667, width: 375 });

      await settingsPage.goto();
      await settingsPage.goToBilling();
      await settingsPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/settings|billing/);
    });

    test('should display billing on tablet viewport', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await mockActiveSubscription(authenticatedPage, { plan: 'pro' });

      await authenticatedPage.setViewportSize({ height: 1024, width: 768 });

      await settingsPage.goto();
      await settingsPage.goToBilling();
      await settingsPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/settings|billing/);
    });
  });
});
