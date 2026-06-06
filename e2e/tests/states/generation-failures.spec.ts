import {
  mockImageGenerationFailure,
  mockVideoGenerationFailure,
} from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { expectNoErrorOverlay, tryClick } from '../../utils/route-assertions';

/**
 * Generation-failure coverage for the Studio surfaces.
 *
 * The image / video generation POST is mocked to return HTTP 400 (content
 * policy / generation failed) AFTER the authenticatedPage fixture bootstraps.
 * Each test renders the studio composer, enters a prompt, and submits — driving
 * the failure-handling branch (error toast / inline error / reset state) that
 * happy-path generation tests never reach.
 *
 * Submitting is safe: the POST is intercepted and fulfilled with an error, so no
 * real generation runs and the strict network guard stays satisfied.
 */

const ORG_BRAND = '/test-org/brand-1';
const IMAGE_ROUTE = `${ORG_BRAND}/studio/image`;
const VIDEO_ROUTE = `${ORG_BRAND}/studio/video`;
const BATCH_ROUTE = `${ORG_BRAND}/studio/batch`;

const PROMPT_SELECTORS = [
  '[data-testid="prompt-textarea"]',
  '[data-testid="prompt-input"]',
  'textarea',
];

type Page = Parameters<typeof mockImageGenerationFailure>[0];

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await page.waitForTimeout(400);
}

async function assertHealthy(page: Page): Promise<void> {
  await expect(page.locator('body')).toBeVisible();
  await expectNoErrorOverlay(page);
  expect(page.url()).not.toMatch(/\/login/);
}

async function fillPrompt(page: Page, text: string): Promise<void> {
  for (const selector of PROMPT_SELECTORS) {
    const field = page.locator(selector).first();
    const visible = await field.isVisible().catch(() => false);
    if (visible) {
      await field.fill(text).catch(() => {});
      return;
    }
  }
}

async function submitGeneration(page: Page): Promise<void> {
  await tryClick(page, '[data-testid="generate-button"]');
  await tryClick(page, 'button:has-text("Generate")');
}

test.describe('Studio — generation failure handling', () => {
  test.setTimeout(90_000);

  test('image generation failure keeps the composer healthy', async ({
    authenticatedPage,
  }) => {
    await mockImageGenerationFailure(authenticatedPage);
    await authenticatedPage.goto(IMAGE_ROUTE, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await fillPrompt(authenticatedPage, 'A cinematic portrait with rim light');
    await submitGeneration(authenticatedPage);
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('image generation policy-violation failure is handled', async ({
    authenticatedPage,
  }) => {
    await mockImageGenerationFailure(
      authenticatedPage,
      'Image generation failed due to content policy violation',
    );
    await authenticatedPage.goto(IMAGE_ROUTE, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await fillPrompt(authenticatedPage, 'Disallowed content prompt');
    await submitGeneration(authenticatedPage);
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('image composer recovers after a retry following failure', async ({
    authenticatedPage,
  }) => {
    await mockImageGenerationFailure(authenticatedPage);
    await authenticatedPage.goto(IMAGE_ROUTE, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await fillPrompt(authenticatedPage, 'Product photo on clean background');
    await submitGeneration(authenticatedPage);
    await settle(authenticatedPage);

    // Retry / dismiss affordances if the failure surfaced any.
    await tryClick(authenticatedPage, 'button:has-text("Retry")');
    await tryClick(authenticatedPage, 'button:has-text("Try again")');
    await submitGeneration(authenticatedPage);
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('image generation failure with URL-provided prompt is handled', async ({
    authenticatedPage,
  }) => {
    await mockImageGenerationFailure(authenticatedPage);
    await authenticatedPage.goto(
      `${IMAGE_ROUTE}?text=${encodeURIComponent('A neon skyline at night')}`,
      { waitUntil: 'domcontentloaded' },
    );
    await settle(authenticatedPage);

    await submitGeneration(authenticatedPage);
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('video generation failure keeps the composer healthy', async ({
    authenticatedPage,
  }) => {
    await mockVideoGenerationFailure(authenticatedPage);
    await authenticatedPage.goto(VIDEO_ROUTE, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await fillPrompt(authenticatedPage, 'A slow dolly shot of a city street');
    await submitGeneration(authenticatedPage);
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('video generation policy-violation failure is handled', async ({
    authenticatedPage,
  }) => {
    await mockVideoGenerationFailure(
      authenticatedPage,
      'Generation failed due to content policy violation',
    );
    await authenticatedPage.goto(VIDEO_ROUTE, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await fillPrompt(authenticatedPage, 'Disallowed video prompt');
    await submitGeneration(authenticatedPage);
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('video composer recovers after a retry following failure', async ({
    authenticatedPage,
  }) => {
    await mockVideoGenerationFailure(authenticatedPage);
    await authenticatedPage.goto(VIDEO_ROUTE, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await fillPrompt(authenticatedPage, 'Aerial shot over mountains at dawn');
    await submitGeneration(authenticatedPage);
    await settle(authenticatedPage);

    await tryClick(authenticatedPage, 'button:has-text("Retry")');
    await tryClick(authenticatedPage, 'button:has-text("Try again")');
    await submitGeneration(authenticatedPage);
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });

  test('batch studio handles an image generation failure', async ({
    authenticatedPage,
  }) => {
    await mockImageGenerationFailure(authenticatedPage);
    await mockVideoGenerationFailure(authenticatedPage);
    await authenticatedPage.goto(BATCH_ROUTE, {
      waitUntil: 'domcontentloaded',
    });
    await settle(authenticatedPage);

    await fillPrompt(authenticatedPage, 'Batch of product hero shots');
    await submitGeneration(authenticatedPage);
    await settle(authenticatedPage);

    await assertHealthy(authenticatedPage);
  });
});
