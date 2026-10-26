import {
  EditorProjectStatus,
  EditorTrackType,
  IngredientFormat,
} from '@genfeedai/contracts';
import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

const base = '/test-org/brand-1/storyboard';
const time = '2026-10-26T00:00:00.000Z';
const hash = 'c'.repeat(64);
const narration =
  'Most creators quit in the first ninety days. Not because they lack ideas.';

/** An approved long-form storyboard whose presenter track has rendered. */
const run: StoryboardRun = {
  id: 'long-form-run',
  brandId: 'brand-1',
  organizationId: 'mock-org-id-e2e-test',
  createdAt: time,
  updatedAt: time,
  config: {
    contract: 'storyboard-run',
    version: 1,
    revision: 4,
    approvedRevision: 4,
    clientRequestId: '6b1f6c2e-1c0e-4a7e-9f43-0c1d2e3f4a5b',
    createdByUserId: 'mock-user-id-e2e-test',
    submittedInputHash: 'a'.repeat(64),
    state: 'approved',
    sourceSnapshot: {
      selector: {
        kind: 'brief',
        brief: 'Voice note about consistency.',
        length: 'long_form',
      },
      capturedAt: time,
    },
    plan: {
      title: 'Why creators quit',
      logline: 'A short talk on consistency.',
      videoModelKey: null,
      format: '16:9',
      runtimeBudgetSeconds: null,
      styleReferenceAssetIds: [],
      cast: [
        {
          id: 'presenter',
          name: 'Presenter',
          referenceAssetIds: [],
          avatarAssetId: 'presenter-photo',
          voiceId: 'presenter-voice',
        },
      ],
      shots: [],
      longForm: {
        runtimeBudgetSeconds: 600,
        presenterId: 'presenter',
        segments: [
          {
            id: 'segment-hook',
            ordinal: 1,
            sectionLabel: 'Hook',
            narration,
            estimatedSeconds: 6,
            cutaways: [
              {
                id: 'cutaway-calendar',
                kind: 'still',
                brief: 'A wall calendar with crossed-out days',
                startSeconds: 1,
                durationSeconds: 3,
              },
            ],
          },
        ],
      },
    },
    aRoll: {
      presenterId: 'presenter',
      modelKey: 'heygen/avatar-iv',
      chunks: [
        {
          id: '9d3c1f2e-4b5a-4c6d-8e7f-0a1b2c3d4e5f',
          ordinal: 1,
          pieces: [
            { segmentId: 'segment-hook', start: 0, end: narration.length },
          ],
          text: narration,
          fingerprint: hash,
          estimatedSeconds: 6,
          state: 'ready',
          actorUserId: 'mock-user-id-e2e-test',
          credits: 30,
          billingMode: 'platform',
          assetId: 'presenter-render',
          durationSeconds: 6.2,
          createdAt: time,
          updatedAt: time,
        },
      ],
    },
  },
};

test('reviews a long-form script and opens the rendered edit in the Editor', async ({
  authenticatedPage: page,
}) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  let assembled = false;
  await page.route(
    '**/brands/brand-1/storyboard-runs/long-form-run**',
    async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/capabilities')) {
        await route.fulfill({
          json: {
            version: 1,
            runId: run.id,
            runRevision: run.config.revision,
            capabilityVersion: 'b'.repeat(64),
            status: 'unavailable',
            requestedModelKey: null,
            effectiveModel: null,
            eligibleModels: [],
            reasonCode: 'MODEL_UNAVAILABLE',
          },
        });
        return;
      }
      if (path.endsWith('/long-form/assemble')) {
        assembled = true;
        await route.fulfill({
          json: { editorProjectId: 'long-form-edit', timeline: {} },
        });
        return;
      }
      if (route.request().method() !== 'GET')
        throw new Error(`Unexpected mutation: ${path}`);
      const { id, ...attributes } = run;
      await route.fulfill({
        json: { data: { id, type: 'content-run', attributes } },
      });
    },
  );
  await page.route('**/editor-projects/long-form-edit**', async (route) => {
    await route.fulfill({
      json: {
        data: {
          id: 'long-form-edit',
          type: 'editor-project',
          attributes: {
            name: 'Why creators quit',
            settings: {
              backgroundColor: '#000000',
              format: IngredientFormat.LANDSCAPE,
              fps: 30,
              width: 1920,
              height: 1080,
            },
            status: EditorProjectStatus.DRAFT,
            totalDurationFrames: 186,
            tracks: [
              {
                id: 'presenter-track',
                type: EditorTrackType.VIDEO,
                name: 'Presenter',
                isMuted: false,
                isLocked: false,
                volume: 100,
                clips: [
                  {
                    id: 'presenter-clip',
                    ingredientId: 'presenter-render',
                    ingredientUrl:
                      'https://cdn.genfeed.ai/fixture/presenter-render.mp4',
                    startFrame: 0,
                    durationFrames: 186,
                    sourceStartFrame: 0,
                    sourceEndFrame: 186,
                    effects: [],
                    volume: 100,
                  },
                ],
              },
            ],
            isDeleted: false,
            isLocked: false,
            createdAt: time,
            updatedAt: time,
          },
        },
      },
    });
  });

  await page.goto(`${base}/${run.id}`);
  await assertNoErrorBoundaryFallback(page);
  await expect(
    page.getByRole('heading', { name: 'Make the video' }),
  ).toBeVisible();
  await expect(page.getByLabel('Narration')).toHaveValue(narration);
  await expect(
    page.getByText('0 of 1 cutaways have footage', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('1 of 1 parts ready', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Render presenter' }),
  ).toBeEnabled();

  await page.getByRole('button', { name: 'Open the edit' }).click();
  await expect.poll(() => assembled).toBe(true);
  await expect(page).toHaveURL(/\/editor\/long-form-edit$/);
  expect(pageErrors).toEqual([]);
});
