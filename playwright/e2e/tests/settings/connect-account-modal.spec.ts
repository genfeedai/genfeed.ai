import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Page, Route } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { generateMockBrand } from '../../utils/api-interceptor';
import { brandPath } from '../../utils/app-chrome';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

/**
 * E2E tests for the Connect account modal on brand Connected accounts.
 *
 * CRITICAL: All tests use mocked API responses.
 * No real backend calls occur during tests.
 */
const CONNECTED_ACCOUNTS_ROUTE = brandPath(
  APP_ROUTES.SETTINGS.CONNECTED_ACCOUNTS,
);

/** Brand with one live X account, so its tile shows the connected state. */
async function mockBrandWithXAccount(page: Page): Promise<void> {
  const brand = generateMockBrand({
    credentials: [
      {
        externalAvatar: null,
        externalHandle: 'genfeedai',
        externalId: 'x-user-1',
        externalName: 'Genfeed',
        id: 'credential-x-1',
        isConnected: true,
        isDeleted: false,
        label: 'Genfeed',
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

test.describe('Connect account modal', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
    await mockBrandWithXAccount(authenticatedPage);
    await authenticatedPage.goto(CONNECTED_ACCOUNTS_ROUTE, {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    });
    await assertNoErrorBoundaryFallback(
      authenticatedPage,
      CONNECTED_ACCOUNTS_ROUTE,
    );
    await authenticatedPage
      .getByRole('button', { name: 'Connect account' })
      .first()
      .click();
  });

  test('lists platforms by category as tiles, with X instead of Twitter', async ({
    authenticatedPage,
  }) => {
    const dialog = authenticatedPage.getByRole('dialog', {
      name: 'Connect account',
    });

    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Social networks')).toBeVisible();
    await expect(dialog.getByText('Video')).toBeVisible();
    await expect(dialog.getByText('Instagram')).toBeVisible();
    await expect(dialog.getByText('Twitter')).toHaveCount(0);
  });

  test('marks a platform that already has an account as connected', async ({
    authenticatedPage,
  }) => {
    const dialog = authenticatedPage.getByRole('dialog', {
      name: 'Connect account',
    });

    await expect(dialog.getByText('1 connected')).toBeVisible();
    await expect(dialog.getByText('X', { exact: true })).toBeVisible();
  });

  test('narrows the tiles with search and explains an empty result', async ({
    authenticatedPage,
  }) => {
    const dialog = authenticatedPage.getByRole('dialog', {
      name: 'Connect account',
    });
    const search = dialog.getByRole('textbox', { name: 'Search platforms…' });

    await search.fill('youtube');
    await expect(dialog.getByText('YouTube')).toBeVisible();
    await expect(dialog.getByText('Instagram')).toHaveCount(0);

    await search.fill('no-such-platform');
    await expect(dialog.getByText('No platforms found.')).toBeVisible();
  });

  test('lists Ghost under Publishing and connects it with a site URL and Admin API key', async ({
    authenticatedPage,
  }) => {
    let connectBody: Record<string, string> | null = null;
    await authenticatedPage.route(
      '**/api.genfeed.ai/**/services/ghost/connect',
      async (route) => {
        connectBody = route.request().postDataJSON();
        await route.fulfill({
          body: JSON.stringify({
            data: {
              attributes: {
                externalId: 'https://example-blog.com',
                externalName: 'Example Blog',
                isConnected: true,
                platform: 'ghost',
              },
              id: 'credential-ghost-1',
              type: 'credential',
            },
          }),
          contentType: 'application/json',
          status: 200,
        });
      },
    );
    const dialog = authenticatedPage.getByRole('dialog', {
      name: 'Connect account',
    });

    await expect(dialog.getByText('Publishing')).toBeVisible();
    await dialog
      .getByRole('textbox', { name: 'Search platforms…' })
      .fill('ghost');
    await dialog.getByRole('button', { name: /Ghost/ }).click();

    const form = authenticatedPage.getByRole('dialog', {
      name: 'Connect Ghost',
    });
    await expect(form).toBeVisible();
    await expect(
      form.getByRole('button', { name: 'Connect Ghost' }),
    ).toBeDisabled();

    await form.getByLabel(/Site URL/).fill('https://example-blog.com');
    await form.getByLabel(/Admin API key/).fill('abc123:def456');
    await form.getByRole('button', { name: 'Connect Ghost' }).click();

    await expect(form).toBeHidden();
    expect(connectBody).toMatchObject({
      apiKey: 'abc123:def456',
      ghostUrl: 'https://example-blog.com',
    });
  });
});
