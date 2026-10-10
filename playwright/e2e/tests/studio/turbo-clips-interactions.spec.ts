import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';
import {
  assertRouteRenders,
  expectNoErrorOverlay,
} from '../../utils/route-assertions';

const CLIPS_ROUTE = '/test-org/brand-1/studio/clips';
const CLIPS_PROJECT_ID = '000000000000000000009876';
const YOUTUBE_URL = 'https://www.youtube.com/watch?v=abc12345678';

async function openSourceImport(page: Page): Promise<void> {
  await assertRouteRenders(page, `${CLIPS_ROUTE}/new`);
  await expect(page.getByLabel(/youtube url/i)).toBeVisible();
}

test.describe('Studio clip source import — deep interactions', () => {
  test.setTimeout(90_000);

  test('renders the import form without creating a draft', async ({
    authenticatedPage: page,
  }) => {
    const draftRequests: string[] = [];
    await page.route('**/clip-projects/drafts', async (route) => {
      draftRequests.push(route.request().method());
      await route.fulfill({
        json: { message: 'Unexpected draft creation' },
        status: 409,
      });
    });
    await openSourceImport(page);
    await expect(page).toHaveURL(new RegExp(`${CLIPS_ROUTE}/new$`));
    await expect(
      page.getByRole('heading', { name: /import a clip source/i }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /import & transcribe/i }),
    ).toBeDisabled();
    await expect(page.locator('#max-clips')).toHaveCount(0);
    await expect(page.locator('#min-virality')).toHaveCount(0);
    expect(draftRequests).toEqual([]);
    await expectNoErrorOverlay(page);
  });

  test('requires a source and switches between YouTube and upload inputs', async ({
    authenticatedPage: page,
  }) => {
    await openSourceImport(page);
    const submit = page.getByRole('button', { name: /import & transcribe/i });
    await page.getByLabel(/youtube url/i).fill(YOUTUBE_URL);
    await expect(submit).toBeEnabled();
    await page.getByLabel(/youtube url/i).fill('');
    await expect(submit).toBeDisabled();
    await page.getByRole('button', { name: /upload audio or video/i }).click();
    await expect(page.getByLabel(/youtube url/i)).toHaveCount(0);
    await expect(submit).toBeDisabled();
    await page.getByRole('button', { name: /youtube url/i }).click();
    await expect(page.getByLabel(/youtube url/i)).toHaveValue('');
    await expectNoErrorOverlay(page);
  });

  test('submits one source analysis request and enters the persisted project route', async ({
    authenticatedPage: page,
  }) => {
    const requests: Record<string, unknown>[] = [];
    const generationRequests: string[] = [];
    await page.route('**/clip-projects/analyze', async (route) => {
      requests.push(route.request().postDataJSON());
      await route.fulfill({
        json: { projectId: CLIPS_PROJECT_ID, status: 'analyzing' },
        status: 202,
      });
    });
    for (const path of [
      '**/clip-projects/from-youtube',
      '**/clip-projects/*/generate',
    ]) {
      await page.route(path, async (route) => {
        generationRequests.push(route.request().url());
        await route.fulfill({
          json: { message: 'Generation is outside source import' },
          status: 409,
        });
      });
    }
    await page.route(`**/clip-projects/${CLIPS_PROJECT_ID}`, (route) =>
      route.fulfill({
        json: {
          data: {
            id: CLIPS_PROJECT_ID,
            type: 'clip-projects',
            attributes: { status: 'analyzing', sourceVideoUrl: YOUTUBE_URL },
          },
        },
      }),
    );
    await page.route(
      `**/clip-projects/${CLIPS_PROJECT_ID}/highlights`,
      (route) =>
        route.fulfill({
          json: {
            projectId: CLIPS_PROJECT_ID,
            highlights: [],
            status: 'analyzing',
          },
        }),
    );
    await page.route(
      `**/clip-projects/${CLIPS_PROJECT_ID}/hook-approval`,
      (route) =>
        route.fulfill({
          json: { attempt: 0, remainingClipCount: 0, state: 'not_required' },
        }),
    );
    await openSourceImport(page);
    await page.getByLabel(/youtube url/i).fill(YOUTUBE_URL);
    await page.getByRole('button', { name: /import & transcribe/i }).click();
    await expect(page).toHaveURL(
      new RegExp(`${CLIPS_ROUTE}/${CLIPS_PROJECT_ID}$`),
    );
    await expect(
      page
        .getByRole('status')
        .filter({ hasText: /transcribing and analyzing this source/i }),
    ).toBeVisible();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      youtubeUrl: YOUTUBE_URL,
      brandId: 'brand-1',
      language: 'en',
    });
    expect(requests[0]).not.toHaveProperty('avatarId');
    expect(requests[0]).not.toHaveProperty('voiceId');
    expect(generationRequests).toEqual([]);
    await expectNoErrorOverlay(page);
  });
});
