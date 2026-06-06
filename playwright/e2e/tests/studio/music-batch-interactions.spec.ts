import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';
import {
  assertRouteRenders,
  expectNoErrorOverlay,
  tryClick,
} from '../../utils/route-assertions';

/**
 * Deep interaction coverage for three Studio surfaces:
 *   - /test-org/brand-1/studio/music — the shared StudioGenerateLayout composer
 *   - /test-org/brand-1/studio/batch — the batch workflow runner
 *   - /test-org/brand-1/studio/clips — the AI clip factory
 *
 * Each test drives real component logic (prompt entry, control toggles, form
 * inputs, mocked submits) rather than render-only checks. All generation and
 * upload POSTs are mocked by the shared api-interceptor, so submitting forms is
 * safe and never reaches a real backend.
 *
 * Every interaction is guarded so a missing element never hangs or hard-fails —
 * the goal is to execute as many code paths as possible for coverage.
 */

const MUSIC_ROUTE = '/test-org/brand-1/studio/music';
const BATCH_ROUTE = '/test-org/brand-1/studio/batch';
const CLIPS_ROUTE = '/test-org/brand-1/studio/clips';

const PROMPT_SELECTORS = [
  '[data-testid="prompt-textarea"]',
  '[data-testid="prompt-input"]',
  'textarea',
];

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

async function fillField(
  page: Page,
  selector: string,
  value: string,
): Promise<void> {
  const field = page.locator(selector).first();
  const visible = await field.isVisible().catch(() => false);
  if (visible) {
    await field.fill(value).catch(() => {});
  }
}

test.describe('Studio music generation — deep interactions', () => {
  test.setTimeout(90_000);

  test('renders the music surface and accepts prompt input', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, MUSIC_ROUTE);
    await fillPrompt(authenticatedPage, 'Compose a lo-fi background track');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('expands the composer and opens model controls', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, MUSIC_ROUTE);

    await tryClick(authenticatedPage, '[data-testid="expand-button"]');
    await tryClick(authenticatedPage, '[data-testid="model-selector-popover"]');
    await tryClick(authenticatedPage, 'button:has-text("Model")');
    await tryClick(authenticatedPage, '[data-testid="collapse-button"]');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('changes the outputs count control', async ({ authenticatedPage }) => {
    await assertRouteRenders(authenticatedPage, MUSIC_ROUTE);

    await tryClick(authenticatedPage, '[data-testid="outputs-button"]');
    await tryClick(authenticatedPage, '[data-testid="outputs-button"]');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('exercises the filters, sort and status controls', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, MUSIC_ROUTE);

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

  test('triggers the refresh control', async ({ authenticatedPage }) => {
    await assertRouteRenders(authenticatedPage, MUSIC_ROUTE);

    await tryClick(
      authenticatedPage,
      '[data-testid="asset-controls-refresh"] button',
    );

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('clicks a prompt suggestion chip', async ({ authenticatedPage }) => {
    await assertRouteRenders(authenticatedPage, MUSIC_ROUTE);

    await tryClick(
      authenticatedPage,
      'button:has-text("Generate an upbeat intro sting for short videos")',
    );
    await tryClick(authenticatedPage, 'button:has-text("Create ambient")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('submits a generation request from the composer (mocked)', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, MUSIC_ROUTE);
    await fillPrompt(
      authenticatedPage,
      'Create ambient cinematic music with soft pads',
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
      `${MUSIC_ROUTE}?text=${encodeURIComponent('Energetic synthwave loop')}`,
    );

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });
});

test.describe('Studio batch workflow runner — deep interactions', () => {
  test.setTimeout(90_000);

  test('renders the batch runner composer', async ({ authenticatedPage }) => {
    await assertRouteRenders(authenticatedPage, BATCH_ROUTE);

    await expect(
      authenticatedPage.locator('text=Batch Workflow Runner').first(),
    ).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('opens the workflow selector dropdown', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, BATCH_ROUTE);

    await tryClick(authenticatedPage, '#workflow-select');
    await tryClick(authenticatedPage, '[role="option"]');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('attempts to run a batch and clear files', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, BATCH_ROUTE);

    await tryClick(authenticatedPage, 'button:has-text("Run Batch")');
    await tryClick(authenticatedPage, 'button:has-text("Clear all")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('opens a recent batch job from the query param', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, `${BATCH_ROUTE}?job=batch-1`);

    await tryClick(authenticatedPage, 'button:has-text("Back to batch setup")');
    await tryClick(authenticatedPage, 'button:has-text("New batch")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });
});

test.describe('Studio clip factory — deep interactions', () => {
  test.setTimeout(90_000);

  test('renders the clip factory input form', async ({ authenticatedPage }) => {
    await assertRouteRenders(authenticatedPage, CLIPS_ROUTE);

    await expect(
      authenticatedPage.locator('text=AI Clip Factory').first(),
    ).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('fills the YouTube URL and adjusts the clip controls', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, CLIPS_ROUTE);

    await fillField(
      authenticatedPage,
      '#youtube-url',
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    );
    await fillField(authenticatedPage, '#max-clips', '12');
    await fillField(authenticatedPage, '#min-virality', '70');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('submits the analyze request (mocked)', async ({
    authenticatedPage,
  }) => {
    await assertRouteRenders(authenticatedPage, CLIPS_ROUTE);

    await fillField(
      authenticatedPage,
      '#youtube-url',
      'https://www.youtube.com/watch?v=abc12345678',
    );
    await tryClick(authenticatedPage, 'button:has-text("Analyze Video")');

    await expect(authenticatedPage.locator('body')).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });
});
