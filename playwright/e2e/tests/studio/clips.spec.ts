import { brandPath } from '@e2e/utils/app-chrome';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';
import { skipIfPlaywrightAuthBypassed } from '../../utils/playwright-auth-bypass';

/**
 * E2E Tests for YouTube → AI Clip Factory (/studio/clips)
 *
 * All clip-project and clip-result API requests are mocked.
 */

const CLIPS_URL = brandPath(APP_ROUTES.STUDIO.CLIPS);
const API_ANALYZE = '**/clip-projects/analyze';
const API_CREATE_FROM_YOUTUBE = '**/clip-projects/from-youtube';
const API_PREPARE_UPLOAD = '**/clip-projects/from-upload';
const API_GENERATE = '**/clip-projects/*/generate';
const API_HIGHLIGHTS = '**/clip-projects/*/highlights';
const API_HOOK_APPROVAL = '**/clip-projects/*/hook-approval';
const API_PROJECT = '**/clip-projects/*';
const API_FINALIZE_UPLOAD = '**/clip-projects/*/source/finalize';
const API_RETRY_FAILED = '**/clip-projects/*/retry-failed';
const API_REWRITE = '**/clip-projects/*/highlights/*/rewrite';
const API_CLIP_RESULTS = '**/clip-results**';

function isClipProjectCollectionUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname;
    return /\/clip-projects\/?$/.test(pathname);
  } catch {
    return false;
  }
}

const MOCK_PROJECT_ID = '000000000000000000001234';
const MOCK_YOUTUBE_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

function jsonApiProject(
  status: string,
  attributes: Record<string, unknown> = {},
): {
  data: {
    attributes: Record<string, unknown> & { status: string };
    id: string;
    type: 'clip-projects';
  };
} {
  return {
    data: {
      attributes: { status, ...attributes },
      id: MOCK_PROJECT_ID,
      type: 'clip-projects',
    },
  };
}

/**
 * Mirrors the clip-results poll interval in the progress-step effect of
 * `apps/app/app/(protected)/[orgSlug]/[brandSlug]/studio/clips/useStudioClipsPage.ts`.
 * Waits below are derived from it with headroom so a loaded CI runner cannot
 * turn "the app is a little slow" into a test failure.
 */
const CLIP_POLL_INTERVAL_MS = 3_000;
const CLIP_POLL_WAIT_MS = CLIP_POLL_INTERVAL_MS * 5;

const mockHighlights = [
  {
    clip_type: 'hook',
    end_time: 30,
    id: 'h1',
    start_time: 0,
    summary: 'Nobody talks about this productivity hack.',
    tags: ['productivity', 'hook'],
    title: 'The Hook',
    virality_score: 87,
  },
  {
    clip_type: 'story',
    end_time: 90,
    id: 'h2',
    start_time: 45,
    summary: 'Three years ago I was broke. Now I run a seven-figure business.',
    tags: ['story'],
    title: 'The Story',
    virality_score: 72,
  },
  {
    clip_type: 'educational',
    end_time: 150,
    id: 'h3',
    start_time: 120,
    summary: 'Use this one Notion template to plan your entire week.',
    tags: ['notion', 'systems'],
    title: 'The Tip',
    virality_score: 55,
  },
] as const;

const mockCompletedClipResult = {
  captionedVideoUrl: 'https://cdn.genfeed.ai/clips/h1-captioned.mp4',
  clipType: 'hook',
  duration: 30,
  endTime: 30,
  ingredientId: 'ingredient-h1',
  libraryLinkStatus: 'linked',
  startTime: 0,
  status: 'completed',
  summary: 'Edited hook summary for generation.',
  tags: ['productivity', 'hook'],
  thumbnailUrl: 'https://cdn.genfeed.ai/clips/h1-thumb.jpg',
  title: 'Edited Hook Title',
  videoUrl: 'https://cdn.genfeed.ai/clips/h1.mp4',
  viralityScore: 87,
};

async function mockGetProject(page: Page, status = 'analyzing') {
  await page.route(API_PROJECT, async (route) => {
    if (route.request().method() !== 'GET') {
      await route.fallback();
      return;
    }

    const pathname = new URL(route.request().url()).pathname;
    if (
      pathname.includes('/highlights') ||
      pathname.includes('/hook-approval') ||
      pathname.includes('/generate') ||
      pathname.includes('/analyze')
    ) {
      await route.fallback();
      return;
    }

    await route.fulfill({
      body: JSON.stringify(jsonApiProject(status)),
      contentType: 'application/json',
      status: 200,
    });
  });
}

async function mockProjectList(page: Page, projects: unknown[] = []) {
  await page.route(
    (url) => isClipProjectCollectionUrl(url.toString()),
    async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }

      await route.fulfill({
        body: JSON.stringify({ data: projects }),
        contentType: 'application/json',
        status: 200,
      });
    },
  );
}

async function mockAnalyzeRequest(page: Page) {
  await page.route(API_ANALYZE, async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        projectId: MOCK_PROJECT_ID,
        status: 'analyzing',
      }),
      contentType: 'application/json',
      status: 202,
    });
  });
}

async function mockHighlightsPolling(
  page: Page,
  {
    highlights = mockHighlights,
    status = 'analyzed',
  }: {
    highlights?: typeof mockHighlights;
    status?: 'analyzed' | 'analyzing' | 'failed';
  } = {},
) {
  await page.route(API_HIGHLIGHTS, async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        highlights,
        projectId: MOCK_PROJECT_ID,
        status,
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

async function mockHookApproval(page: Page) {
  await page.route(API_HOOK_APPROVAL, async (route) => {
    await route.fulfill({
      body: JSON.stringify({
        attempt: 0,
        remainingClipCount: 0,
        state: 'not_required',
      }),
      contentType: 'application/json',
      status: 200,
    });
  });
}

test.describe('Clip Factory', () => {
  test.beforeEach(async ({ authenticatedPage }) => {
    await mockProjectList(authenticatedPage);
    await mockGetProject(authenticatedPage);
    await mockHookApproval(authenticatedPage);
  });

  test('should load the clip factory page', async ({ authenticatedPage }) => {
    await authenticatedPage.goto(CLIPS_URL);
    await authenticatedPage.waitForLoadState('networkidle');

    await expect(authenticatedPage).toHaveURL(new RegExp(CLIPS_URL));
    await expect(authenticatedPage.getByLabel(/youtube url/i)).toBeVisible();
    await expect(authenticatedPage.locator('#youtube-url')).toHaveAttribute(
      'type',
      'url',
    );
    await expect(authenticatedPage.locator('#max-clips')).toHaveAttribute(
      'type',
      'range',
    );
    await expect(authenticatedPage.locator('#min-virality')).toHaveAttribute(
      'type',
      'range',
    );
    await expect(
      authenticatedPage.getByRole('button', {
        name: /review highlights first/i,
      }),
    ).toBeVisible();
  });

  test('lists split videos and opens generated clips', async ({
    authenticatedPage,
  }) => {
    await mockProjectList(authenticatedPage, [
      {
        attributes: {
          createdAt: '2026-08-20T10:00:00.000Z',
          name: 'Podcast ep 12',
          readyClipCount: 8,
          sourceVideoUrl: MOCK_YOUTUBE_URL,
          status: 'completed',
        },
        id: MOCK_PROJECT_ID,
      },
    ]);
    await mockGetProject(authenticatedPage, 'completed');
    await authenticatedPage.route(API_CLIP_RESULTS, async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          data: [
            {
              attributes: mockCompletedClipResult,
              id: 'clip-1',
            },
          ],
        }),
        contentType: 'application/json',
        status: 200,
      });
    });

    await authenticatedPage.goto(CLIPS_URL);
    await expect(
      authenticatedPage.getByRole('link', { name: /podcast ep 12/i }),
    ).toBeVisible();
    await expect(authenticatedPage.getByText(/8 clips/i)).toBeVisible();

    await authenticatedPage
      .getByRole('link', { name: /podcast ep 12/i })
      .click();

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`${CLIPS_URL}/${MOCK_PROJECT_ID}`),
    );
    await expect(
      authenticatedPage.getByRole('heading', { name: /clips ready/i }),
    ).toBeVisible();
  });

  test('should move into review mode and render analyzed highlights', async ({
    authenticatedPage,
  }) => {
    await mockAnalyzeRequest(authenticatedPage);
    await mockHighlightsPolling(authenticatedPage);

    await authenticatedPage.goto(CLIPS_URL);
    await authenticatedPage.getByLabel(/youtube url/i).fill(MOCK_YOUTUBE_URL);
    await authenticatedPage
      .getByRole('button', { name: /review highlights first/i })
      .click();

    await expect(
      authenticatedPage.getByRole('heading', { name: /review highlights/i }),
    ).toBeVisible();
    await expect(authenticatedPage.getByRole('textbox').first()).toHaveValue(
      'The Hook',
    );
    await expect(
      authenticatedPage.getByText(/found 3 highlights/i),
    ).toBeVisible();
  });

  test('uploads a durable source and restores its review project after reload', async ({
    authenticatedPage,
  }) => {
    let prepareBody: Record<string, unknown> | null = null;
    let uploadCompleted = false;

    await authenticatedPage.route(API_PREPARE_UPLOAD, async (route) => {
      prepareBody = JSON.parse(route.request().postData() ?? '{}') as Record<
        string,
        unknown
      >;
      await route.fulfill({
        body: JSON.stringify({
          expiresIn: 900,
          ingredientId: 'ingredient-upload-1',
          projectId: MOCK_PROJECT_ID,
          publicUrl: 'https://cdn.genfeed.ai/uploads/podcast.mp4',
          uploadUrl: 'https://uploads.genfeed.test/podcast.mp4',
        }),
        contentType: 'application/json',
        status: 201,
      });
    });
    await authenticatedPage.route(
      'https://uploads.genfeed.test/podcast.mp4',
      async (route) => {
        uploadCompleted = true;
        await route.fulfill({
          headers: { 'Access-Control-Allow-Origin': '*' },
          status: 200,
        });
      },
    );
    await authenticatedPage.route(API_FINALIZE_UPLOAD, async (route) => {
      expect(uploadCompleted).toBe(true);
      await route.fulfill({
        body: JSON.stringify({
          batchJobId: 'clip-analysis-upload-1',
          estimatedClips: 3,
          projectId: MOCK_PROJECT_ID,
          status: 'analyzing',
        }),
        contentType: 'application/json',
        status: 202,
      });
    });
    await authenticatedPage.route(API_PROJECT, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.includes('/highlights')) {
        await route.fallback();
        return;
      }
      await route.fulfill({
        body: JSON.stringify(
          jsonApiProject('analyzed', {
            settings: { flow: 'review', mode: 'avatar' },
            source: {
              artifact: {
                contentType: 'video/mp4',
                mediaUrl: 'https://cdn.genfeed.ai/uploads/podcast.mp4',
                storageKey: 'uploads/podcast.mp4',
              },
              contentType: 'video/mp4',
              filename: 'podcast.mp4',
              flow: 'review',
              ingredientId: 'ingredient-upload-1',
              kind: 'upload',
              schemaVersion: 1,
              status: 'completed',
            },
          }),
        ),
        contentType: 'application/json',
        status: 200,
      });
    });
    await mockHighlightsPolling(authenticatedPage);

    await authenticatedPage.goto(CLIPS_URL);
    await authenticatedPage
      .getByRole('button', { name: /upload audio or video/i })
      .click();
    await authenticatedPage.getByLabel(/audio or video file/i).setInputFiles({
      buffer: Buffer.from('fixture-video'),
      mimeType: 'video/mp4',
      name: 'podcast.mp4',
    });
    await authenticatedPage
      .getByRole('button', { name: /review highlights first/i })
      .click();

    await expect.poll(() => prepareBody).not.toBeNull();
    expect(prepareBody).toMatchObject({
      contentType: 'video/mp4',
      filename: 'podcast.mp4',
      flow: 'review',
      sizeBytes: 13,
    });
    await expect(authenticatedPage).toHaveURL(
      new RegExp(`${CLIPS_URL}/${MOCK_PROJECT_ID}`),
    );
    await authenticatedPage.reload();
    await expect(
      authenticatedPage.getByRole('heading', { name: /review highlights/i }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText(/found 3 highlights/i),
    ).toBeVisible();
  });

  test('preserves ready siblings and retries only degraded clip work', async ({
    authenticatedPage,
  }) => {
    let retryCount = 0;
    await authenticatedPage.route(API_PROJECT, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }
      await route.fulfill({
        body: JSON.stringify(
          jsonApiProject('partially-completed', {
            settings: { flow: 'quick', mode: 'raw-cut' },
            source: {
              contentType: 'video/mp4',
              flow: 'quick',
              kind: 'upload',
              schemaVersion: 1,
              status: 'completed',
            },
          }),
        ),
        contentType: 'application/json',
        status: 200,
      });
    });
    await authenticatedPage.route(API_CLIP_RESULTS, async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          data: [
            {
              attributes: mockCompletedClipResult,
              id: 'ready-clip',
            },
            {
              attributes: {
                ...mockCompletedClipResult,
                captionedVideoUrl: undefined,
                mediaValidation: {
                  issues: ['Rendered video is missing its source audio.'],
                  status: 'failed',
                },
                status: 'degraded',
                title: 'Needs review',
              },
              id: 'degraded-clip',
            },
          ],
        }),
        contentType: 'application/json',
        status: 200,
      });
    });
    await authenticatedPage.route(API_RETRY_FAILED, async (route) => {
      retryCount += 1;
      await route.fulfill({
        body: JSON.stringify({
          clipCount: 1,
          clipResultIds: ['retry-clip'],
          status: 'generating',
        }),
        contentType: 'application/json',
        status: 202,
      });
    });

    await authenticatedPage.goto(`${CLIPS_URL}/${MOCK_PROJECT_ID}`);
    await expect(
      authenticatedPage.getByText('Edited Hook Title'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText(/review required/i).first(),
    ).toBeVisible();
    await authenticatedPage
      .getByRole('button', { name: /retry failed clips/i })
      .click();

    await expect.poll(() => retryCount).toBe(1);
    await expect(
      authenticatedPage.getByText('Edited Hook Title'),
    ).toBeVisible();
  });

  test('should send edited highlight content when generating clips', async ({
    authenticatedPage,
  }) => {
    let generateRequestBody: Record<string, unknown> | null = null;
    let generateRequestCount = 0;

    await mockAnalyzeRequest(authenticatedPage);
    await mockHighlightsPolling(authenticatedPage);

    let hasRequestedGeneration = false;
    await authenticatedPage.route(API_GENERATE, async (route) => {
      generateRequestBody = JSON.parse(
        route.request().postData() ?? '{}',
      ) as Record<string, unknown>;
      generateRequestCount += 1;
      hasRequestedGeneration = true;
      await route.fulfill({
        body: JSON.stringify({
          clipCount: 3,
          clipResultIds: ['clip-1', 'clip-2', 'clip-3'],
          status: 'generating',
        }),
        contentType: 'application/json',
        status: 202,
      });
    });

    await authenticatedPage.route(API_PROJECT, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }

      await route.fulfill({
        body: JSON.stringify(
          jsonApiProject(hasRequestedGeneration ? 'completed' : 'analyzed'),
        ),
        contentType: 'application/json',
        status: 200,
      });
    });

    await authenticatedPage.route(API_CLIP_RESULTS, async (route) => {
      const editedHighlight = (
        generateRequestBody?.editedHighlights as
          | Array<{ id: string; summary: string; title: string }>
          | undefined
      )?.find((highlight) => highlight.id === 'h1');

      await route.fulfill({
        body: JSON.stringify({
          data: editedHighlight
            ? [
                {
                  attributes: {
                    ...mockCompletedClipResult,
                    summary: editedHighlight.summary,
                    title: editedHighlight.title,
                  },
                  id: 'clip-1',
                },
              ]
            : [],
        }),
        contentType: 'application/json',
        status: 200,
      });
    });

    await authenticatedPage.goto(CLIPS_URL);
    await authenticatedPage.getByLabel(/youtube url/i).fill(MOCK_YOUTUBE_URL);
    await authenticatedPage
      .getByRole('button', { name: /review highlights first/i })
      .click();

    await expect(authenticatedPage).toHaveURL(
      new RegExp(`${CLIPS_URL}/${MOCK_PROJECT_ID}`),
    );
    await expect(
      authenticatedPage.getByRole('heading', { name: /review highlights/i }),
    ).toBeVisible();

    const editedTitleInput = authenticatedPage.getByRole('textbox').first();
    await expect(editedTitleInput).toHaveValue('The Hook');
    await editedTitleInput.fill('Edited Hook Title');
    await authenticatedPage
      .getByPlaceholder('Edit the script or caption text for this clip...')
      .first()
      .fill('Edited hook summary for generation.');
    await authenticatedPage.getByLabel(/avatar id/i).fill('heygen-avatar-1');
    await authenticatedPage.getByLabel(/voice id/i).fill('heygen-voice-1');
    await expect(editedTitleInput).toHaveValue('Edited Hook Title');

    await authenticatedPage
      .getByRole('button', { name: /generate 3 avatar clips/i })
      .click();

    await expect.poll(() => generateRequestBody).not.toBeNull();
    expect(generateRequestCount).toBe(1);
    expect(generateRequestBody).toMatchObject({
      avatarId: 'heygen-avatar-1',
      editedHighlights: expect.arrayContaining([
        expect.objectContaining({
          id: 'h1',
          summary: 'Edited hook summary for generation.',
          title: 'Edited Hook Title',
        }),
      ]),
      selectedHighlightIds: ['h1', 'h2', 'h3'],
      mode: 'avatar',
      voiceId: 'heygen-voice-1',
    });
    const submittedEditedHighlights = generateRequestBody?.editedHighlights;
    expect(submittedEditedHighlights).toEqual(expect.any(Array));
    expect(
      (
        submittedEditedHighlights as Array<{
          id: string;
          summary: string;
          title: string;
        }>
      ).filter((highlight) => highlight.id === 'h1'),
    ).toEqual([
      {
        id: 'h1',
        summary: 'Edited hook summary for generation.',
        title: 'Edited Hook Title',
      },
    ]);

    await expect(
      authenticatedPage.getByRole('heading', { name: /clips ready/i }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('Edited Hook Title'),
    ).toBeVisible();
  });

  test('should keep polling in progress view until clips are actually completed', async ({
    authenticatedPage,
  }) => {
    // The backend stays "generating" until the test releases it, so the
    // in-progress assertions below can never race the app's poll interval.
    let hasReleasedCompletion = false;
    let hasRequestedGeneration = false;
    let projectPollCount = 0;
    let clipPollCount = 0;

    await mockAnalyzeRequest(authenticatedPage);
    await mockHighlightsPolling(authenticatedPage);

    await authenticatedPage.route(API_GENERATE, async (route) => {
      hasRequestedGeneration = true;
      await route.fulfill({
        body: JSON.stringify({
          clipCount: 3,
          clipResultIds: ['clip-1', 'clip-2', 'clip-3'],
          status: 'generating',
        }),
        contentType: 'application/json',
        status: 202,
      });
    });

    await authenticatedPage.route(API_PROJECT, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }

      // The review step also reads the project (for reference frames), so only
      // reads issued after generation started count as progress-step polls.
      if (!hasRequestedGeneration) {
        await route.fulfill({
          body: JSON.stringify(jsonApiProject('analyzed')),
          contentType: 'application/json',
          status: 200,
        });
        return;
      }

      projectPollCount += 1;

      await route.fulfill({
        body: JSON.stringify(
          jsonApiProject(hasReleasedCompletion ? 'completed' : 'generating'),
        ),
        contentType: 'application/json',
        status: 200,
      });
    });

    await authenticatedPage.route(API_CLIP_RESULTS, async (route) => {
      clipPollCount += 1;
      const data = hasReleasedCompletion
        ? [
            {
              attributes: mockCompletedClipResult,
              id: 'clip-1',
            },
          ]
        : [];

      await route.fulfill({
        body: JSON.stringify({ data }),
        contentType: 'application/json',
        status: 200,
      });
    });

    await authenticatedPage.goto(CLIPS_URL);
    await authenticatedPage.getByLabel(/youtube url/i).fill(MOCK_YOUTUBE_URL);
    await authenticatedPage
      .getByRole('button', { name: /review highlights first/i })
      .click();

    await authenticatedPage.getByLabel(/avatar id/i).fill('heygen-avatar-1');
    await authenticatedPage.getByLabel(/voice id/i).fill('heygen-voice-1');

    await authenticatedPage
      .getByRole('button', { name: /generate 3 avatar clips/i })
      .click();

    await expect(
      authenticatedPage.getByText(/generating 3 avatar clips/i),
    ).toBeVisible();

    // Polling must continue while the backend still reports `generating`.
    await expect
      .poll(() => projectPollCount, { timeout: CLIP_POLL_WAIT_MS })
      .toBeGreaterThan(1);
    await expect
      .poll(() => clipPollCount, { timeout: CLIP_POLL_WAIT_MS })
      .toBeGreaterThan(1);

    // ...and the view must still be in progress, never a premature done state.
    // Completion is gated on `hasReleasedCompletion`, not on elapsed time, so
    // this cannot flake by the app simply polling faster than expected.
    await expect(
      authenticatedPage.getByText(/generating 3 avatar clips/i),
    ).toBeVisible();
    await expect(authenticatedPage.getByText(/done —/i)).toHaveCount(0);

    hasReleasedCompletion = true;

    await expect(
      authenticatedPage.getByText(/done — 1 clip generated/i),
    ).toBeVisible({ timeout: CLIP_POLL_WAIT_MS });
    await expect(
      authenticatedPage.getByRole('button', { name: /^edit$/i }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('In Library', { exact: true }),
    ).toBeVisible();
  });

  test('should rewrite the selected highlight script in place', async ({
    authenticatedPage,
  }) => {
    await mockAnalyzeRequest(authenticatedPage);
    await mockHighlightsPolling(authenticatedPage);

    await authenticatedPage.route(API_REWRITE, async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          originalScript: mockHighlights[0].summary,
          rewrittenScript:
            'Nobody is using this productivity system the right way.',
        }),
        contentType: 'application/json',
        status: 200,
      });
    });

    await authenticatedPage.goto(CLIPS_URL);
    await authenticatedPage.getByLabel(/youtube url/i).fill(MOCK_YOUTUBE_URL);
    await authenticatedPage
      .getByRole('button', { name: /review highlights first/i })
      .click();

    await authenticatedPage
      .getByRole('button', { name: /make it viral/i })
      .first()
      .click();

    await expect(authenticatedPage.locator('textarea').first()).toHaveValue(
      'Nobody is using this productivity system the right way.',
    );
  });

  test('should stay usable when analyze fails', async ({
    authenticatedPage,
  }) => {
    await authenticatedPage.route(API_ANALYZE, async (route) => {
      await route.fulfill({
        body: JSON.stringify({ message: 'Internal server error' }),
        contentType: 'application/json',
        status: 500,
      });
    });

    await authenticatedPage.goto(CLIPS_URL);
    await authenticatedPage.getByLabel(/youtube url/i).fill(MOCK_YOUTUBE_URL);
    await authenticatedPage
      .getByRole('button', { name: /review highlights first/i })
      .click();

    await expect(
      authenticatedPage.getByText(/internal server error/i),
    ).toBeVisible();
    await expect(authenticatedPage.getByLabel(/youtube url/i)).toBeVisible();
  });

  test('should complete a raw-cut project without avatar identity', async ({
    authenticatedPage,
  }) => {
    let createRequestBody: Record<string, unknown> | null = null;

    await authenticatedPage.route(API_CREATE_FROM_YOUTUBE, async (route) => {
      createRequestBody = JSON.parse(
        route.request().postData() ?? '{}',
      ) as Record<string, unknown>;
      await route.fulfill({
        body: JSON.stringify({
          batchJobId: 'raw-cut-job-1',
          estimatedClips: 1,
          projectId: MOCK_PROJECT_ID,
          status: 'processing',
        }),
        contentType: 'application/json',
        status: 202,
      });
    });

    await authenticatedPage.route(API_PROJECT, async (route) => {
      if (route.request().method() !== 'GET') {
        await route.fallback();
        return;
      }

      await route.fulfill({
        body: JSON.stringify(jsonApiProject('completed')),
        contentType: 'application/json',
        status: 200,
      });
    });

    await authenticatedPage.route(API_CLIP_RESULTS, async (route) => {
      await route.fulfill({
        body: JSON.stringify({
          data: [
            {
              attributes: {
                ...mockCompletedClipResult,
                mode: 'raw-cut',
                readiness: {
                  blockingReasons: [],
                  readyActions: ['download'],
                  state: 'ready',
                  terminal: true,
                },
              },
              id: 'raw-cut-1',
            },
          ],
        }),
        contentType: 'application/json',
        status: 200,
      });
    });

    await authenticatedPage.route(
      'https://cdn.genfeed.ai/**',
      async (route) => {
        await route.fulfill({
          body: '',
          contentType: 'video/mp4',
          headers: { 'Access-Control-Allow-Origin': '*' },
          status: 200,
        });
      },
    );

    await authenticatedPage.goto(CLIPS_URL);
    await authenticatedPage.getByRole('button', { name: /raw cut/i }).click();
    await authenticatedPage.getByLabel(/youtube url/i).fill(MOCK_YOUTUBE_URL);
    await authenticatedPage
      .getByRole('button', { name: /start clip factory/i })
      .click();

    await expect.poll(() => createRequestBody).not.toBeNull();
    expect(createRequestBody).toMatchObject({
      mode: 'raw-cut',
      youtubeUrl: MOCK_YOUTUBE_URL,
    });
    expect(createRequestBody).not.toHaveProperty('avatarId');
    expect(createRequestBody).not.toHaveProperty('voiceId');
    await expect(
      authenticatedPage.getByText('Raw cut', { exact: true }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('In Library', { exact: true }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByLabel('Preview Edited Hook Title'),
    ).toBeVisible();
    await authenticatedPage.evaluate(() => {
      const target = window as Window & {
        clipDownloadHref?: string;
        clipDownloadName?: string;
      };
      const originalDispatchEvent = HTMLAnchorElement.prototype.dispatchEvent;

      HTMLAnchorElement.prototype.dispatchEvent = function captureDownloadClick(
        event,
      ) {
        target.clipDownloadHref = this.href;
        target.clipDownloadName = this.download;
        HTMLAnchorElement.prototype.dispatchEvent = originalDispatchEvent;
        return event.type === 'click';
      };
    });

    await authenticatedPage
      .getByRole('button', { name: /download video/i })
      .click();
    await expect
      .poll(() =>
        authenticatedPage.evaluate(
          () =>
            (window as Window & { clipDownloadHref?: string }).clipDownloadHref,
        ),
      )
      .toMatch(/^blob:/);
    await expect
      .poll(() =>
        authenticatedPage.evaluate(
          () =>
            (
              window as Window & {
                clipDownloadName?: string;
              }
            ).clipDownloadName,
        ),
      )
      .toBe('Edited_Hook_Title.mp4');
  });
});

// A sibling describe (no `beforeEach` requiring `authenticatedPage`) — the
// suite above's beforeEach shares the default `page`/`context` with any
// fixture requested by a test in the same describe block, so an
// unauthenticated test nested inside it would inherit the authenticated
// cookies before its own null-session mocks ever apply (nightly full tier,
// #2982). Every other unauthenticated-access suite in this repo
// (discovery.spec.ts, tasks.spec.ts, post-detail.spec.ts, etc.) isolates the
// test the same way.
test.describe('Clip Factory — Unauthenticated Access', () => {
  test('unauthenticated user is redirected away from clip factory', async ({
    unauthenticatedPage,
  }) => {
    skipIfPlaywrightAuthBypassed();
    await unauthenticatedPage.goto(CLIPS_URL, {
      waitUntil: 'domcontentloaded',
    });

    await unauthenticatedPage.waitForURL(/\/sign-in|\/login/, {
      timeout: 15000,
    });
    expect(unauthenticatedPage.url()).toMatch(/\/sign-in|\/login/);
  });
});
