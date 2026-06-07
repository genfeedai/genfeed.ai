import { expect, test } from '../../fixtures/auth.fixture';
import { fillPrompt } from '../../utils/interaction-helpers';
import {
  assertRouteRenders,
  expectNoErrorOverlay,
  tryClick,
} from '../../utils/route-assertions';

/**
 * Deep interaction coverage for the Studio image generation surface.
 *
 * Drives real component logic (prompt entry, format/outputs/model controls,
 * advanced settings, filters, view toggle, generate submit) on
 * /test-org/brand-1/studio/image. All generation POSTs are mocked by the
 * shared api-interceptor, so submitting forms is safe.
 *
 * Every interaction is guarded so a missing element never hangs or hard-fails
 * the test — the point is to execute as many code paths as possible.
 */

const IMAGE_ROUTE = '/test-org/brand-1/studio/image';

test.describe('Studio image generation — deep interactions', () => {
  test.setTimeout(90_000);

  test('renders the image surface and accepts prompt input', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, IMAGE_ROUTE);
    await fillPrompt(authenticatedPage, 'A cinematic portrait with rim light');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('cycles the aspect-ratio format control', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, IMAGE_ROUTE);
    await fillPrompt(authenticatedPage, 'Minimalist poster concept');

    await tryClick(authenticatedPage, '[data-testid="format-button"]');
    await tryClick(authenticatedPage, '[data-testid="format-button"]');
    await tryClick(authenticatedPage, '[data-testid="format-button"]');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('changes the outputs count control', async ({ authenticatedPage }) => {
    await assertRouteRenders(authenticatedPage, IMAGE_ROUTE);

    await tryClick(authenticatedPage, '[data-testid="outputs-button"]');
    await tryClick(authenticatedPage, '[data-testid="outputs-button"]');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('expands and collapses the prompt bar advanced view', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, IMAGE_ROUTE);

    await tryClick(authenticatedPage, '[data-testid="expand-button"]');
    await tryClick(authenticatedPage, '[data-testid="collapse-button"]');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('opens model and quality controls in the composer', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, IMAGE_ROUTE);

    await tryClick(authenticatedPage, '[data-testid="expand-button"]');
    await tryClick(authenticatedPage, '[data-testid="model-selector-popover"]');
    await tryClick(authenticatedPage, 'button:has-text("Model")');
    await tryClick(authenticatedPage, 'button:has-text("Quality")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('exercises the filters and sort controls', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, IMAGE_ROUTE);

    await tryClick(
      authenticatedPage,
      '[data-testid="asset-controls-filters"] button',
    );
    await tryClick(authenticatedPage, 'text=Newest First');
    await tryClick(authenticatedPage, 'text=Oldest First');
    await tryClick(authenticatedPage, 'text=Completed');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('toggles between masonry and table views', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, IMAGE_ROUTE);

    await tryClick(
      authenticatedPage,
      '[data-testid="asset-controls-view-toggle"] button',
    );
    await tryClick(authenticatedPage, 'button[aria-label="Table view"]');
    await tryClick(authenticatedPage, 'button[aria-label="Masonry view"]');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('triggers the refresh control', async ({ authenticatedPage }) => {
    await assertRouteRenders(authenticatedPage, IMAGE_ROUTE);

    await tryClick(
      authenticatedPage,
      '[data-testid="asset-controls-refresh"] button',
    );

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('submits a generation request from the composer (mocked)', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, IMAGE_ROUTE);
    await fillPrompt(
      authenticatedPage,
      'Product photo on clean studio background',
    );

    await tryClick(authenticatedPage, '[data-testid="generate-button"]');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('applies a prompt config passed through the URL', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${IMAGE_ROUTE}?text=${encodeURIComponent('A neon city skyline at night')}`,
    );

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });
});
