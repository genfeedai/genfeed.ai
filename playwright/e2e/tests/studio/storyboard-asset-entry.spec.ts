import path from 'node:path';
import { brandPath } from '@e2e/utils/app-chrome';
import {
  createStoryboardRunSchema,
  type StoryboardRun,
} from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

for (const kind of ['image', 'video'] as const) {
  test(`owned ${kind} creates a durable unplanned Storyboard with no paid request`, async ({
    authenticatedPage: page,
  }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
    const id = `owned-${kind}-entry`;
    const requests: Array<ReturnType<typeof createStoryboardRunSchema.parse>> =
      [];
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route('**/v1/ingredients**', async (route) => {
      if (route.request().method() !== 'GET') return route.fallback();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            {
              id,
              type: 'ingredients',
              attributes: {
                category: kind.toUpperCase(),
                scope: 'USER',
                status: 'UPLOADED',
                organizationId: 'mock-org-id-e2e-test',
                brandId: 'brand-1',
                metadata: {
                  id: `metadata-${id}`,
                  label: `Owned ${kind}`,
                  size: 2048,
                  duration: kind === 'video' ? 10 : undefined,
                  width: 1080,
                  height: 1920,
                },
                createdAt: '2026-09-30T10:00:00.000Z',
                prompt: { id: `prompt-${id}`, original: 'Owned source' },
                width: 1080,
                height: 1920,
                cdnUrl: `https://cdn.genfeed.ai/mock/${id}.${kind === 'video' ? 'mp4' : 'png'}`,
              },
            },
          ],
          meta: { page: 1, pageSize: 100, totalCount: 1 },
        }),
      });
    });
    await page.route(`**/cdn.genfeed.ai/mock/${id}.*`, (route) =>
      kind === 'video'
        ? route.fulfill({
            contentType: 'video/mp4',
            path: path.join(
              process.cwd(),
              'playwright/e2e/fixtures/media/studio-clip.mp4',
            ),
          })
        : route.fulfill({
            contentType: 'image/png',
            body: Buffer.from(
              'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==',
              'base64',
            ),
          }),
    );
    await page.route('**/v1/brands/brand-1/storyboard-runs', async (route) => {
      const input = createStoryboardRunSchema.parse(
        route.request().postDataJSON(),
      );
      requests.push(input);
      await pending;
      const timestamp = '2026-09-30T10:00:00.000Z';
      const run: StoryboardRun = {
        id: `saved-${kind}-run`,
        brandId: 'brand-1',
        organizationId: 'mock-org-id-e2e-test',
        createdAt: timestamp,
        updatedAt: timestamp,
        config: {
          contract: 'storyboard-run',
          version: 1,
          revision: 1,
          clientRequestId: input.clientRequestId,
          createdByUserId: 'mock-user-id-e2e-test',
          submittedInputHash: 'a'.repeat(64),
          state: kind === 'video' ? 'awaiting_analysis' : 'storyboard',
          sourceSnapshot:
            kind === 'video'
              ? {
                  selector: { kind: 'uploaded_video', assetId: id },
                  capturedAt: timestamp,
                  assetId: id,
                  assetUpdatedAt: timestamp,
                  title: 'Owned video',
                  durationSeconds: 10,
                  sizeBytes: 2048,
                }
              : {
                  selector: { kind: 'brief', brief: '', seedImageAssetId: id },
                  capturedAt: timestamp,
                },
          plan: {
            title: '',
            logline: '',
            format: '9:16',
            runtimeBudgetSeconds: kind === 'video' ? 10 : null,
            cast: [],
            styleReferenceAssetIds: [],
            shots:
              kind === 'video'
                ? []
                : [
                    {
                      id: 'seed-shot',
                      ordinal: 1,
                      action: '',
                      onScreenSpeaker: false,
                      durationSeconds: null,
                      stillAssetId: id,
                      stillFreshness: 'stale',
                      transition: 'cut',
                    },
                  ],
          },
        },
      };
      const { id: runId, ...attributes } = run;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: { id: runId, type: 'storyboard-runs', attributes },
        }),
      });
    });
    await page.goto(brandPath(APP_ROUTES.STUDIO.PLAYGROUND), {
      waitUntil: 'domcontentloaded',
    });
    const card = page.getByTestId(`studio-asset-${id}`);
    await expect(card).toBeVisible();
    await card.getByRole('button', { name: 'More', exact: true }).focus();
    await page.keyboard.press('Enter');
    if (kind === 'video') {
      await page
        .getByRole('menuitem', { name: 'Transform', exact: true })
        .focus();
      await page.keyboard.press('ArrowRight');
    }
    const label = kind === 'video' ? 'Remix this video' : 'Add to Storyboard';
    const action = page.getByRole('menuitem', { name: label, exact: true });
    await expect(action).toBeVisible();
    if (kind === 'video') {
      await page.keyboard.press('ArrowLeft');
      await page
        .getByRole('menuitem', { name: 'Library', exact: true })
        .focus();
      await page.keyboard.press('ArrowRight');
      await expect(
        page.getByRole('menuitem', { name: 'Open in Editor', exact: true }),
      ).toBeVisible();
      await page.keyboard.press('ArrowLeft');
      await page
        .getByRole('menuitem', { name: 'Transform', exact: true })
        .focus();
      await page.keyboard.press('ArrowRight');
    }
    await expectNoErrorOverlay(page);
    await page.screenshot({
      path: testInfo.outputPath('entry-action.png'),
      fullPage: true,
    });
    await action.focus();
    await page.keyboard.press('Enter');
    await expect.poll(() => requests.length).toBe(1);
    await page.keyboard.press('Enter');
    expect(requests).toHaveLength(1);
    expect(Object.keys(requests[0]).sort()).toEqual([
      'clientRequestId',
      'source',
    ]);
    expect(requests[0].source).toEqual(
      kind === 'video'
        ? { kind: 'uploaded_video', assetId: id }
        : { kind: 'brief', brief: '', seedImageAssetId: id },
    );
    release();
    await expect(page).toHaveURL(
      new RegExp(`/test-org/brand-1/studio/storyboard/saved-${kind}-run$`),
    );
  });
}
