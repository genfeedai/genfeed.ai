import { readFileSync } from 'node:fs';
import path from 'node:path';
import { brandPath } from '@e2e/utils/app-chrome';
import { APP_ROUTES } from '@genfeedai/contracts/constants';
import type { JsonApiDocument, JsonApiResource } from '@genfeedai/helpers';
import type { Page } from '@playwright/test';
import { mockActiveSubscription } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

interface PersistedReadFixture {
  ids: Record<string, string>;
  fixtures: Record<string, JsonApiDocument>;
}
// biome-ignore lint/suspicious/noUndeclaredEnvVars: this DB-generated artifact is an explicit direct Playwright runner input, outside cached Turbo tasks.
const fixturePath = process.env.EVALUATION_READ_FIXTURE_INPUT;
function persistedFixture(): PersistedReadFixture {
  if (!fixturePath)
    throw new Error(
      'Run the isolated DB/API fixture first and supply EVALUATION_READ_FIXTURE_INPUT',
    );
  const fixture = JSON.parse(
    readFileSync(fixturePath, 'utf8'),
  ) as PersistedReadFixture;
  if (!fixture.ids?.video || !fixture.fixtures?.['/videos?lightweight=true'])
    throw new Error('Missing persisted API fixture lineage');
  return fixture;
}
function resource(document: JsonApiDocument): JsonApiResource {
  if (!document.data || Array.isArray(document.data))
    throw new Error('Expected one API resource');
  return document.data;
}
async function cleanSurface(page: Page): Promise<void> {
  await assertNoErrorBoundaryFallback(page, new URL(page.url()).pathname);
  await expect(
    page.locator(
      '[data-nextjs-dialog]:visible, [data-nextjs-dialog-root]:visible, [data-nextjs-dialog-overlay]:visible',
    ),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

for (const colorScheme of ['light', 'dark'] as const) {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`persisted Evaluation tab and warm Trends lineage ${colorScheme} ${viewport.width}`, async ({
      authenticatedPage: page,
    }, testInfo) => {
      test.skip(
        !fixturePath,
        'Requires the original isolated DB/API persisted read fixture',
      );
      test.setTimeout(120_000);
      const fixture = persistedFixture();
      const videoId = fixture.ids.video;
      const savedDocument = fixture.fixtures[`/evaluations/videos/${videoId}`];
      if (!savedDocument)
        throw new Error('Missing original persisted evaluation POST fixture');
      const saved = resource(savedDocument);
      const savedData = saved.attributes?.data as
        | { analysis?: { strengths?: string[] } }
        | undefined;
      const observation = savedData?.analysis?.strengths?.[0];
      if (!observation || !saved.id)
        throw new Error('Persisted evaluation has no saved observation/ID');
      const errors: string[] = [];
      const delivered: Array<{ path: string; document: JsonApiDocument }> = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.setViewportSize(viewport);
      await page.emulateMedia({ colorScheme });
      await page.addInitScript(
        (theme) => localStorage.setItem('theme', theme),
        colorScheme,
      );
      await mockActiveSubscription(page, { credits: 1000, plan: 'pro' });
      let committed = false;
      let evaluationPosts = 0;
      await page.route('**/fixture.test/mp4', (route) =>
        route.fulfill({
          status: 200,
          contentType: 'video/mp4',
          path: path.resolve('playwright/e2e/fixtures/media/studio-clip.mp4'),
        }),
      );
      await page.route('**/v1/**', async (route) => {
        const url = new URL(route.request().url());
        const pathname = url.pathname.replace(/^.*\/v1/, '');
        let document: JsonApiDocument | undefined;
        if (
          route.request().method() === 'POST' &&
          pathname === `/evaluations/videos/${videoId}`
        ) {
          committed = true;
          evaluationPosts += 1;
          document = savedDocument;
        } else if (route.request().method() === 'GET') {
          if (pathname === '/videos')
            document =
              fixture.fixtures[
                `${committed ? '' : 'initial:'}/videos?lightweight=true`
              ];
          else if (pathname === '/ingredients')
            document =
              fixture.fixtures[`${committed ? '' : 'initial:'}/ingredients`];
          else if (pathname === `/videos/${videoId}`)
            document =
              fixture.fixtures[`${committed ? '' : 'initial:'}${pathname}`];
          else if (pathname.startsWith('/videos/'))
            document = fixture.fixtures[pathname];
        }
        if (!document) {
          await route.fallback();
          return;
        }
        delivered.push({ path: pathname, document });
        await route.fulfill({
          status: route.request().method() === 'POST' ? 201 : 200,
          contentType: 'application/json',
          body: JSON.stringify(document),
        });
      });
      await page.goto(brandPath('/analytics/trends'));
      await expect(
        page.getByText('Persisted video', { exact: true }).first(),
      ).toBeVisible();
      // Real sidebar links retain the same SPA/query cache while opening Library.
      await page
        .locator(`a[href="${brandPath(APP_ROUTES.LIBRARY.ASSETS)}"]`)
        .first()
        .click();
      await expect(
        page.getByText('Persisted video', { exact: true }).first(),
      ).toBeVisible();
      await page.getByText('Persisted video', { exact: true }).first().click();
      await page.getByRole('tab', { name: 'Evaluation', exact: true }).click();
      await page.getByRole('button', { name: 'Run', exact: true }).click();
      await expect(page.getByText('Persuasion', { exact: true })).toBeVisible();
      await expect(page.getByText(observation, { exact: true })).toBeVisible();
      await expect(
        page.getByText('Hook Strength', { exact: true }),
      ).toBeVisible();
      expect(evaluationPosts).toBe(1);
      await cleanSurface(page);
      await page.screenshot({
        path: testInfo.outputPath('evaluation-after-action.png'),
        fullPage: true,
      });
      await page.keyboard.press('Escape');
      await page.getByText('Persisted video', { exact: true }).first().click();
      await page.getByRole('tab', { name: 'Evaluation', exact: true }).click();
      await expect(page.getByText(observation, { exact: true })).toBeVisible();
      await cleanSurface(page);
      await page.screenshot({
        path: testInfo.outputPath('evaluation-reopened.png'),
        fullPage: true,
      });
      await page.keyboard.press('Escape');
      await page
        .locator(`a[href="${brandPath('/analytics/trends')}"]`)
        .first()
        .click();
      await page
        .getByRole('button', { name: "Evaluator's observation", exact: true })
        .click();
      await expect(page.getByText(observation, { exact: true })).toBeVisible();
      await expect(
        page.getByText(
          'Layer scores are available; no written explanation was saved.',
          { exact: true },
        ),
      ).toBeVisible();
      await expect(
        page.getByText('No persuasion analysis', { exact: true }).first(),
      ).toBeVisible();
      await cleanSurface(page);
      await page.screenshot({
        path: testInfo.outputPath('trends-saved-observation-expanded.png'),
        fullPage: true,
      });
      const reopened = delivered.filter(
        (item) =>
          item.path === `/videos/${videoId}` &&
          JSON.stringify(item.document).includes(saved.id ?? 'missing'),
      );
      expect(reopened.length).toBeGreaterThan(0);
      const leaderboard = delivered.filter(
        (item) =>
          item.path === '/videos' &&
          JSON.stringify(item.document).includes(saved.id ?? 'missing'),
      );
      expect(leaderboard.length).toBeGreaterThan(0);
      await testInfo.attach('persisted-api-lineage', {
        contentType: 'application/json',
        body: JSON.stringify(
          { savedEvaluationId: saved.id, savedEvaluation: saved, delivered },
          null,
          2,
        ),
      });
      expect(errors).toEqual([]);
    });
  }
}
