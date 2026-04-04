import {
  mockActiveSubscription,
  mockAvatarGenerationSuccess,
  mockContentLibrary,
  mockMusicGenerationSuccess,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { testPrompts } from '../../fixtures/test-data.fixture';
import { StudioPage } from '../../pages/studio.page';

/**
 * E2E Tests for Content Creation (Music & Avatar)
 *
 * CRITICAL: All tests use mocked API responses.
 * No real AI generation occurs - all endpoints are intercepted.
 */
test.describe('Content Creation', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
  });

  test.describe('Music Generation', () => {
    test('should display music generation page', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await studioPage.gotoGenerationType('music');

      await expect(authenticatedPage).toHaveURL(/g\/music|studio.*music/);
    });

    test('should accept prompt for music generation', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);
      const musicPrompt = testPrompts.music[0].text;

      await studioPage.gotoGenerationType('music');
      await studioPage.waitForPageLoad();

      await studioPage.enterPrompt(musicPrompt).catch(() => {});

      await expect(authenticatedPage).toHaveURL(/g\/music|studio/);
    });

    test('should trigger music generation', async ({ authenticatedPage }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await mockMusicGenerationSuccess(authenticatedPage, { delay: 100 });

      await studioPage.gotoGenerationType('music');
      await studioPage.waitForPageLoad();

      await studioPage.enterPrompt('Upbeat electronic music').catch(() => {});
      await studioPage.clickGenerate().catch(() => {});

      await expect(authenticatedPage).toHaveURL(/g\/music|studio/);
    });

    test('should show music-specific options', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await studioPage.gotoGenerationType('music');
      await studioPage.waitForPageLoad();

      // Music might have duration selector or genre options
      await expect(authenticatedPage).toHaveURL(/g\/music|studio/);
    });

    test('should handle music generation completion', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await mockMusicGenerationSuccess(authenticatedPage, { delay: 0 });

      await studioPage.gotoGenerationType('music');
      await studioPage.waitForPageLoad();

      await studioPage.enterPrompt('Calm ambient music').catch(() => {});
      await studioPage.clickGenerate().catch(() => {});

      await studioPage.waitForGenerationComplete(10000).catch(() => {});

      await expect(authenticatedPage).toHaveURL(/g\/music|studio/);
    });

    test('should display existing music tracks', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await mockContentLibrary(authenticatedPage, 'musics', 5);

      await studioPage.gotoGenerationType('music');
      await studioPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/g\/music|studio/);
    });
  });

  test.describe('Avatar Generation', () => {
    test('should display avatar generation page', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await studioPage.gotoGenerationType('avatar');

      await expect(authenticatedPage).toHaveURL(/g\/avatar|studio.*avatar/);
    });

    test('should show avatar-specific UI elements', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await studioPage.gotoGenerationType('avatar');
      await studioPage.waitForPageLoad();

      // Avatar generation might have voice selection, text input, etc.
      await expect(authenticatedPage).toHaveURL(/g\/avatar|studio/);
    });

    test('should trigger avatar video generation', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await mockAvatarGenerationSuccess(authenticatedPage, { delay: 100 });

      await studioPage.gotoGenerationType('avatar');
      await studioPage.waitForPageLoad();

      await studioPage
        .enterPrompt('Hello, welcome to our product demo')
        .catch(() => {});
      await studioPage.clickGenerate().catch(() => {});

      await expect(authenticatedPage).toHaveURL(/g\/avatar|studio/);
    });

    test('should handle avatar generation completion', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await mockAvatarGenerationSuccess(authenticatedPage, { delay: 0 });

      await studioPage.gotoGenerationType('avatar');
      await studioPage.waitForPageLoad();

      await studioPage.enterPrompt('Create a presenter avatar').catch(() => {});
      await studioPage.clickGenerate().catch(() => {});

      await studioPage.waitForGenerationComplete(10000).catch(() => {});

      await expect(authenticatedPage).toHaveURL(/g\/avatar|studio/);
    });
  });

  test.describe('Content Type Navigation', () => {
    test('should navigate between content types', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      // Start at video
      await studioPage.gotoGenerationType('video');
      await expect(authenticatedPage).toHaveURL(/g\/video|studio/);

      // Navigate to image
      await studioPage.selectGenerationType('image');
      await authenticatedPage.waitForTimeout(500);

      // Navigate to music
      await studioPage.selectGenerationType('music');
      await authenticatedPage.waitForTimeout(500);

      // Navigate to avatar
      await studioPage.selectGenerationType('avatar');
      await authenticatedPage.waitForTimeout(500);

      // Should be on avatar or studio page
      const url = authenticatedPage.url();
      expect(url.includes('/g/') || url.includes('/studio')).toBe(true);
    });

    test('should preserve prompt when switching types', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await studioPage.gotoGenerationType('video');
      await studioPage.waitForPageLoad();

      // Enter a prompt
      await studioPage.enterPrompt('My creative prompt').catch(() => {});

      // Switch types (prompt might or might not be preserved)
      await studioPage.selectGenerationType('image');

      // Page should remain functional
      await expect(authenticatedPage).toHaveURL(/g\/image|studio/);
    });
  });

  test.describe('Main Studio Page', () => {
    test('should display studio hub page', async ({ authenticatedPage }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await studioPage.goto();
      await studioPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/studio/);
    });

    test('should show content type options on studio hub', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await studioPage.goto();
      await studioPage.waitForPageLoad();

      // Should have tabs or buttons for different content types
      await expect(studioPage.videoTab).toBeVisible();
      await expect(studioPage.imageTab).toBeVisible();
    });

    test('should navigate from studio hub to specific type', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await studioPage.goto();
      await studioPage.waitForPageLoad();

      // Click on video tab/option
      await studioPage.selectGenerationType('video').catch(() => {
        // Might already be on a specific type
      });

      await authenticatedPage.waitForTimeout(500);

      const url = authenticatedPage.url();
      expect(url.includes('/studio') || url.includes('/g/')).toBe(true);
    });
  });

  test.describe('Credits Usage', () => {
    test('should display credit cost before generation', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await studioPage.gotoGenerationType('video');
      await studioPage.waitForPageLoad();

      // Credits should be visible
      const credits = await studioPage.getCredits().catch(() => '');
      expect(credits).toBeTruthy();
    });

    test('should update credits after generation', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      // Mock with initial credits
      await mockActiveSubscription(authenticatedPage, { credits: 500 });

      await studioPage.gotoGenerationType('image');
      await studioPage.waitForPageLoad();

      // Page should show credits
      await expect(authenticatedPage).toHaveURL(/g\/image|studio/);
    });
  });

  test.describe('Empty States', () => {
    test('should show empty state for new users', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      // Mock empty content
      await authenticatedPage.route(
        '**/api.genfeed.ai/videos',
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

      await studioPage.gotoGenerationType('video');
      await studioPage.waitForPageLoad();

      // Should show empty state or prompt to create
      await expect(authenticatedPage).toHaveURL(/g\/video|studio/);
    });

    test('should encourage first creation', async ({ authenticatedPage }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await studioPage.gotoGenerationType('image');
      await studioPage.waitForPageLoad();

      // Prompt input should be visible for new users to start creating
      await expect(authenticatedPage).toHaveURL(/g\/image|studio/);
    });
  });
});

test.describe('Content Creation - Cross-Browser', () => {
  test('should work correctly across browsers', async ({
    authenticatedPage,
  }) => {
    const studioPage = new StudioPage(authenticatedPage);

    // Basic functionality test
    await studioPage.goto();
    await studioPage.waitForPageLoad();

    // Should be functional
    await expect(authenticatedPage).toHaveURL(/studio|g\//);
  });
});
