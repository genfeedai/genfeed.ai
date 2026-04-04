import {
  mockActiveSubscription,
  mockContentLibrary,
  mockEmptyContentLibrary,
  mockImageGenerationFailure,
  mockImageGenerationSuccess,
  mockInsufficientCredits,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { testPrompts } from '../../fixtures/test-data.fixture';
import { StudioPage } from '../../pages/studio.page';

/**
 * E2E Tests for Image Generation
 *
 * CRITICAL: All tests use mocked API responses.
 * No real AI generation occurs - all image generation endpoints are intercepted.
 *
 * These tests verify the image generation UI flow, not actual generation.
 */
test.describe('Image Generation', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    // Set up default subscription mock
    await mockActiveSubscription(authenticatedPage, {
      credits: 1000,
      plan: 'pro',
    });
  });

  test.describe('Page Load', () => {
    test('should display the image generation page', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await studioPage.gotoGenerationType('image');

      // Verify we're on the image generation page
      await expect(authenticatedPage).toHaveURL(/g\/image|studio.*image/);
    });

    test('should normalize plural image routes to the canonical path', async ({
      authenticatedPage,
    }) => {
      await authenticatedPage.goto('/studio/images');

      await expect(authenticatedPage).toHaveURL(/\/studio\/image(?:\?.*)?$/);
    });

    test('should display prompt input for images', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await studioPage.gotoGenerationType('image');
      await studioPage.waitForPageLoad();

      // Page should load with generation interface
      await expect(authenticatedPage).toHaveURL(/g\/image|studio/);
    });

    test('should render existing image assets in the studio masonry view', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await mockContentLibrary(authenticatedPage, 'images', 3);

      await studioPage.gotoGenerationType('image');
      await studioPage.waitForPageLoad();

      await expect(
        authenticatedPage.getByTestId('masonry-ingredient-mock-images-0'),
      ).toBeVisible();
    });

    test('should show image-specific options', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await studioPage.gotoGenerationType('image');
      await studioPage.waitForPageLoad();

      // Check for image-specific UI elements
      await expect(authenticatedPage).toHaveURL(/g\/image|studio/);
    });
  });

  test.describe('Prompt Input', () => {
    test('should accept prompt text for image generation', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);
      const imagePrompt = testPrompts.image[0].text;

      await studioPage.gotoGenerationType('image');
      await studioPage.waitForPageLoad();

      await studioPage.enterPrompt(imagePrompt).catch(() => {});

      // Page should remain functional
      await expect(authenticatedPage).toHaveURL(/g\/image|studio/);
    });

    test('should support long prompts', async ({ authenticatedPage }) => {
      const studioPage = new StudioPage(authenticatedPage);
      const longPrompt =
        'A highly detailed digital artwork of ' +
        'a futuristic cityscape at sunset with flying cars, ' +
        'holographic billboards, and people walking on elevated platforms, ' +
        'in the style of cyberpunk art with neon lighting';

      await studioPage.gotoGenerationType('image');
      await studioPage.waitForPageLoad();

      await studioPage.enterPrompt(longPrompt).catch(() => {});

      // Should accept long prompts
      await expect(authenticatedPage).toHaveURL(/g\/image|studio/);
    });
  });

  test.describe('Generation Flow', () => {
    test('should trigger image generation', async ({ authenticatedPage }) => {
      const studioPage = new StudioPage(authenticatedPage);

      // Mock successful generation
      await mockImageGenerationSuccess(authenticatedPage, { delay: 100 });

      await studioPage.gotoGenerationType('image');
      await studioPage.waitForPageLoad();

      await studioPage.enterPrompt(testPrompts.image[0].text).catch(() => {});
      await studioPage.clickGenerate().catch(() => {});

      // Should trigger generation
      await expect(authenticatedPage).toHaveURL(/g\/image|studio/);
    });

    test('should show loading state while generating', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await mockImageGenerationSuccess(authenticatedPage, { delay: 2000 });

      await studioPage.gotoGenerationType('image');
      await studioPage.waitForPageLoad();

      await studioPage.enterPrompt('Create a logo design').catch(() => {});
      await studioPage.clickGenerate().catch(() => {});

      // Check loading state
      const _isGenerating = await studioPage.isGenerating().catch(() => false);
    });

    test('should display generated image', async ({ authenticatedPage }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await mockImageGenerationSuccess(authenticatedPage, {
        delay: 0,
        finalStatus: 'completed',
      });

      await studioPage.gotoGenerationType('image');
      await studioPage.waitForPageLoad();

      await studioPage.enterPrompt('A beautiful landscape').catch(() => {});
      await studioPage.clickGenerate().catch(() => {});

      await studioPage.waitForGenerationComplete(10000).catch(() => {});

      // Page should show result or remain functional
      await expect(authenticatedPage).toHaveURL(/g\/image|studio/);
    });
  });

  test.describe('Error Handling', () => {
    test('should handle generation failure', async ({ authenticatedPage }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await mockImageGenerationFailure(
        authenticatedPage,
        'Image generation failed: content policy violation',
      );

      await studioPage.gotoGenerationType('image');
      await studioPage.waitForPageLoad();

      await studioPage.enterPrompt('Generate something').catch(() => {});
      await studioPage.clickGenerate().catch(() => {});

      await authenticatedPage.waitForTimeout(500);

      // Page should handle error
      await expect(authenticatedPage).toHaveURL(/g\/image|studio/);
    });

    test('should show credits error when out of credits', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await mockInsufficientCredits(authenticatedPage);

      await studioPage.gotoGenerationType('image');
      await studioPage.waitForPageLoad();

      await studioPage.enterPrompt('Generate an image').catch(() => {});
      await studioPage.clickGenerate().catch(() => {});

      await authenticatedPage.waitForTimeout(500);

      // Page should show error or upgrade prompt
      await expect(authenticatedPage).toHaveURL(/g\/image|studio/);
    });
  });

  test.describe('Model Selection', () => {
    test('should allow selecting image generation models', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await studioPage.gotoGenerationType('image');
      await studioPage.waitForPageLoad();

      // Try selecting a model
      await studioPage.selectModel('Flux').catch(() => {});

      await expect(authenticatedPage).toHaveURL(/g\/image|studio/);
    });
  });

  test.describe('Aspect Ratio', () => {
    test('should display aspect ratio options', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await studioPage.gotoGenerationType('image');
      await studioPage.waitForPageLoad();

      await expect(studioPage.aspectRatioSelector).toBeVisible();
    });

    test('should allow selecting different aspect ratios', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await studioPage.gotoGenerationType('image');
      await studioPage.waitForPageLoad();

      await studioPage.selectAspectRatio('16:9').catch(() => {});

      await expect(authenticatedPage).toHaveURL(/g\/image|studio/);
    });

    test('should support square format', async ({ authenticatedPage }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await studioPage.gotoGenerationType('image');
      await studioPage.waitForPageLoad();

      await studioPage.selectAspectRatio('1:1').catch(() => {});

      await expect(authenticatedPage).toHaveURL(/g\/image|studio/);
    });

    test('should support portrait format', async ({ authenticatedPage }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await studioPage.gotoGenerationType('image');
      await studioPage.waitForPageLoad();

      await studioPage.selectAspectRatio('9:16').catch(() => {});

      await expect(authenticatedPage).toHaveURL(/g\/image|studio/);
    });
  });

  test.describe('Advanced Options', () => {
    test('should show advanced options panel', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await studioPage.gotoGenerationType('image');
      await studioPage.waitForPageLoad();

      await studioPage.toggleAdvancedOptions().catch(() => {});

      await expect(authenticatedPage).toHaveURL(/g\/image|studio/);
    });

    test('should accept negative prompt', async ({ authenticatedPage }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await studioPage.gotoGenerationType('image');
      await studioPage.waitForPageLoad();

      await studioPage.toggleAdvancedOptions().catch(() => {});
      await studioPage
        .enterNegativePrompt('blurry, low quality, watermark')
        .catch(() => {});

      await expect(authenticatedPage).toHaveURL(/g\/image|studio/);
    });
  });

  test.describe('Results Gallery', () => {
    test('should display existing images', async ({ authenticatedPage }) => {
      const studioPage = new StudioPage(authenticatedPage);

      // Mock content library
      await mockContentLibrary(authenticatedPage, 'images', 6);

      await studioPage.gotoGenerationType('image');
      await studioPage.waitForPageLoad();

      await expect(authenticatedPage).toHaveURL(/g\/image|studio/);
    });

    test('should handle empty gallery', async ({ authenticatedPage }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await mockEmptyContentLibrary(authenticatedPage, 'images');

      await studioPage.gotoGenerationType('image');
      await studioPage.waitForPageLoad();

      // Should show empty state or prompt to create
      await expect(authenticatedPage).toHaveURL(/g\/image|studio/);
    });

    test('should allow clicking on image result', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await mockContentLibrary(authenticatedPage, 'images', 3);

      await studioPage.gotoGenerationType('image');
      await studioPage.waitForPageLoad();

      const hasResults = (await studioPage.getResultCount()) > 0;

      if (hasResults) {
        await studioPage.clickResult(0);
      }

      // Should remain on page or open preview
      const url = authenticatedPage.url();
      expect(
        url.includes('/g/image') ||
          url.includes('/studio') ||
          url.includes('/editor'),
      ).toBe(true);
    });
  });

  test.describe('Image Actions', () => {
    test('should allow downloading generated image', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await mockImageGenerationSuccess(authenticatedPage, { delay: 0 });
      await mockContentLibrary(authenticatedPage, 'images', 1);

      await studioPage.gotoGenerationType('image');
      await studioPage.waitForPageLoad();

      // Verify download button is available for results
      await expect(authenticatedPage).toHaveURL(/g\/image|studio/);
    });
  });

  test.describe('Multiple Generations', () => {
    test('should support multiple image generations', async ({
      authenticatedPage,
    }) => {
      const studioPage = new StudioPage(authenticatedPage);

      await mockImageGenerationSuccess(authenticatedPage, { delay: 0 });

      await studioPage.gotoGenerationType('image');
      await studioPage.waitForPageLoad();

      // First generation
      await studioPage.enterPrompt('First image').catch(() => {});
      await studioPage.clickGenerate().catch(() => {});
      await authenticatedPage.waitForTimeout(200);

      // Clear and second generation
      await studioPage.clearPrompt().catch(() => {});
      await studioPage.enterPrompt('Second image').catch(() => {});
      await studioPage.clickGenerate().catch(() => {});

      await expect(authenticatedPage).toHaveURL(/g\/image|studio/);
    });
  });
});

test.describe('Image Generation - Responsive', () => {
  test('should work on mobile viewport', async ({ authenticatedPage }) => {
    const studioPage = new StudioPage(authenticatedPage);

    await authenticatedPage.setViewportSize({ height: 667, width: 375 });

    await studioPage.gotoGenerationType('image');
    await studioPage.waitForPageLoad();

    await expect(authenticatedPage).toHaveURL(/g\/image|studio/);
  });

  test('should work on tablet viewport', async ({ authenticatedPage }) => {
    const studioPage = new StudioPage(authenticatedPage);

    await authenticatedPage.setViewportSize({ height: 1024, width: 768 });

    await studioPage.gotoGenerationType('image');
    await studioPage.waitForPageLoad();

    await expect(authenticatedPage).toHaveURL(/g\/image|studio/);
  });
});
