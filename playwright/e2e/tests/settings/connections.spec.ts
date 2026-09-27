import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { SettingsPage } from '../../pages/settings.page';
import { orgSettingsRoute } from '../../utils/app-chrome';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

/**
 * E2E Tests for Settings Connections & Sub-Pages
 *
 * CRITICAL: All tests use mocked API responses.
 * No real backend calls occur during tests.
 *
 * Tests verify API keys, models, elements/scenes, and brands UI.
 */
test.describe('Settings Connections & Sub-Pages', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
  });

  test.describe('API Keys Page', () => {
    test('should load API keys page', async ({ authenticatedPage }) => {
      await authenticatedPage.goto(APP_ROUTES.SETTINGS.ORGANIZATION_API_KEYS);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/settings.*api-keys/);
    });

    test('should display API key management UI', async ({
      authenticatedPage,
    }) => {
      // Mock API keys endpoint
      await authenticatedPage.route(
        '**/api.genfeed.ai/*/api-keys**',
        async (route) => {
          if (route.request().method() === 'GET') {
            await route.fulfill({
              body: JSON.stringify({
                data: [
                  {
                    attributes: {
                      createdAt: new Date().toISOString(),
                      key: 'gf_***abc123',
                      name: 'Test API Key',
                    },
                    id: 'key-1',
                    type: 'api-keys',
                  },
                ],
              }),
              contentType: 'application/json',
              status: 200,
            });
            return;
          }
          await route.continue();
        },
      );

      await authenticatedPage.goto(APP_ROUTES.SETTINGS.ORGANIZATION_API_KEYS);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      const mainContent = authenticatedPage.locator(
        'main, [data-testid="main-content"]',
      );
      await expect(mainContent).toBeVisible({ timeout: 15000 });

      await expect(authenticatedPage).toHaveURL(/settings.*api-keys/);
    });

    test('should show the create API key button', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      // APP_ROUTES.SETTINGS.ORGANIZATION_API_KEYS ('/settings/organization/api-keys')
      // is a legacy path that now renders LegacyOrganizationSettingsNotFound
      // (see (pages)/organization/api-keys/page.tsx) — the live page is
      // API_KEYS ('/settings/api-keys', (organization)/api-keys/page.tsx).
      // Navigate with the explicit E2E org slug: the proxy's active-workspace
      // resolution for a bare `/settings/*` path is cached server-side per
      // session and is not deterministic across parallel workers sharing one
      // dev server.
      const route = orgSettingsRoute(APP_ROUTES.SETTINGS.API_KEYS);
      await authenticatedPage.goto(route);
      await authenticatedPage.waitForLoadState('domcontentloaded');
      await assertNoErrorBoundaryFallback(authenticatedPage, route);

      const mainContent = authenticatedPage.locator(
        'main, [data-testid="main-content"]',
      );
      await expect(mainContent).toBeVisible({ timeout: 15000 });

      // Real UI (organization/api-keys/content.tsx): a "Create Key" button,
      // no data-testid.
      await expect(settingsPage.generateApiKeyButton).toBeVisible({
        timeout: 10000,
      });
    });

    test('should handle empty API keys state', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.route(
        '**/api.genfeed.ai/*/api-keys**',
        async (route) => {
          if (route.request().method() === 'GET') {
            await route.fulfill({
              body: JSON.stringify({ data: [] }),
              contentType: 'application/json',
              status: 200,
            });
            return;
          }
          await route.continue();
        },
      );

      await authenticatedPage.goto(APP_ROUTES.SETTINGS.ORGANIZATION_API_KEYS);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/settings.*api-keys/);
    });
  });

  test.describe('Models Page', () => {
    test('should load models page for video type', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(APP_ROUTES.SETTINGS.MODEL_VIDEO);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/settings.*models/);
    });

    test('should load models page for image type', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(APP_ROUTES.SETTINGS.MODEL_IMAGE);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/settings.*models/);
    });

    test('should display model selection UI', async ({ authenticatedPage }) => {
      await authenticatedPage.goto(APP_ROUTES.SETTINGS.MODEL_VIDEO);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      const mainContent = authenticatedPage.locator(
        'main, [data-testid="main-content"]',
      );
      await expect(mainContent).toBeVisible({ timeout: 15000 });
    });

    test('should render on mobile viewport', async ({ authenticatedPage }) => {
      await authenticatedPage.setViewportSize({ height: 667, width: 375 });

      await authenticatedPage.goto(APP_ROUTES.SETTINGS.MODEL_VIDEO);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/settings.*models/);
    });
  });

  test.describe('Elements / Scenes Page', () => {
    test('should load scenes page', async ({ authenticatedPage }) => {
      await authenticatedPage.goto(APP_ROUTES.SETTINGS.ELEMENTS_SCENES);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/settings.*elements.*scenes/);
    });

    test('should display scene library content', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(APP_ROUTES.SETTINGS.ELEMENTS_SCENES);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      const mainContent = authenticatedPage.locator(
        'main, [data-testid="main-content"]',
      );
      await expect(mainContent).toBeVisible({ timeout: 15000 });

      await expect(authenticatedPage).toHaveURL(/settings.*scenes/);
    });

    test('should handle empty scenes state', async ({ authenticatedPage }) => {
      await authenticatedPage.route(
        '**/api.genfeed.ai/*/scenes**',
        async (route) => {
          if (route.request().method() === 'GET') {
            await route.fulfill({
              body: JSON.stringify({ data: [], meta: { totalCount: 0 } }),
              contentType: 'application/json',
              status: 200,
            });
            return;
          }
          await route.continue();
        },
      );

      await authenticatedPage.goto(APP_ROUTES.SETTINGS.ELEMENTS_SCENES);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/settings.*scenes/);
    });

    test('should render on mobile viewport', async ({ authenticatedPage }) => {
      await authenticatedPage.setViewportSize({ height: 667, width: 375 });

      await authenticatedPage.goto(APP_ROUTES.SETTINGS.ELEMENTS_SCENES);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/settings.*scenes/);
    });
  });

  test.describe('Brands Page', () => {
    test('should load brands page', async ({ authenticatedPage }) => {
      await authenticatedPage.goto(APP_ROUTES.SETTINGS.BRANDS);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/settings.*brands/);
    });

    test('should display brand list content', async ({ authenticatedPage }) => {
      await authenticatedPage.goto(APP_ROUTES.SETTINGS.BRANDS);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      const mainContent = authenticatedPage.locator(
        'main, [data-testid="main-content"]',
      );
      await expect(mainContent).toBeVisible({ timeout: 15000 });
    });

    test('should handle empty brands state', async ({ authenticatedPage }) => {
      await authenticatedPage.route(
        '**/api.genfeed.ai/*/brands**',
        async (route) => {
          if (route.request().method() === 'GET') {
            await route.fulfill({
              body: JSON.stringify({ data: [], meta: { totalCount: 0 } }),
              contentType: 'application/json',
              status: 200,
            });
            return;
          }
          await route.continue();
        },
      );

      await authenticatedPage.goto(APP_ROUTES.SETTINGS.BRANDS);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/settings.*brands/);
    });

    test('should render on mobile viewport', async ({ authenticatedPage }) => {
      await authenticatedPage.setViewportSize({ height: 667, width: 375 });

      await authenticatedPage.goto(APP_ROUTES.SETTINGS.BRANDS);
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/settings.*brands/);
    });
  });

  test.describe('Brand Settings Detail', () => {
    test('should load brand voice settings route', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(
        `${APP_ROUTES.SETTINGS.BRANDS}/brand-1/voice`,
      );
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/settings\/brands\/.+\/voice/);
    });

    test('should load brand publishing settings route', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(
        `${APP_ROUTES.SETTINGS.BRANDS}/brand-1/publishing`,
      );
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(
        /settings\/brands\/.+\/publishing/,
      );
    });

    test('should load brand agent defaults route', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto(
        `${APP_ROUTES.SETTINGS.BRANDS}/brand-1/agent-defaults`,
      );
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(
        /settings\/brands\/.+\/agent-defaults/,
      );
    });
  });
});

test.describe('Settings Connections — Unauthenticated Access', () => {
  test('should redirect api-keys page to login', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto(APP_ROUTES.SETTINGS.ORGANIZATION_API_KEYS, {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });

    await expect(unauthenticatedPage).toHaveURL(/login|sign-in/, {
      timeout: 10000,
    });
  });

  test('should redirect brands page to login', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto(APP_ROUTES.SETTINGS.BRANDS, {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });

    await expect(unauthenticatedPage).toHaveURL(/login|sign-in/, {
      timeout: 10000,
    });
  });

  test('should redirect models page to login', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto(APP_ROUTES.SETTINGS.MODEL_VIDEO, {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });

    await expect(unauthenticatedPage).toHaveURL(/login|sign-in/, {
      timeout: 10000,
    });
  });
});
test.describe('Organization Settings', () => {
  test('should load organization general settings', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(APP_ROUTES.SETTINGS.ORGANIZATION);
    await authenticatedPage.waitForLoadState('domcontentloaded');

    await expect(authenticatedPage).toHaveURL(/settings\/organization$/);
  });

  test('should load organization policy settings', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto(APP_ROUTES.SETTINGS.ORGANIZATION_POLICY);
    await authenticatedPage.waitForLoadState('domcontentloaded');

    await expect(authenticatedPage).toHaveURL(/settings\/organization\/policy/);
  });
});
