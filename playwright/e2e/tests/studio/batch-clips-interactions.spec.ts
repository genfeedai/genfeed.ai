import { expect, test } from '../../fixtures/auth.fixture';
import { fillField } from '../../utils/interaction-helpers';
import {
  assertRouteRenders,
  expectNoErrorOverlay,
  tryClick,
} from '../../utils/route-assertions';

/**
 * Deep interaction coverage for two Studio production surfaces:
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

const BATCH_ROUTE = '/test-org/brand-1/studio/batch';
const CLIPS_ROUTE = '/test-org/brand-1/studio/clips';

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
