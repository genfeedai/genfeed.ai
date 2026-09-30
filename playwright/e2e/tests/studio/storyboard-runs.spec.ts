import { ContentRunStatus } from '@genfeedai/contracts';
import {
  BrandRemixOrganicPlatform,
  type BrandRemixRunSummary,
  type BrandRemixRunView,
} from '@genfeedai/contracts/api-types/contracts';
import type { Route } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';

const BRAND_BASE = '/test-org/brand-1';
const FIXED_TIME = '2026-09-20T10:00:00.000Z';
const RUN_ID = 'run-storyboard-1';
const TITLE = 'TikTok workflow proof clip';

const savedRun: BrandRemixRunView = {
  brand: { contextMode: 'brand', id: 'brand-1', name: 'Northstar' },
  brandId: 'brand-1',
  concept: {
    savedAt: FIXED_TIME,
    storyboard: [
      { durationSeconds: 5, ordinal: 1, visualIntent: 'Open on the proof.' },
      { durationSeconds: 7, ordinal: 2, visualIntent: 'Reveal the product.' },
    ],
  },
  contract: 'brand-remix-run',
  createdAt: FIXED_TIME,
  draft: {
    fidelityMode: 'guided',
    identity: {},
    intent: { objective: 'Create an original TikTok execution for Northstar.' },
    output: { aspectRatio: '9:16', count: 1, kind: 'image' },
    references: [],
    reviewRequired: true,
    target: { kind: 'organic', platform: BrandRemixOrganicPlatform.TIKTOK },
  },
  id: RUN_ID,
  phase: 'prefilled',
  readiness: { issues: [], state: 'ready' },
  recipeVersion: 1,
  revision: 1,
  sourceSnapshot: {
    capturedAt: FIXED_TIME,
    evidence: ['Strong proof-led structure'],
    metrics: { engagementRate: 8.4 },
    pattern: { hook: 'Outcome-led relevance hook.' },
    platform: BrandRemixOrganicPlatform.TIKTOK,
    selector: {
      kind: 'trend_reference',
      sourceReferenceId: 'tiktok-reference-1',
      trendId: 'tiktok-trend-1',
    },
    sourceId: 'tiktok-reference-1',
    title: TITLE,
  },
  status: ContentRunStatus.PENDING,
  updatedAt: FIXED_TIME,
  version: 1,
};

const summary: BrandRemixRunSummary = {
  brandId: 'brand-1',
  createdAt: FIXED_TIME,
  id: RUN_ID,
  outputKind: 'image',
  phase: 'prefilled',
  runtimeSeconds: 12,
  shotCount: 2,
  sourceKind: 'remix_discovery',
  title: TITLE,
  updatedAt: FIXED_TIME,
};

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    status: 200,
  });
}

function runDocument(run: BrandRemixRunView) {
  const { id, ...attributes } = run;
  return { data: { attributes, id, type: 'content-run' } };
}

test.describe('Storyboard runs', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.route(
      /\/brands\/brand-1\/storyboard-runs(?:\/[^/?]+)?(?:\?.*)?$/,
      async (route) => {
        if (
          new URL(route.request().url()).pathname.endsWith('/storyboard-runs')
        )
          await fulfillJson(route, { data: [] });
        else
          await route.fulfill({
            status: 404,
            contentType: 'application/json',
            body: JSON.stringify({
              errors: [{ status: '404', title: 'Not found' }],
            }),
          });
      },
    );
  });
  test('lists a saved run, opens it and restores its latest revision after reload', async ({
    authenticatedPage: page,
  }) => {
    let current = savedRun;
    let revisedObjective: string | undefined;

    await page.route(
      /\/brands\/brand-1\/content-runs\/remixes(?:\?.*)?$/,
      async (route) => {
        if (route.request().method() !== 'GET') {
          await route.fallback();
          return;
        }
        const { id, ...attributes } = summary;
        await fulfillJson(route, {
          data: [{ attributes, id, type: 'brand-remix-run-summaries' }],
        });
      },
    );
    await page.route(`**/content-runs/${RUN_ID}/remix`, async (route) => {
      if (route.request().method() === 'PATCH') {
        const body = route.request().postDataJSON() as {
          edits: { intent?: { objective?: string } };
        };
        revisedObjective = body.edits.intent?.objective;
        current = {
          ...current,
          draft: {
            ...current.draft,
            intent: {
              ...current.draft.intent,
              objective: revisedObjective ?? current.draft.intent.objective,
            },
          },
          revision: current.revision + 1,
        };
      }
      await fulfillJson(route, runDocument(current));
    });
    await page.route(`**/content-runs/${RUN_ID}/remix/start`, async (route) => {
      current = { ...current, phase: 'ready_for_review' };
      await fulfillJson(route, runDocument(current));
    });

    await page.goto(`${BRAND_BASE}/studio/storyboard`);

    const row = page
      .getByTestId('storyboard-run-row')
      .filter({ hasText: TITLE });
    await expect(row.first()).toContainText('Remix · Discovery');
    await expect(row.first()).toContainText('2 shots');
    await expect(row.first()).toContainText('12s');
    await row
      .first()
      .getByRole('link', { name: `Open ${TITLE}` })
      .click();

    await expect(page).toHaveURL(new RegExp(`/studio/storyboard/${RUN_ID}$`));
    const recipe = page.getByRole('region', { name: 'Run recipe' });
    await expect(recipe).toBeVisible();
    await expect(page.getByRole('region', { name: 'Remix run' })).toBeVisible();

    const objective = recipe.getByRole('textbox', { name: 'Objective' });
    await objective.fill('Lead with the customer proof, then the product.');
    await recipe.getByRole('button', { name: 'Generate' }).click();
    await expect
      .poll(() => revisedObjective)
      .toBe('Lead with the customer proof, then the product.');

    await page.reload();
    await expect(
      page
        .getByRole('region', { name: 'Run recipe' })
        .getByRole('textbox', { name: 'Objective' }),
    ).toHaveValue('Lead with the customer proof, then the product.');
  });

  test('leads an empty brand to the create choices', async ({
    authenticatedPage: page,
  }) => {
    await page.route(
      /\/brands\/brand-1\/content-runs\/remixes(?:\?.*)?$/,
      async (route) => {
        await fulfillJson(route, { data: [] });
      },
    );

    await page.goto(`${BRAND_BASE}/studio/storyboard`);

    await expect(page.getByText(/No storyboards yet/)).toBeVisible();
    await page.getByRole('link', { name: 'New storyboard' }).click();
    await expect(page).toHaveURL(/\/studio\/storyboard\/new$/);
    await expect(
      page.getByRole('link', { name: 'Pick a source' }),
    ).toHaveAttribute('href', /\/discovery\/overview$/);
  });
});
