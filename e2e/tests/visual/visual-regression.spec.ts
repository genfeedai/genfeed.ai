import {
  mockAnalyticsData,
  mockContentLibrary,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';

/**
 * Visual Regression Test Suite
 *
 * This test suite captures screenshots of critical pages and compares them
 * against baseline images to detect unintended visual changes.
 *
 * Key features:
 * - Full-page screenshots of main application pages
 * - Mobile viewport testing (375x667)
 * - Uses mocked authentication and API data for consistency
 * - Baseline images stored in e2e/__screenshots__/
 *
 * To update baseline images:
 * bunx playwright test --project=chromium e2e/tests/visual/ --update-snapshots
 *
 * @module visual-regression.spec
 */

test.describe('Visual Regression Tests - Desktop', () => {
  test.describe('Public Pages', () => {
    test('Login/Landing Page - should match baseline', async ({
      unauthenticatedPage,
    }) => {
      await unauthenticatedPage.goto('/login');

      // Wait for page to be fully loaded
      await unauthenticatedPage.waitForLoadState('domcontentloaded');

      // Take full-page screenshot
      await expect(unauthenticatedPage).toHaveScreenshot(
        'login-page-desktop.png',
        {
          fullPage: true,
        },
      );
    });
  });

  test.describe('Authenticated Pages', () => {
    test('Dashboard - should match baseline', async ({ authenticatedPage }) => {
      // Set up mock analytics data for consistency
      await mockAnalyticsData(authenticatedPage);

      await authenticatedPage.goto('/overview');

      // Wait for dashboard to fully load
      await authenticatedPage.waitForLoadState('domcontentloaded');

      // Give time for any animations/transitions
      await authenticatedPage.waitForTimeout(500);

      // Take full-page screenshot
      await expect(authenticatedPage).toHaveScreenshot(
        'dashboard-page-desktop.png',
        {
          fullPage: true,
        },
      );
    });

    test('Studio - Image Generation Page - should match baseline', async ({
      authenticatedPage,
    }) => {
      // Mock content library for consistency
      await mockContentLibrary(authenticatedPage, 'images', 6);

      await authenticatedPage.goto('/studio');

      // Wait for studio page to load
      await authenticatedPage.waitForLoadState('domcontentloaded');
      await authenticatedPage.waitForTimeout(500);

      // Take full-page screenshot
      await expect(authenticatedPage).toHaveScreenshot(
        'studio-image-desktop.png',
        {
          fullPage: true,
        },
      );
    });

    test('Studio - Video Generation Page - should match baseline', async ({
      authenticatedPage,
    }) => {
      // Mock content library for consistency
      await mockContentLibrary(authenticatedPage, 'videos', 6);

      await authenticatedPage.goto('/studio?tab=video');

      // Wait for video tab to load
      await authenticatedPage.waitForLoadState('domcontentloaded');
      await authenticatedPage.waitForTimeout(500);

      // Take full-page screenshot
      await expect(authenticatedPage).toHaveScreenshot(
        'studio-video-desktop.png',
        {
          fullPage: true,
        },
      );
    });

    test('Settings - Profile Page - should match baseline', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/settings');

      // Wait for settings page to load
      await authenticatedPage.waitForLoadState('domcontentloaded');
      await authenticatedPage.waitForTimeout(500);

      // Take full-page screenshot
      await expect(authenticatedPage).toHaveScreenshot(
        'settings-profile-desktop.png',
        {
          fullPage: true,
        },
      );
    });

    test('Settings - Billing Page - should match baseline', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/settings/organization/billing');

      // Wait for billing page to load
      await authenticatedPage.waitForLoadState('domcontentloaded');
      await authenticatedPage.waitForTimeout(500);

      // Take full-page screenshot
      await expect(authenticatedPage).toHaveScreenshot(
        'settings-billing-desktop.png',
        {
          fullPage: true,
        },
      );
    });
  });
});

test.describe('Visual Regression Tests - Mobile', () => {
  test.use({
    viewport: { height: 667, width: 375 },
  });

  test.describe('Public Pages - Mobile', () => {
    test('Login/Landing Page - Mobile - should match baseline', async ({
      unauthenticatedPage,
    }) => {
      await unauthenticatedPage.goto('/login');

      // Wait for page to be fully loaded
      await unauthenticatedPage.waitForLoadState('domcontentloaded');

      // Take full-page screenshot
      await expect(unauthenticatedPage).toHaveScreenshot(
        'login-page-mobile.png',
        {
          fullPage: true,
        },
      );
    });
  });

  test.describe('Authenticated Pages - Mobile', () => {
    test('Dashboard - Mobile - should match baseline', async ({
      authenticatedPage,
    }) => {
      // Set up mock analytics data for consistency
      await mockAnalyticsData(authenticatedPage);

      await authenticatedPage.goto('/overview');

      // Wait for dashboard to fully load
      await authenticatedPage.waitForLoadState('domcontentloaded');
      await authenticatedPage.waitForTimeout(500);

      // Take full-page screenshot
      await expect(authenticatedPage).toHaveScreenshot(
        'dashboard-page-mobile.png',
        {
          fullPage: true,
        },
      );
    });

    test('Studio - Image Generation Page - Mobile - should match baseline', async ({
      authenticatedPage,
    }) => {
      // Mock content library for consistency
      await mockContentLibrary(authenticatedPage, 'images', 6);

      await authenticatedPage.goto('/studio');

      // Wait for studio page to load
      await authenticatedPage.waitForLoadState('domcontentloaded');
      await authenticatedPage.waitForTimeout(500);

      // Take full-page screenshot
      await expect(authenticatedPage).toHaveScreenshot(
        'studio-image-mobile.png',
        {
          fullPage: true,
        },
      );
    });

    test('Settings - Profile Page - Mobile - should match baseline', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/settings');

      // Wait for settings page to load
      await authenticatedPage.waitForLoadState('domcontentloaded');
      await authenticatedPage.waitForTimeout(500);

      // Take full-page screenshot
      await expect(authenticatedPage).toHaveScreenshot(
        'settings-profile-mobile.png',
        {
          fullPage: true,
        },
      );
    });

    test('Settings - Billing Page - Mobile - should match baseline', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/settings/organization/billing');

      // Wait for billing page to load
      await authenticatedPage.waitForLoadState('domcontentloaded');
      await authenticatedPage.waitForTimeout(500);

      // Take full-page screenshot
      await expect(authenticatedPage).toHaveScreenshot(
        'settings-billing-mobile.png',
        {
          fullPage: true,
        },
      );
    });
  });
});

test.describe('Visual Regression Tests - Critical UI Components', () => {
  test('Studio - Empty State - should match baseline', async ({
    authenticatedPage,
  }) => {
    // Mock empty content library
    await authenticatedPage.route('**/api.genfeed.ai/images', async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          data: [],
          meta: { page: 1, pageSize: 10, totalCount: 0 },
        }),
        contentType: 'application/json',
        status: 200,
      });
    });

    await authenticatedPage.goto('/studio');
    await authenticatedPage.waitForLoadState('domcontentloaded');
    await authenticatedPage.waitForTimeout(500);

    await expect(authenticatedPage).toHaveScreenshot(
      'studio-empty-state-desktop.png',
      {
        fullPage: true,
      },
    );
  });

  test('Error State - 404 Page - should match baseline', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto('/this-page-does-not-exist');
    await unauthenticatedPage.waitForLoadState('domcontentloaded');

    await expect(unauthenticatedPage).toHaveScreenshot(
      'error-404-desktop.png',
      {
        fullPage: true,
      },
    );
  });
});
