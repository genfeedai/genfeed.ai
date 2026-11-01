import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import type { Page } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';
import { assertNoErrorBoundaryFallback } from '../../utils/route-assertions';

const base = '/test-org/brand-1/storyboard';
const time = '2026-11-01T00:00:00.000Z';

/** An approved slideshow whose slide images have all been drawn. */
const run: StoryboardRun = {
  id: 'slideshow-run',
  brandId: 'brand-1',
  organizationId: 'mock-org-id-e2e-test',
  createdAt: time,
  updatedAt: time,
  config: {
    contract: 'storyboard-run',
    version: 1,
    revision: 5,
    approvedRevision: 5,
    clientRequestId: '0b1d7d36-2d63-4c52-9b0e-8a9f3c1d2e4f',
    createdByUserId: 'mock-user-id-e2e-test',
    submittedInputHash: 'a'.repeat(64),
    state: 'approved',
    sourceSnapshot: {
      selector: {
        kind: 'brief',
        brief: 'Three habits of calm founders',
        length: 'slideshow',
      },
      capturedAt: time,
    },
    plan: {
      kind: 'slideshow',
      title: 'Three calm habits',
      logline: 'Swipe for three habits of calm founders.',
      videoModelKey: null,
      format: '4:5',
      runtimeBudgetSeconds: null,
      styleReferenceAssetIds: [],
      cast: [],
      shots: ['Wake early', 'Plan the day', 'Log off'].map((label, index) => ({
        id: `slide-${index + 1}`,
        ordinal: index + 1,
        sectionLabel: label,
        action: `${label}, shot on a quiet wooden desk`,
        durationSeconds: null,
        onScreenSpeaker: false,
        stillFreshness: 'fresh' as const,
        stillAssetId: `slide-image-${index + 1}`,
        transition: 'cut' as const,
      })),
    },
  },
};

interface SlideshowRouteState {
  postBody?: { expectedRevision?: number };
}

/** Serves the slideshow run and the one draft-post endpoint; nothing else may write. */
async function routeSlideshowRun(page: Page, state: SlideshowRouteState) {
  await page.route(
    '**/brands/brand-1/storyboard-runs/slideshow-run**',
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
      if (path.endsWith('/slideshow/post')) {
        state.postBody = route.request().postDataJSON();
        await route.fulfill({
          json: { isExisting: false, postId: 'slideshow-post', slideCount: 3 },
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
}

test('reviews an approved slideshow and saves it as one draft post', async ({
  authenticatedPage: page,
}) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const state: SlideshowRouteState = {};
  await routeSlideshowRun(page, state);

  await page.goto(`${base}/${run.id}`);
  await assertNoErrorBoundaryFallback(page);
  await expect(
    page.getByText('3 of 3 images ready', { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('list', { name: 'Slides' })).toBeVisible();
  await expect(
    page.getByLabel('Name of slide 2', { exact: true }),
  ).toBeVisible();
  // A slideshow has no shots, runtime or animatic.
  await expect(page.getByRole('button', { name: 'Add shot' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Save as draft post' }).click();
  await expect.poll(() => state.postBody?.expectedRevision).toBe(5);
  await expect(page).toHaveURL(/\/publishing\/posts\/slideshow-post$/);
  expect(pageErrors).toEqual([]);
});

test('starts a slideshow from a brief as a 4:5 storyboard', async ({
  authenticatedPage: page,
}) => {
  let created: StoryboardRun | undefined;
  await page.route('**/brands/brand-1/storyboard-runs**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    const method = route.request().method();
    if (method === 'POST' && pathname.endsWith('/storyboard-runs')) {
      const input = route.request().postDataJSON();
      expect(input.source).toEqual({
        kind: 'brief',
        brief: 'Three habits of calm founders',
        length: 'slideshow',
      });
      expect(input.planSettings).toMatchObject({
        kind: 'slideshow',
        format: '4:5',
        runtimeBudgetSeconds: null,
      });
      created = {
        ...run,
        id: 'new-slideshow',
        config: {
          ...run.config,
          clientRequestId: input.clientRequestId,
          revision: 1,
          approvedRevision: undefined,
          state: 'planning',
          sourceSnapshot: { capturedAt: time, selector: input.source },
          plan: {
            ...input.planSettings,
            title: '',
            logline: '',
            shots: [],
          },
        },
      };
    } else if (method !== 'GET')
      throw new Error(`Unexpected mutation: ${method} ${pathname}`);
    if (!created) {
      await route.fulfill({ json: { data: [] } });
      return;
    }
    if (pathname.endsWith('/capabilities')) {
      await route.fulfill({
        json: {
          version: 1,
          runId: created.id,
          runRevision: created.config.revision,
          capabilityVersion: 'c'.repeat(64),
          status: 'unavailable',
          requestedModelKey: null,
          effectiveModel: null,
          eligibleModels: [],
          reasonCode: 'MODEL_UNAVAILABLE',
        },
      });
      return;
    }
    const { id, ...attributes } = created;
    await route.fulfill({
      json: { data: { id, type: 'content-run', attributes } },
    });
  });

  await page.goto(`${base}/new`);
  await page.getByRole('button', { name: 'Slideshow', exact: true }).click();
  await expect(
    page.getByRole('combobox', { name: 'Runtime budget (seconds)' }),
  ).toHaveCount(0);
  await page
    .getByLabel('Brief', { exact: true })
    .fill('Three habits of calm founders');
  await page
    .getByRole('button', { name: 'Save storyboard', exact: true })
    .click();
  await expect(page).toHaveURL(/\/storyboard\/new-slideshow$/);
});
