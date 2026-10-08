import { ArticleCategory, ArticleStatus } from '@genfeedai/contracts';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { createPlaywrightMockApiRoutePattern } from '../../config/environment';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { brandPath } from '../../utils/app-chrome';
import { expectNoErrorOverlay } from '../../utils/route-assertions';

for (const viewport of [
  { height: 844, width: 390 },
  { height: 900, width: 1440 },
]) {
  test(`article actions fit within the ${viewport.width}px viewport`, async ({
    authenticatedPage: page,
  }, testInfo) => {
    await page.setViewportSize(viewport);
    await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
    await page.route(
      createPlaywrightMockApiRoutePattern(
        'posts/article-responsive(?:\\?.*)?$',
      ),
      async (route) => {
        await route.fulfill({
          body: JSON.stringify({ errors: [{ detail: 'Not a post' }] }),
          contentType: 'application/json',
          status: 404,
        });
      },
    );
    let articleWrites = 0;
    await page.route(
      createPlaywrightMockApiRoutePattern(
        'articles/article-responsive(?:\\?.*)?$',
      ),
      async (route) => {
        if (route.request().method() !== 'GET') {
          articleWrites += 1;
          await route.abort();
          return;
        }
        await route.fulfill({
          body: JSON.stringify({
            data: {
              attributes: {
                brandId: 'brand-1',
                category: ArticleCategory.TUTORIAL,
                content: '<p>A published article body for responsive QA.</p>',
                label: 'How to prompt AI content: the CLEAR framework',
                organizationId: 'org-1',
                slug: 'responsive-article',
                status: ArticleStatus.PUBLISHED,
                summary: 'A complete article with an existing published state.',
                tags: [],
              },
              id: 'article-responsive',
              type: 'articles',
            },
          }),
          contentType: 'application/json',
          status: 200,
        });
      },
    );
    await page.goto(
      brandPath(`${APP_ROUTES.PUBLISHING.POSTS}/article-responsive`),
      { waitUntil: 'domcontentloaded' },
    );
    const canvas = page.getByRole('region', {
      name: 'Primary workspace canvas',
      exact: true,
    });
    await expect(
      canvas.getByRole('heading', {
        level: 1,
        name: 'How to prompt AI content: the CLEAR framework',
      }),
    ).toBeVisible();
    for (const name of ['Archive', 'Copy Article', 'Saved', 'Delete']) {
      const action = canvas.getByRole('button', { exact: true, name });
      await expect(action).toBeVisible();
      const bounds = await action.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds?.x).toBeGreaterThanOrEqual(0);
      expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(
        viewport.width,
      );
    }
    await expect(
      canvas.getByRole('button', { exact: true, name: 'Saved' }),
    ).toBeDisabled();
    await canvas.getByRole('button', { exact: true, name: 'Archive' }).click();
    const confirmation = page.getByRole('dialog');
    await expect(confirmation).toBeVisible();
    await confirmation
      .getByRole('button', { exact: true, name: 'Cancel' })
      .click();
    await expect(confirmation).not.toBeVisible();
    expect(articleWrites).toBe(0);
    await expectNoErrorOverlay(page);
    await page.screenshot({
      path: testInfo.outputPath('article-editor-actions.png'),
    });
  });
}
