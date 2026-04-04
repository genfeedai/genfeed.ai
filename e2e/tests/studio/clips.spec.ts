import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';

/**
 * E2E Tests for YouTube → AI Clip Factory (/studio/clips)
 *
 * All clip-project and clip-result API requests are mocked.
 */

const CLIPS_URL = '/studio/clips';
const API_ANALYZE = '**/clip-projects/analyze';
const API_GENERATE = '**/clip-projects/*/generate';
const API_HIGHLIGHTS = '**/clip-projects/*/highlights';
const API_PROJECT = '**/clip-projects/*';
const API_REWRITE = '**/clip-projects/*/highlights/*/rewrite';
const API_CLIP_RESULTS = '**/clip-results**';

const MOCK_PROJECT_ID = '67d3d7a5e61f9c29b72d1234';
const MOCK_YOUTUBE_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

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
  startTime: 0,
  status: 'completed',
  summary: 'Edited hook summary for generation.',
  tags: ['productivity', 'hook'],
  thumbnailUrl: 'https://cdn.genfeed.ai/clips/h1-thumb.jpg',
  title: 'Edited Hook Title',
  videoUrl: 'https://cdn.genfeed.ai/clips/h1.mp4',
  viralityScore: 87,
};

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

test.describe('Clip Factory', () => {
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
      authenticatedPage.getByRole('button', { name: /analyze video/i }),
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
      .getByRole('button', { name: /analyze video/i })
      .click();

    await expect(
      authenticatedPage.getByRole('heading', { name: /review highlights/i }),
    ).toBeVisible();
    await expect(authenticatedPage.getByDisplayValue('The Hook')).toBeVisible();
    await expect(
      authenticatedPage.getByText(/found 3 highlights/i),
    ).toBeVisible();
  });

  test('should send edited highlight content when generating clips', async ({
    authenticatedPage,
  }) => {
    let generateRequestBody: Record<string, unknown> | null = null;

    await mockAnalyzeRequest(authenticatedPage);
    await mockHighlightsPolling(authenticatedPage);

    await authenticatedPage.route(API_GENERATE, async (route) => {
      generateRequestBody = JSON.parse(
        route.request().postData() ?? '{}',
      ) as Record<string, unknown>;
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
        await route.continue();
        return;
      }

      await route.fulfill({
        body: JSON.stringify({
          data: {
            _id: MOCK_PROJECT_ID,
            status: 'generating',
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
    });

    await authenticatedPage.route(API_CLIP_RESULTS, async (route) => {
      await route.fulfill({
        body: JSON.stringify({ data: [] }),
        contentType: 'application/json',
        status: 200,
      });
    });

    await authenticatedPage.goto(CLIPS_URL);
    await authenticatedPage.getByLabel(/youtube url/i).fill(MOCK_YOUTUBE_URL);
    await authenticatedPage
      .getByRole('button', { name: /analyze video/i })
      .click();

    await expect(
      authenticatedPage.getByRole('heading', { name: /review highlights/i }),
    ).toBeVisible();

    await authenticatedPage
      .getByDisplayValue('The Hook')
      .fill('Edited Hook Title');
    await authenticatedPage
      .locator('textarea')
      .first()
      .fill('Edited hook summary for generation.');
    await authenticatedPage.getByLabel(/avatar id/i).fill('heygen-avatar-1');
    await authenticatedPage.getByLabel(/voice id/i).fill('heygen-voice-1');

    await authenticatedPage
      .getByRole('button', { name: /generate 3 clips/i })
      .click();

    await expect.poll(() => generateRequestBody).not.toBeNull();
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
      voiceId: 'heygen-voice-1',
    });

    await expect(
      authenticatedPage.getByText(/generating 3 clips/i),
    ).toBeVisible();
  });

  test('should keep polling in progress view until clips are actually completed', async ({
    authenticatedPage,
  }) => {
    let projectPollCount = 0;
    let clipPollCount = 0;

    await mockAnalyzeRequest(authenticatedPage);
    await mockHighlightsPolling(authenticatedPage);

    await authenticatedPage.route(API_GENERATE, async (route) => {
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
        await route.continue();
        return;
      }

      projectPollCount += 1;
      const status = projectPollCount >= 2 ? 'completed' : 'generating';

      await route.fulfill({
        body: JSON.stringify({
          data: {
            _id: MOCK_PROJECT_ID,
            status,
          },
        }),
        contentType: 'application/json',
        status: 200,
      });
    });

    await authenticatedPage.route(API_CLIP_RESULTS, async (route) => {
      clipPollCount += 1;
      const data =
        clipPollCount >= 2
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
      .getByRole('button', { name: /analyze video/i })
      .click();

    await authenticatedPage.getByLabel(/avatar id/i).fill('heygen-avatar-1');
    await authenticatedPage.getByLabel(/voice id/i).fill('heygen-voice-1');

    await authenticatedPage
      .getByRole('button', { name: /generate 3 clips/i })
      .click();

    await expect(
      authenticatedPage.getByText(/generating 3 clips/i),
    ).toBeVisible();
    await expect
      .poll(() => projectPollCount, { timeout: 7000 })
      .toBeGreaterThan(1);
    await expect
      .poll(() => clipPollCount, { timeout: 7000 })
      .toBeGreaterThan(1);
    await expect(
      authenticatedPage.getByText(/done — 1 clips generated/i),
    ).toBeVisible({ timeout: 8000 });
    await expect(
      authenticatedPage.getByRole('button', { name: /^edit$/i }),
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
      .getByRole('button', { name: /analyze video/i })
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
      .getByRole('button', { name: /analyze video/i })
      .click();

    await expect(
      authenticatedPage.getByText(/internal server error/i),
    ).toBeVisible();
    await expect(authenticatedPage.getByLabel(/youtube url/i)).toBeVisible();
  });

  test('unauthenticated user is redirected away from clip factory', async ({
    unauthenticatedPage,
  }) => {
    await unauthenticatedPage.goto(CLIPS_URL, {
      waitUntil: 'domcontentloaded',
    });

    await unauthenticatedPage.waitForURL(/\/sign-in|\/login/, {
      timeout: 15000,
    });
    expect(unauthenticatedPage.url()).toMatch(/\/sign-in|\/login/);
  });
});
