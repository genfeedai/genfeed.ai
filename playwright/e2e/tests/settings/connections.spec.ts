import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { IApiKeyAttributes } from '@genfeedai/contracts/interfaces';
import type { Page, Route } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { SettingsPage } from '../../pages/settings.page';
import { brandPath, orgSettingsRoute } from '../../utils/app-chrome';
import { assertRouteRenders } from '../../utils/route-assertions';

/**
 * E2E Tests for Organization Settings, API Keys, Models, Scenes and Brands
 *
 * CRITICAL: All tests use mocked API responses.
 * No real backend calls occur during tests.
 *
 * Every route is a live settings route with the explicit E2E org (or
 * org+brand) slug. The legacy `/settings/organization`, `/organization/policy`
 * and `/organization/api-keys` paths call notFound()
 * (LegacyOrganizationSettingsNotFound), and bare `/settings/brands/:id/*`
 * paths render the 404 page — so each test asserts the surface's real
 * content, never just the URL.
 */
const API_KEYS_ROUTE = orgSettingsRoute(APP_ROUTES.SETTINGS.API_KEYS);
const GENERAL_ROUTE = orgSettingsRoute(APP_ROUTES.SETTINGS.GENERAL);
const AGENTS_ROUTE = orgSettingsRoute(APP_ROUTES.SETTINGS.AGENTS);
const MODELS_ROUTE = orgSettingsRoute(APP_ROUTES.SETTINGS.MODELS);
const SCENES_ROUTE = orgSettingsRoute(APP_ROUTES.SETTINGS.ELEMENTS_SCENES);
const BRANDS_ROUTE = orgSettingsRoute(APP_ROUTES.SETTINGS.BRANDS);

const API_KEYS_PATTERN = '**/api.genfeed.ai/v1/api-keys**';
const BRANDS_LIST_PATTERN = '**/api.genfeed.ai/v1/brands?**';

/** Answer the API key list GET; everything else falls back to the mocks. */
async function mockApiKeyList(
  page: Page,
  response: { status: 200; keys: IApiKeyAttributes[] } | { status: 500 },
): Promise<void> {
  await page.route(API_KEYS_PATTERN, async (route: Route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }

    await route.fulfill({
      body: JSON.stringify(
        response.status === 200
          ? {
              data: response.keys.map((attributes, index) => ({
                attributes,
                id: `api-key-${index + 1}`,
                type: 'api-key',
              })),
              meta: { totalCount: response.keys.length },
            }
          : { errors: [{ status: '500', title: 'Internal Server Error' }] },
      ),
      contentType: 'application/json',
      status: response.status,
    });
  });
}

test.describe('Settings Connections & Sub-Pages', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
  });

  test.describe('API Keys Page', () => {
    test('shows the key creation form and the empty key list', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);
      await mockApiKeyList(authenticatedPage, { keys: [], status: 200 });

      await settingsPage.goToApiKeys();

      await expect(
        settingsPage.canvas.getByRole('heading', {
          exact: true,
          name: 'API keys',
        }),
      ).toBeVisible();
      await expect(settingsPage.generateApiKeyButton).toBeVisible();
      await expect(
        settingsPage.canvas.getByText('No active Genfeed API keys.'),
      ).toBeVisible();
    });

    test('lists existing keys with rotate and revoke actions', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);
      await mockApiKeyList(authenticatedPage, {
        keys: [
          {
            isRevoked: false,
            label: 'Test API Key',
            lastUsedAt: null,
            scopes: ['videos:read'],
          },
        ],
        status: 200,
      });

      await settingsPage.goToApiKeys();

      await expect(
        settingsPage.canvas.getByText('Test API Key', { exact: true }),
      ).toBeVisible();
      await expect(
        settingsPage.canvas.getByText('Last used: Never'),
      ).toBeVisible();
      await expect(
        settingsPage.canvas.getByRole('button', {
          exact: true,
          name: 'Rotate',
        }),
      ).toBeVisible();
      await expect(
        settingsPage.canvas.getByRole('button', {
          exact: true,
          name: 'Revoke',
        }),
      ).toBeVisible();
      await expect(
        settingsPage.canvas.getByText('No active Genfeed API keys.'),
      ).toHaveCount(0);
    });

    test('shows a load error when the key list request fails', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);
      await mockApiKeyList(authenticatedPage, { status: 500 });

      await settingsPage.goToApiKeys();

      await expect(
        settingsPage.canvas.getByText("Couldn't load API keys"),
      ).toBeVisible();
      // Creating a key stays available after a failed load.
      await expect(settingsPage.generateApiKeyButton).toBeVisible();
    });

    test('is reachable from the organization settings sidebar', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);
      await mockApiKeyList(authenticatedPage, { keys: [], status: 200 });

      await settingsPage.goToOrganization();
      await settingsPage.navigateFromSidebar('API Keys', API_KEYS_ROUTE);

      await expect(settingsPage.generateApiKeyButton).toBeVisible();
    });
  });

  test.describe('Models Page', () => {
    test('shows the model catalog and its empty state', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.open(MODELS_ROUTE);

      await expect(
        settingsPage.canvas.getByRole('heading', {
          exact: true,
          name: 'Model catalog',
        }),
      ).toBeVisible();
      await expect(
        settingsPage.canvas.getByRole('combobox', { name: 'Model type' }),
      ).toContainText('Catalog');
      await expect(
        settingsPage.canvas.getByRole('tab', { name: /^All\b/ }),
      ).toHaveAttribute('aria-selected', 'true');
      await expect(
        settingsPage.canvas.getByRole('heading', {
          exact: true,
          name: 'No models found',
        }),
      ).toBeVisible();
    });

    test('filters the catalog to video models', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.open(MODELS_ROUTE);
      await settingsPage.canvas.getByRole('tab', { name: /^Video\b/ }).click();

      await expect(authenticatedPage).toHaveURL(/[?&]type=video(?:&|$)/);
      await expect(
        settingsPage.canvas.getByRole('tab', { name: /^Video\b/ }),
      ).toHaveAttribute('aria-selected', 'true');
      await expect(
        settingsPage.canvas.getByRole('heading', {
          exact: true,
          name: 'No models found',
        }),
      ).toBeVisible();
    });

    test('opens the image model filter directly', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.open(`${MODELS_ROUTE}?type=images`);

      await expect(
        settingsPage.canvas.getByRole('tab', { name: /^Image\b/ }),
      ).toHaveAttribute('aria-selected', 'true');
      await expect(
        settingsPage.canvas.getByRole('heading', {
          exact: true,
          name: 'Model catalog',
        }),
      ).toBeVisible();
    });

    test('should render on mobile viewport', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);
      await authenticatedPage.setViewportSize({ height: 667, width: 375 });

      await settingsPage.open(`${MODELS_ROUTE}?type=videos`);

      await expect(
        settingsPage.canvas.getByRole('tab', { name: /^Video\b/ }),
      ).toHaveAttribute('aria-selected', 'true');
      await expect(
        settingsPage.canvas.getByRole('heading', {
          exact: true,
          name: 'Model catalog',
        }),
      ).toBeVisible();
    });
  });

  test.describe('Elements / Scenes Page', () => {
    test('shows the scenes library empty state', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.open(SCENES_ROUTE);

      await expect(
        settingsPage.canvas.getByRole('heading', {
          exact: true,
          level: 1,
          name: 'Scenes',
        }),
      ).toBeVisible();
      await expect(
        settingsPage.canvas.getByRole('heading', {
          exact: true,
          name: 'No scenes found',
        }),
      ).toBeVisible();
      await expect(settingsPage.canvas.getByText('0 scenes')).toBeVisible();
    });

    test('should render on mobile viewport', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);
      await authenticatedPage.setViewportSize({ height: 667, width: 375 });

      await settingsPage.open(SCENES_ROUTE);

      await expect(
        settingsPage.canvas.getByRole('heading', {
          exact: true,
          name: 'No scenes found',
        }),
      ).toBeVisible();
    });
  });

  test.describe('Brands Page', () => {
    test('lists the organization brands', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.open(BRANDS_ROUTE);

      const brandRow = settingsPage.canvas
        .getByRole('row')
        .filter({ hasText: '@brand-1' });
      await expect(brandRow).toBeVisible();
      await expect(
        brandRow.getByRole('link', { name: 'Open Brand 1 settings' }),
      ).toBeVisible();
      await expect(
        settingsPage.canvas.getByRole('button', {
          exact: true,
          name: 'Add Brand',
        }),
      ).toBeVisible();
    });

    test('shows the empty state when the organization has no brands', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);
      await authenticatedPage.route(BRANDS_LIST_PATTERN, async (route) => {
        if (route.request().method() !== 'GET') {
          await route.fallback();
          return;
        }
        await route.fulfill({
          body: JSON.stringify({ data: [], meta: { totalCount: 0 } }),
          contentType: 'application/json',
          status: 200,
        });
      });

      await settingsPage.open(BRANDS_ROUTE);

      await expect(settingsPage.canvas.getByText('0 brands')).toBeVisible();
      await expect(
        settingsPage.canvas.getByRole('row').filter({ hasText: '@brand-1' }),
      ).toHaveCount(0);
    });

    test('opens a brand settings page from the list', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.open(BRANDS_ROUTE);
      await settingsPage.canvas
        .getByRole('link', { name: 'Open Brand 1 settings' })
        .click();

      await expect(authenticatedPage).toHaveURL(
        new RegExp(`${brandPath(APP_ROUTES.SETTINGS.ROOT)}$`),
      );
      await expect(
        settingsPage.canvas.getByRole('button', {
          exact: true,
          name: 'Edit brand name',
        }),
      ).toContainText('Brand 1');
    });

    test('should render on mobile viewport', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);
      await authenticatedPage.setViewportSize({ height: 667, width: 375 });

      await settingsPage.open(BRANDS_ROUTE);

      await expect(
        settingsPage.canvas.getByRole('heading', {
          exact: true,
          level: 1,
          name: 'Brands',
        }),
      ).toBeVisible();
      await expect(
        settingsPage.canvas.getByRole('row').filter({ hasText: '@brand-1' }),
      ).toBeVisible();
    });
  });

  test.describe('Brand Settings Detail', () => {
    test('shows the brand voice settings', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.open(brandPath('/settings/brand-kit?tab=voice'));

      await expect(
        settingsPage.canvas.getByRole('heading', {
          exact: true,
          name: 'Brand voice',
        }),
      ).toBeVisible();
      await expect(
        settingsPage.canvas.getByRole('heading', {
          exact: true,
          name: 'Voice fields',
        }),
      ).toBeVisible();
    });

    test('shows the brand publishing defaults', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.open(brandPath(APP_ROUTES.SETTINGS.PUBLISHING));

      await expect(
        settingsPage.canvas.getByRole('heading', {
          exact: true,
          name: 'Publishing defaults',
        }),
      ).toBeVisible();
      await expect(
        settingsPage.canvas.getByRole('button', {
          exact: true,
          name: 'Save defaults',
        }),
      ).toBeVisible();
    });

    test('shows the brand agent defaults', async ({ authenticatedPage }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await settingsPage.open(brandPath(APP_ROUTES.SETTINGS.AGENT));

      await expect(
        settingsPage.canvas.getByRole('heading', {
          exact: true,
          name: 'Agent defaults',
        }),
      ).toBeVisible();
      await expect(
        settingsPage.canvas.getByRole('heading', {
          exact: true,
          name: 'Brand identity',
        }),
      ).toBeVisible();
    });
  });
});

test.describe('Organization Settings', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
  });

  test('shows organization general settings', async ({ authenticatedPage }) => {
    const settingsPage = new SettingsPage(authenticatedPage);

    await settingsPage.open(GENERAL_ROUTE);

    await expect(
      settingsPage.canvas.getByRole('heading', {
        exact: true,
        name: 'Organization',
      }),
    ).toBeVisible();
    await expect(
      settingsPage.canvas.getByText('@test-org', { exact: true }),
    ).toBeVisible();
    await expect(settingsPage.orgIdentityCard).toBeVisible();
  });

  test('shows organization agent policy settings', async ({
    authenticatedPage,
  }) => {
    const settingsPage = new SettingsPage(authenticatedPage);

    // The former /settings/organization/policy content now lives at
    // /settings/agents ((organization)/agents/page.tsx).
    await settingsPage.open(AGENTS_ROUTE);

    await expect(
      settingsPage.canvas.getByRole('heading', {
        exact: true,
        name: 'Autonomous Agent Policy',
      }),
    ).toBeVisible();
    await expect(
      settingsPage.canvas.getByRole('heading', {
        exact: true,
        name: 'Credit Governance',
      }),
    ).toBeVisible();
  });
});

test.describe('Settings Connections — Unauthenticated Access', () => {
  for (const route of [API_KEYS_ROUTE, BRANDS_ROUTE, MODELS_ROUTE]) {
    test(`redirects ${route} to login`, async ({ unauthenticatedPage }) => {
      await assertRouteRenders(unauthenticatedPage, route, {
        allowRedirectToLogin: true,
      });

      await expect(unauthenticatedPage).toHaveURL(/\/login\?callbackUrl=/);
    });
  }
});
