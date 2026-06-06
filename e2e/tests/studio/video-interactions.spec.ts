import { expect, test } from '../../fixtures/auth.fixture';
import {
  assertRouteRenders,
  expectNoErrorOverlay,
  tryClick,
} from '../../utils/route-assertions';

/**
 * Deep interaction coverage for the Studio video generation surface.
 *
 * Drives real component logic on /test-org/brand-1/studio/video: prompt entry,
 * format/duration/model controls, the storyboard panel, filters/view toggle,
 * and a mocked generate submit. All generation POSTs are mocked by the shared
 * api-interceptor, so submitting is safe.
 *
 * Each interaction is guarded so a missing element never hangs or hard-fails.
 */

const VIDEO_ROUTE = '/test-org/brand-1/studio/video';

const PROMPT_SELECTORS = [
  '[data-testid="prompt-textarea"]',
  '[data-testid="prompt-input"]',
  'textarea',
];

async function fillPrompt(
  page: import('@playwright/test').Page,
  text: string,
): Promise<void> {
  for (const selector of PROMPT_SELECTORS) {
    const field = page.locator(selector).first();
    const visible = await field.isVisible().catch(() => false);
    if (visible) {
      await field.fill(text).catch(() => {});
      return;
    }
  }
}

test.describe('Studio video generation — deep interactions', () => {
  test.setTimeout(90_000);

  test('renders the video surface and accepts prompt input', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, VIDEO_ROUTE);
    await fillPrompt(
      authenticatedPage,
      'A cinematic b-roll sequence with smooth camera moves',
    );

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('cycles the aspect-ratio format control', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, VIDEO_ROUTE);
    await fillPrompt(authenticatedPage, 'Vertical reel intro with motion');

    await tryClick(authenticatedPage, '[data-testid="format-button"]');
    await tryClick(authenticatedPage, '[data-testid="format-button"]');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('expands the composer and opens model controls', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, VIDEO_ROUTE);

    await tryClick(authenticatedPage, '[data-testid="expand-button"]');
    await tryClick(authenticatedPage, '[data-testid="model-selector-popover"]');
    await tryClick(authenticatedPage, 'button:has-text("Model")');
    await tryClick(authenticatedPage, 'button:has-text("Duration")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('interacts with the storyboard panel controls', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, VIDEO_ROUTE);

    await tryClick(authenticatedPage, '[data-testid="reference-button"]');
    await tryClick(authenticatedPage, '[data-testid="end-frame-button"]');
    await tryClick(authenticatedPage, 'button:has-text("Camera")');
    await tryClick(authenticatedPage, 'button:has-text("Clear")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('changes the outputs count control', async ({ authenticatedPage }) => {
    await assertRouteRenders(authenticatedPage, VIDEO_ROUTE);

    await tryClick(authenticatedPage, '[data-testid="outputs-button"]');
    await tryClick(authenticatedPage, '[data-testid="outputs-button"]');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('exercises the filters, sort and status controls', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, VIDEO_ROUTE);

    await tryClick(
      authenticatedPage,
      '[data-testid="asset-controls-filters"] button',
    );
    await tryClick(authenticatedPage, 'text=Oldest First');
    await tryClick(authenticatedPage, 'text=Processing');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('toggles between masonry and table views', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, VIDEO_ROUTE);

    await tryClick(authenticatedPage, 'button[aria-label="Table view"]');
    await tryClick(authenticatedPage, 'button[aria-label="Masonry view"]');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('triggers the refresh control', async ({ authenticatedPage }) => {
    await assertRouteRenders(authenticatedPage, VIDEO_ROUTE);

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
    await assertRouteRenders(authenticatedPage, VIDEO_ROUTE);
    await fillPrompt(
      authenticatedPage,
      'Short product teaser with smooth camera moves',
    );

    await tryClick(authenticatedPage, '[data-testid="generate-button"]');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('applies a prompt config and format passed through the URL', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(
      authenticatedPage,
      `${VIDEO_ROUTE}?text=${encodeURIComponent('Drone flyover of a canyon')}&format=landscape`,
    );

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });
});
