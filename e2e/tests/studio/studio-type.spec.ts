import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { StudioPage } from '../../pages/studio.page';

/**
 * E2E Tests for Studio Type Routes (parameterized /studio/[type])
 *
 * CRITICAL: All tests use mocked API responses.
 * No real backend calls occur during tests.
 *
 * Tests verify that navigating to each generation type loads correctly.
 */
test.describe('Studio Type Routes — /studio/[type]', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
  });

  const studioTypes = ['image', 'video', 'music'] as const;

  for (const type of studioTypes) {
    test(`should load /studio/${type} without redirect`, async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await studioPage.gotoGenerationType(type);

      await expect(authenticatedPage).toHaveURL(new RegExp(`studio/${type}`));
      await expect(studioPage.mainContent).toBeVisible({ timeout: 15000 });
    });

    test(`should not redirect /studio/${type} to login`, async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await studioPage.gotoGenerationType(type);

      const url = authenticatedPage.url();
      expect(url).toContain(`studio/${type}`);
      expect(url).not.toContain('/login');
    });
  }

  test('should display main content area for image type', async ({
    authenticatedPage,
  }) => {
    const studioPage = new StudioPage(authenticatedPage);

    await studioPage.gotoGenerationType('image');

    await expect(studioPage.mainContent).toBeVisible({ timeout: 15000 });
  });

  test('should display main content area for video type', async ({
    authenticatedPage,
  }) => {
    const studioPage = new StudioPage(authenticatedPage);

    await studioPage.gotoGenerationType('video');

    await expect(studioPage.mainContent).toBeVisible({ timeout: 15000 });
  });

  test('should display main content area for music type', async ({
    authenticatedPage,
  }) => {
    const studioPage = new StudioPage(authenticatedPage);

    await studioPage.gotoGenerationType('music');

    await expect(studioPage.mainContent).toBeVisible({ timeout: 15000 });
  });

  test('should render studio type on mobile viewport', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.setViewportSize({ height: 667, width: 375 });

    const studioPage = new StudioPage(authenticatedPage);

    await studioPage.gotoGenerationType('image');

    await expect(authenticatedPage).toHaveURL(/studio\/image/);
  });
});

test.describe('Studio Type Routes — Unauthenticated Access', () => {
  const studioTypes = ['image', 'video', 'music'] as const;

  for (const type of studioTypes) {
    test(`should redirect /studio/${type} to login when unauthenticated`, async ({
      unauthenticatedPage,
    }) => {
      await unauthenticatedPage.goto(`/studio/${type}`, {
        timeout: 30000,
        waitUntil: 'domcontentloaded',
      });

      await expect(unauthenticatedPage).toHaveURL(/login|sign-in/, {
        timeout: 10000,
      });
    });
  }
});
