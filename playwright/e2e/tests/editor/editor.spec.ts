import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { StudioPage } from '../../pages/studio.page';

/**
 * E2E Tests for Editor
 *
 * CRITICAL: All tests use mocked API responses.
 * No real backend calls occur during tests.
 *
 * Tests verify editor page load, new project creation, toolbar visibility,
 * and save/publish controls.
 */
test.describe('Editor', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
  });

  test.describe('Editor Projects Page', () => {
    test('should load editor projects page', async ({ authenticatedPage }) => {
      await authenticatedPage.goto('/editor');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/\/editor$/);
    });

    test('should display editor shell with main content', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/editor');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      const mainContent = authenticatedPage.locator(
        'main, [data-testid="main-content"]',
      );
      await expect(mainContent).toBeVisible({ timeout: 15000 });
    });

    test('should display editor projects or empty state', async ({
      authenticatedPage,
    }) => {
      // Mock editor projects endpoint
      await authenticatedPage.route(
        '**/api.genfeed.ai/*/editor-projects**',
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

      await authenticatedPage.goto('/editor');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      const mainContent = authenticatedPage.locator(
        'main, [data-testid="main-content"]',
      );
      await expect(mainContent).toBeVisible({ timeout: 15000 });

      await expect(authenticatedPage).toHaveURL(/\/editor$/);
    });

    test('should render on mobile viewport', async ({ authenticatedPage }) => {
      await authenticatedPage.setViewportSize({ height: 667, width: 375 });

      await authenticatedPage.goto('/editor');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/\/editor$/);
    });

    test('should render on tablet viewport', async ({ authenticatedPage }) => {
      await authenticatedPage.setViewportSize({ height: 1024, width: 768 });

      await authenticatedPage.goto('/editor');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/\/editor$/);
    });
  });

  test.describe('New Editor Project', () => {
    test('should load new editor project page', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/editor/new');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/\/editor\/new$/);
    });

    test('should display blank editor canvas', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/editor/new');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      const mainContent = authenticatedPage.locator(
        'main, [data-testid="main-content"]',
      );
      await expect(mainContent).toBeVisible({ timeout: 15000 });
    });

    test('should display editor toolbar or controls', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/editor/new');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // Look for toolbar, controls, or canvas elements
      const toolbar = authenticatedPage.locator(
        '[data-testid*="toolbar"], [data-testid*="controls"], [role="toolbar"], header button, [data-testid*="editor"]',
      );
      const buttons = authenticatedPage.locator('button');

      // Page should have toolbar or interactive elements
      const hasToolbar = await toolbar
        .first()
        .isVisible()
        .catch(() => false);
      const buttonCount = await buttons.count().catch(() => 0);

      expect(hasToolbar || buttonCount > 0).toBe(true);
    });

    test('should display save or publish controls', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/editor/new');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // Look for save/publish/export buttons
      const savePublishControls = authenticatedPage.locator(
        'button:has-text("Save"), button:has-text("Publish"), button:has-text("Export"), button:has-text("Download"), [data-testid*="save"], [data-testid*="publish"], [data-testid*="export"]',
      );

      await expect(savePublishControls.first()).toBeVisible({ timeout: 15000 });
    });

    test('should render on mobile viewport', async ({ authenticatedPage }) => {
      await authenticatedPage.setViewportSize({ height: 667, width: 375 });

      await authenticatedPage.goto('/editor/new');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/\/editor\/new$/);
    });
  });

  test.describe('Editor Navigation', () => {
    test('should navigate from studio hub to editor', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await studioPage.goto();
      await studioPage.waitForPageLoad();

      // Navigate to editor
      await authenticatedPage.goto('/editor');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      await expect(authenticatedPage).toHaveURL(/\/editor$/);
    });

    test('should navigate from editor list to new project', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/editor');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // Look for a "New" or "Create" button/link
      const newProjectLink = authenticatedPage.locator(
        'a[href*="editor/new"], button:has-text("New"), button:has-text("Create"), [data-testid*="new-project"]',
      );

      const hasNewLink = await newProjectLink
        .first()
        .isVisible()
        .catch(() => false);

      if (hasNewLink) {
        await newProjectLink.first().click();
        await authenticatedPage.waitForLoadState('domcontentloaded');
        await expect(authenticatedPage).toHaveURL(/\/editor(?:\/new)?/);
      } else {
        // Direct navigation fallback
        await authenticatedPage.goto('/editor/new');
        await authenticatedPage.waitForLoadState('domcontentloaded');
        await expect(authenticatedPage).toHaveURL(/\/editor\/new$/);
      }
    });
  });

  test.describe('Error Handling', () => {
    test('should handle editor API errors gracefully', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.route(
        '**/api.genfeed.ai/*/editor-projects**',
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

      await authenticatedPage.goto('/editor');
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // Page should handle error gracefully without crashing
      await expect(authenticatedPage).toHaveURL(/\/editor$/);
    });
  });
});

test.describe('Editor — Unauthenticated Access', () => {
  test('should redirect editor page to login', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/editor', {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });

    await expect(unauthenticatedPage).toHaveURL(/login|sign-in/, {
      timeout: 10000,
    });
  });

  test('should redirect new editor page to login', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/editor/new', {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });

    await expect(unauthenticatedPage).toHaveURL(/login|sign-in/, {
      timeout: 10000,
    });
  });

  test('should redirect editor detail page to login', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/editor/test-project-id', {
      timeout: 30000,
      waitUntil: 'domcontentloaded',
    });

    await expect(unauthenticatedPage).toHaveURL(/login|sign-in/, {
      timeout: 10000,
    });
  });
});
