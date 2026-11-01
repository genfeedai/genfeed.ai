import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Page, Route } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import {
  buildProtectedAppBootstrapPayload,
  generateMockBrand,
} from '../../utils/api-interceptor';
import { brandPath } from '../../utils/app-chrome';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

/**
 * X accounts connected before Genfeed requested `dm.read` keep their old
 * grant, so their DM sync cannot run. The API reports that as
 * `directMessageCapability: 'reconnect'`, and the app must ask for a
 * reconnect in Messages and on the account card instead of staying silent.
 *
 * CRITICAL: All tests use mocked API responses.
 * No real backend calls occur during tests.
 */
const CONNECTED_ACCOUNTS_ROUTE = brandPath(
  APP_ROUTES.SETTINGS.CONNECTED_ACCOUNTS,
);
const MESSAGES_ROUTE = brandPath(APP_ROUTES.MESSAGES.ROOT);

const OLD_GRANT_X_ACCOUNT = {
  brandId: 'brand-1',
  directMessageCapability: 'reconnect',
  externalAvatar: null,
  externalHandle: 'genfeedai',
  externalId: 'x-user-1',
  externalName: 'Genfeed',
  id: 'credential-x-old-grant',
  isConnected: true,
  isDeleted: false,
  label: 'Genfeed',
  platform: 'twitter',
};

const DM_GRANT_X_ACCOUNT = {
  ...OLD_GRANT_X_ACCOUNT,
  directMessageCapability: 'ok',
  externalHandle: 'shipshitdev',
  externalId: 'x-user-2',
  externalName: 'Ship',
  id: 'credential-x-dm-grant',
  label: 'Ship',
};

const brand = generateMockBrand({
  credentials: [OLD_GRANT_X_ACCOUNT, DM_GRANT_X_ACCOUNT],
});

async function mockBrandWithXAccounts(page: Page): Promise<void> {
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

  // Messages reads connected accounts from the protected bootstrap brands.
  await page.route(/\/v1\/auth\/bootstrap(?:\?.*)?$/, async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        ...buildProtectedAppBootstrapPayload(),
        brands: [brand],
      }),
      contentType: 'application/json',
      status: 200,
    });
  });

  await page.route('**/api.genfeed.ai/**/messages**', async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }

    await route.fulfill({
      body: JSON.stringify({
        data: [],
        links: { pagination: { page: 1, pages: 0, total: 0 } },
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

test.describe('Reconnect X to enable DMs', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockBrandWithXAccounts(authenticatedPage);
  });

  test('flags only the X account without DM access on Connected accounts', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(CONNECTED_ACCOUNTS_ROUTE, {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    });
    await assertNoErrorBoundaryFallback(
      authenticatedPage,
      CONNECTED_ACCOUNTS_ROUTE,
    );

    const oldGrantRow = authenticatedPage
      .getByRole('row')
      .filter({ hasText: '@genfeedai' });
    const dmGrantRow = authenticatedPage
      .getByRole('row')
      .filter({ hasText: '@shipshitdev' });

    await expect(oldGrantRow.getByText('DMs need reconnect')).toBeVisible();
    await expect(dmGrantRow.getByText('DMs need reconnect')).toHaveCount(0);

    await oldGrantRow.getByText('@genfeedai').click();

    await expect(
      authenticatedPage.getByText('Reconnect X to enable DMs'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: 'Reconnect X' }),
    ).toBeEnabled();
  });

  test('asks for the reconnect in Messages', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(MESSAGES_ROUTE, {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    });
    await assertNoErrorBoundaryFallback(authenticatedPage, MESSAGES_ROUTE);

    await expect(
      authenticatedPage.getByText('Reconnect X to enable DMs'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText(
        'This X account was connected before Genfeed asked for DM access. Reconnect it to sync direct messages.',
      ),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: 'Reconnect X' }),
    ).toBeVisible();
  });
});
