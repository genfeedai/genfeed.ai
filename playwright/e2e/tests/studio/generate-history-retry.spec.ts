import path from 'node:path';
import { brandPath } from '@e2e/utils/app-chrome';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Page, Route } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { test as base, expect } from '../../fixtures/auth.fixture';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      page.on('response', (response) => {
        if (response.status() >= 400) {
          console.info(
            `History browser HTTP ${response.status()}: ${response.url()}`,
          );
        }
      });
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

function visibleFrameworkDialogs(page: Page) {
  return page.locator(
    '[data-nextjs-dialog]:visible, ' +
      '[data-nextjs-dialog-root]:visible, ' +
      '[data-nextjs-dialog-overlay]:visible',
  );
}

async function expectHistoryHasNoBlockingErrors(page: Page): Promise<void> {
  await assertNoErrorBoundaryFallback(page, new URL(page.url()).pathname);
  await expect(
    visibleFrameworkDialogs(page),
    'Generate history rendered a visible Next error overlay',
  ).toHaveCount(0, { timeout: 1_000 });
}

for (const colorScheme of ['light', 'dark'] as const) {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`history keyboard retry ${colorScheme} ${viewport.width}`, async ({
      authenticatedPage: page,
    }, testInfo) => {
      test.setTimeout(90_000);
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme });
      await page.addInitScript((theme) => {
        localStorage.setItem('theme', theme);
      }, colorScheme);
      await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
      let galleryRequests = 0;
      let release!: () => void;
      const pending = new Promise<void>((resolve) => {
        release = resolve;
      });
      const gallery = async (route: Route) => {
        if (
          route.request().method() !== 'GET' ||
          !new URL(route.request().url()).searchParams.has('categories')
        ) {
          await route.fallback();
          return;
        }
        galleryRequests += 1;
        if (galleryRequests === 1) {
          await route.fulfill({
            status: 503,
            contentType: 'application/json',
            body: JSON.stringify({
              errors: [
                { status: '503', detail: 'History temporarily unavailable' },
              ],
            }),
          });
          return;
        }
        await pending;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [
              {
                id: 'history-restored-video',
                type: 'ingredients',
                attributes: {
                  category: 'VIDEO',
                  status: 'UPLOADED',
                  scope: 'USER',
                  prompt: {
                    id: 'history-prompt',
                    original: 'Owned uploaded video restored after retry',
                  },
                  metadata: {
                    id: 'history-metadata',
                    label: 'History retry video',
                    width: 1080,
                    height: 1920,
                    duration: 10,
                    size: 2048,
                  },
                  cdnUrl: 'https://cdn.genfeed.ai/mock/history-restored.mp4',
                  createdAt: '2026-09-30T10:00:00.000Z',
                  width: 1080,
                  height: 1920,
                },
              },
            ],
            meta: { page: 1, pageSize: 100, totalCount: 1 },
          }),
        });
      };
      await page.route('**/v1/ingredients**', gallery);
      await page.route('**/cdn.genfeed.ai/mock/history-restored.mp4', (route) =>
        route.fulfill({
          contentType: 'video/mp4',
          path: path.join(
            process.cwd(),
            'playwright/e2e/fixtures/media/studio-clip.mp4',
          ),
        }),
      );
      await page.goto(brandPath(APP_ROUTES.STUDIO.GENERATE), {
        waitUntil: 'domcontentloaded',
      });
      const alert = page
        .getByRole('alert')
        .filter({ hasText: 'Generation history couldn’t load' });
      await expect(alert).toBeVisible();
      await expect(page.getByTestId('studio-generate-results')).toHaveCount(0);
      const composer = page
        .getByTestId('studio-generate-prompt')
        .getByRole('textbox');
      await expect(composer).toBeEnabled();
      await expect(
        page.getByRole('dialog', { name: 'Request failed', exact: true }),
      ).toHaveCount(0);
      await expectHistoryHasNoBlockingErrors(page);
      await page.screenshot({
        path: testInfo.outputPath('before-retry.png'),
        fullPage: true,
      });
      const retry = page.getByRole('button', {
        name: 'Retry history',
        exact: true,
      });
      await retry.focus();
      await page.keyboard.press('Enter');
      await expect(retry).toBeDisabled();
      await expect(retry).toHaveAttribute('aria-busy', 'true');
      await expect(retry).toHaveText('Retry history', { useInnerText: true });
      await expect(retry).toBeVisible();
      await expect(
        page.getByRole('status').filter({ hasText: 'Retrying history…' }),
      ).toBeVisible();
      await expect.poll(() => galleryRequests).toBe(2);
      await page.keyboard.press('Enter');
      expect(galleryRequests).toBe(2);
      await expect(alert).toBeVisible();
      await expect(
        page.getByRole('dialog', { name: 'Request failed', exact: true }),
      ).toHaveCount(0);
      await expectHistoryHasNoBlockingErrors(page);
      expect(galleryRequests).toBe(2);
      await page.screenshot({
        path: testInfo.outputPath('retry-pending.png'),
        fullPage: true,
      });
      release();
      const restoredCard = page.getByTestId(
        'studio-asset-history-restored-video',
      );
      await expect(restoredCard).toBeVisible();
      await expect(
        restoredCard.getByRole('button', { name: 'More', exact: true }),
      ).toBeAttached();
      const restoredVideo = restoredCard.locator('video');
      await expect(restoredVideo).toHaveCount(1);
      await expect(restoredVideo).toBeVisible();
      await expect(restoredVideo).toHaveCSS('opacity', '1');
      const readMediaState = () =>
        restoredVideo.evaluate((video: HTMLVideoElement) => ({
          hasCurrentFrame:
            video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA,
          width: video.videoWidth,
          height: video.videoHeight,
          source: video.currentSrc,
          error: video.error?.code ?? null,
        }));
      await expect.poll(readMediaState).toEqual({
        hasCurrentFrame: true,
        width: 108,
        height: 192,
        source: 'https://cdn.genfeed.ai/mock/history-restored.mp4',
        error: null,
      });
      await expect(
        restoredCard.getByRole('img', {
          name: 'Video unavailable',
          exact: true,
        }),
      ).toHaveCount(0);
      await expect(
        restoredCard.locator('.masonry-skeleton, .animate-pulse'),
      ).toHaveCount(0);
      await testInfo.attach('decoded-media-state', {
        body: JSON.stringify(await readMediaState(), null, 2),
        contentType: 'application/json',
      });
      await expect(alert).toHaveCount(0);
      await expect(
        page.getByRole('dialog', { name: 'Request failed', exact: true }),
      ).toHaveCount(0);
      await expectHistoryHasNoBlockingErrors(page);
      expect(galleryRequests).toBe(2);
      await expect(composer).toBeEnabled();
      await composer.fill('Composer remains usable after history recovery');
      await expect(composer).toHaveText(
        'Composer remains usable after history recovery',
      );
      await page.screenshot({
        path: testInfo.outputPath('after-retry.png'),
        fullPage: true,
      });
      if (colorScheme === 'light' && viewport.width === 1440) {
        await page
          .getByRole('button', { name: 'Open issues overlay', exact: true })
          .click();
        await expect(visibleFrameworkDialogs(page)).not.toHaveCount(0);
        await page.locator('[data-nextjs-dialog-root]:visible').screenshot({
          path: testInfo.outputPath('visible-next-overlay-control.png'),
          animations: 'disabled',
        });
      }
    });
  }
}
