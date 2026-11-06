import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Page, Route } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { generateMockBrand } from '../../utils/api-interceptor';
import { brandPath } from '../../utils/app-chrome';
import { exactUrlPattern } from '../../utils/exact-url';

const CONNECTED_ACCOUNTS_ROUTE = brandPath(
  APP_ROUTES.SETTINGS.CONNECTED_ACCOUNTS,
);

async function mockBrandWithXAccount(page: Page): Promise<void> {
  const brand = generateMockBrand({
    credentials: [
      {
        externalAvatar: null,
        externalHandle: 'GenfeedAI',
        externalId: 'x-user-1',
        externalName: 'Genfeed.ai',
        id: 'credential-x-1',
        isConnected: true,
        isDeleted: false,
        label: 'Genfeed.ai',
        platform: 'twitter',
      },
    ],
  });

  const fulfillBrand = async (route: Route): Promise<void> => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }
    await route.fulfill({
      body: JSON.stringify({
        data: { attributes: brand, id: brand.id, type: 'brand' },
      }),
      contentType: 'application/json',
      status: 200,
    });
  };

  await page.route('**/api.genfeed.ai/**/brands/slug**', fulfillBrand);
  await page.route('**/api.genfeed.ai/**/brands/brand-1', fulfillBrand);
}

async function mockXVerify(page: Page): Promise<void> {
  await page.route('**/services/twitter/verify**', async (route: Route) => {
    await route.fulfill({
      body: JSON.stringify({
        data: {
          attributes: { isConnected: true, platform: 'twitter' },
          id: 'credential-x-1',
          type: 'credential',
        },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

test.describe('Connected accounts after the OAuth redirect', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockBrandWithXAccount(authenticatedPage);
    await mockXVerify(authenticatedPage);
  });

  test('lands on the accounts table, not a spinner', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.addInitScript((returnTo: string) => {
      window.sessionStorage.setItem('oauth_return_to', returnTo);
    }, CONNECTED_ACCOUNTS_ROUTE);

    await authenticatedPage.goto(
      `${APP_ROUTES.OAUTH}/twitter?code=code-1&state=state-1`,
      { timeout: 60000, waitUntil: 'domcontentloaded' },
    );

    // The callback returns to the stored route exactly (renamed to
    // /settings/accounts in #9387).
    await expect(authenticatedPage).toHaveURL(
      exactUrlPattern(CONNECTED_ACCOUNTS_ROUTE, authenticatedPage.url()),
      { timeout: 30000 },
    );
    const table = authenticatedPage.getByRole('table', {
      name: 'Connected accounts',
    });
    await expect(table).toBeVisible({ timeout: 20000 });
    await expect(table.getByText('@GenfeedAI')).toBeVisible();
    await expect(table.getByText('Connected', { exact: true })).toBeVisible();
  });
});
