import path from 'node:path';
import { brandPath } from '@e2e/utils/app-chrome';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { Route } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { test as base, expect } from '../../fixtures/auth.fixture';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

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
      await expectNoErrorOverlay(page);
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
      await expect(
        page.getByRole('status').filter({ hasText: 'Retrying history…' }),
      ).toBeVisible();
      await page.keyboard.press('Enter');
      expect(galleryRequests).toBe(2);
      await expect(alert).toBeVisible();
      await expect(
        page.getByRole('dialog', { name: 'Request failed', exact: true }),
      ).toHaveCount(0);
      await page.screenshot({
        path: testInfo.outputPath('retry-pending.png'),
        fullPage: true,
      });
      release();
      await expect(
        page.getByTestId('studio-asset-history-restored-video'),
      ).toBeVisible();
      await expect(alert).toHaveCount(0);
      await expect(
        page.getByRole('dialog', { name: 'Request failed', exact: true }),
      ).toHaveCount(0);
      await expectNoErrorOverlay(page);
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
    });
  }
}
