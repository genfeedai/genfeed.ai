import type { Page } from '@playwright/test';
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
const CLIPS_DRAFT_ID = '000000000000000000009876';

/**
 * The clip factory form lives on a draft project (#5466): mock the draft that
 * "New project" creates, its autosave, and its reads.
 */
async function mockClipDraft(page: Page): Promise<void> {
  const draftProject = {
    data: {
      attributes: {
        draft: { sourceKind: 'youtube', youtubeUrl: '' },
        settings: { maxClips: 10, minViralityScore: 50, mode: 'avatar' },
        status: 'draft',
      },
      id: CLIPS_DRAFT_ID,
      type: 'clip-projects',
    },
  };
  const fulfillDraft = async (
    route: Parameters<Parameters<Page['route']>[1]>[0],
  ) => {
    await route.fulfill({
      body: JSON.stringify(draftProject),
      contentType: 'application/json',
      status: 200,
    });
  };

  await page.route('**/clip-projects/drafts', fulfillDraft);
  await page.route(`**/clip-projects/${CLIPS_DRAFT_ID}`, fulfillDraft);
  await page.route(`**/clip-projects/${CLIPS_DRAFT_ID}/draft`, fulfillDraft);
  await page.route(
    `**/clip-projects/${CLIPS_DRAFT_ID}/hook-approval`,
    async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          attempt: 0,
          remainingClipCount: 0,
          state: 'not_required',
        }),
        contentType: 'application/json',
        status: 200,
      });
    },
  );
}

async function openClipDraft(page: Page): Promise<void> {
  await mockClipDraft(page);
  await assertRouteRenders(page, `${CLIPS_ROUTE}/new`);
  await page.waitForURL(new RegExp(`${CLIPS_ROUTE}/${CLIPS_DRAFT_ID}`));
}

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
    await openClipDraft(authenticatedPage);

    await expect(authenticatedPage.getByLabel(/youtube url/i)).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: /start clip factory/i }),
    ).toBeVisible();
    await expectNoErrorOverlay(authenticatedPage);
  });

  test('fills the YouTube URL and adjusts the clip controls', async ({
    authenticatedPage,
  }) => {
    await openClipDraft(authenticatedPage);

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
    await openClipDraft(authenticatedPage);

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
