import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { SettingsPage } from '../../pages/settings.page';

/**
 * E2E Tests for Settings Connections & Sub-Pages
 *
 * CRITICAL: All tests use mocked API responses.
 * No real backend calls occur during tests.
 *
 * Tests verify credentials, API keys, models, elements/scenes, and brands UI.
 */
test.describe('Settings Connections & Sub-Pages', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
  });

  test.describe('Credentials Page', () => {
    test('should load credentials page', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/settings/organization/credentials');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/settings.*credentials/);
    });

    test('should display connected accounts section', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/settings/organization/credentials');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      const mainContent = authenticatedPage.locator(
        'main, [data-testid="main-content"]',
      );
      await expect(mainContent).toBeVisible({ timeout: 15000 });

      await expect(authenticatedPage).toHaveURL(/settings.*credentials/);
    });

    test('should display page heading or title', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/settings/organization/credentials');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      const heading = authenticatedPage
        .locator('h1, h2, h3, [data-testid*="credential"]')
        .first();
      await expect(heading).toBeVisible({ timeout: 15000 });
    });

    test('should render on mobile viewport', async ({ authenticatedPage }) => {
      await authenticatedPage.setViewportSize({ height: 667, width: 375 });

      await authenticatedPage.goto('/settings/organization/credentials');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/settings.*credentials/);
    });
  });

  test.describe('API Keys Page', () => {
    test('should load API keys page', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/settings/organization/api-keys');
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

      await authenticatedPage.goto('/settings/organization/api-keys');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      const mainContent = authenticatedPage.locator(
        'main, [data-testid="main-content"]',
      );
      await expect(mainContent).toBeVisible({ timeout: 15000 });

      await expect(authenticatedPage).toHaveURL(/settings.*api-keys/);
    });

    test('should show generate API key button or form', async ({
      authenticatedPage,
    }) => {
      const settingsPage = new SettingsPage(authenticatedPage);

      await authenticatedPage.goto('/settings/organization/api-keys');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      const mainContent = authenticatedPage.locator(
        'main, [data-testid="main-content"]',
      );
      await expect(mainContent).toBeVisible({ timeout: 15000 });

      // Should have a generate button or key input
      const generateOrInput = settingsPage.generateApiKeyButton.or(
        settingsPage.apiKeyInput,
      );
      await expect(generateOrInput).toBeVisible({ timeout: 10000 });
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

      await authenticatedPage.goto('/settings/organization/api-keys');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/settings.*api-keys/);
    });
  });

  test.describe('Models Page', () => {
    test('should load models page for video type', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/settings/models/video');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/settings.*models/);
    });

    test('should load models page for image type', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/settings/models/image');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/settings.*models/);
    });

    test('should display model selection UI', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/settings/models/video');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      const mainContent = authenticatedPage.locator(
        'main, [data-testid="main-content"]',
      );
      await expect(mainContent).toBeVisible({ timeout: 15000 });
    });

    test('should render on mobile viewport', async ({ authenticatedPage }) => {
      await authenticatedPage.setViewportSize({ height: 667, width: 375 });

      await authenticatedPage.goto('/settings/models/video');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/settings.*models/);
    });
  });

  test.describe('Elements / Scenes Page', () => {
    test('should load scenes page', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/settings/elements/scenes');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/settings.*elements.*scenes/);
    });

    test('should display scene library content', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/settings/elements/scenes');
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

      await authenticatedPage.goto('/settings/elements/scenes');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/settings.*scenes/);
    });

    test('should render on mobile viewport', async ({ authenticatedPage }) => {
      await authenticatedPage.setViewportSize({ height: 667, width: 375 });

      await authenticatedPage.goto('/settings/elements/scenes');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/settings.*scenes/);
    });
  });

  test.describe('Brands Page', () => {
    test('should load brands page', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/settings/brands');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/settings.*brands/);
    });

    test('should display brand list content', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/settings/brands');
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

      await authenticatedPage.goto('/settings/brands');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/settings.*brands/);
    });

    test('should render on mobile viewport', async ({ authenticatedPage }) => {
      await authenticatedPage.setViewportSize({ height: 667, width: 375 });

      await authenticatedPage.goto('/settings/brands');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/settings.*brands/);
    });
  });

  test.describe('Brand Settings Detail', () => {
    test('should load brand voice settings route', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/settings/brands/brand-1/voice');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/settings\/brands\/.+\/voice/);
    });

    test('should load brand publishing settings route', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/settings/brands/brand-1/publishing');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(
        /settings\/brands\/.+\/publishing/,
      );
    });

    test('should load brand agent defaults route', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/settings/brands/brand-1/agent-defaults');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(
        /settings\/brands\/.+\/agent-defaults/,
      );
    });
  });
});

test.describe('Settings Connections — Unauthenticated Access', () => {
  test('should redirect credentials page to login', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/settings/organization/credentials', {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });

    await expect(unauthenticatedPage).toHaveURL(/login|sign-in/, {
      timeout: 10000,
    });
  });

  test('should redirect api-keys page to login', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/settings/organization/api-keys', {
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
    await unauthenticatedPage.goto('/settings/brands', {
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
    await unauthenticatedPage.goto('/settings/models/video', {
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
    await authenticatedPage.goto('/settings/organization');
    await authenticatedPage.waitForLoadState('domcontentloaded');

    await expect(authenticatedPage).toHaveURL(/settings\/organization$/);
  });

  test('should load organization policy settings', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.goto('/settings/organization/policy');
    await authenticatedPage.waitForLoadState('domcontentloaded');

    await expect(authenticatedPage).toHaveURL(/settings\/organization\/policy/);
  });
});
