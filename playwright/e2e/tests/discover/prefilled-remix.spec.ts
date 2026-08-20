import type { BrandRemixRunView } from '@genfeedai/api-types/contracts';
import { ContentRunStatus } from '@genfeedai/enums';
import type { Page, Route } from '@playwright/test';
import { expect, test } from '../../fixtures/auth.fixture';

const BRAND_BASE = '/test-org/brand-1';
const FIXED_TIME = '2026-08-20T10:00:00.000Z';

type RemixPlatform = 'meta' | 'tiktok';

interface RemixFixtureOptions {
  id: string;
  platform: RemixPlatform;
  target: 'organic' | 'paid';
}

function buildRun({
  id,
  platform,
  target,
}: RemixFixtureOptions): BrandRemixRunView {
  const selector =
    platform === 'tiktok'
      ? {
          kind: 'trend_reference' as const,
          sourceReferenceId: 'tiktok-reference-1',
          trendId: 'tiktok-trend-1',
        }
      : {
          adPerformanceId: 'ad-performance-meta-1',
          kind: 'public_ad' as const,
        };

  return {
    brand: {
      contextMode: 'brand' as const,
      id: 'brand-1',
      name: 'Northstar',
    },
    brandId: 'brand-1',
    contract: 'brand-remix-run' as const,
    createdAt: FIXED_TIME,
    draft: {
      fidelityMode: 'guided' as const,
      identity: {},
      intent: {
        hook: 'Outcome-led relevance hook.',
        objective: `Create an original ${platform} execution for Northstar.`,
        structure:
          'Lead with a clear outcome, support it with proof, then close with a brand-specific action.',
      },
      output: {
        aspectRatio: platform === 'tiktok' ? '9:16' : '1:1',
        count: 1,
        kind: 'image' as const,
      },
      references: [],
      reviewRequired: true as const,
      target:
        target === 'paid'
          ? ({ kind: 'paid', platform: 'meta' } as const)
          : ({ kind: 'organic', platform: 'tiktok' } as const),
    },
    id,
    phase: 'prefilled' as const,
    readiness: { issues: [], state: 'ready' as const },
    recipeVersion: 1 as const,
    revision: 1,
    sourceSnapshot: {
      capturedAt: FIXED_TIME,
      evidence: ['Strong proof-led structure'],
      metrics: { engagementRate: 8.4 },
      pattern: {
        hook: 'Outcome-led relevance hook.',
        structure:
          'Lead with a clear outcome, support it with proof, then close with a brand-specific action.',
      },
      platform,
      selector,
      sourceId:
        platform === 'tiktok' ? 'tiktok-reference-1' : 'ad-performance-meta-1',
      title:
        platform === 'tiktok'
          ? 'TikTok workflow proof clip'
          : 'Meta proof-led winner',
    },
    status: ContentRunStatus.PENDING,
    updatedAt: FIXED_TIME,
    version: 1 as const,
  };
}

function jsonApi(run: BrandRemixRunView) {
  const { id, ...attributes } = run;
  return {
    data: {
      attributes,
      id,
      type: 'content-run',
    },
  };
}

async function fulfillJson(route: Route, body: unknown): Promise<void> {
  await route.fulfill({
    body: JSON.stringify(body),
    contentType: 'application/json',
    status: 200,
  });
}

async function routeTikTokTrend(page: Page): Promise<void> {
  await page.route('**/trends/content**', async (route) => {
    await fulfillJson(route, {
      items: [
        {
          contentRank: 1,
          contentType: 'video',
          id: 'tiktok-content-1',
          matchedTrends: ['Proof-led workflow'],
          platform: 'tiktok',
          requiresAuth: false,
          sourcePreviewState: 'live',
          sourceReferenceId: 'tiktok-reference-1',
          sourceUrl: 'https://www.tiktok.com/@creator/video/1',
          text: 'A source caption that must remain provenance only.',
          trendId: 'tiktok-trend-1',
          trendMentions: 410,
          trendTopic: 'Proof-led workflow',
          trendViralityScore: 91,
        },
      ],
      summary: {
        connectedPlatforms: ['tiktok'],
        lockedPlatforms: [],
        totalItems: 1,
        totalTrends: 1,
      },
    });
  });
}

async function routeRemixRun(
  page: Page,
  options: RemixFixtureOptions,
  onCreate: (body: Record<string, unknown>) => void,
): Promise<void> {
  let run = buildRun(options);

  await page.route('**/brands/brand-1/content-runs/remixes', async (route) => {
    onCreate(route.request().postDataJSON() as Record<string, unknown>);
    await fulfillJson(route, jsonApi(run));
  });

  await page.route(`**/content-runs/${options.id}/remix`, async (route) => {
    if (route.request().method() === 'PATCH') {
      run = {
        ...run,
        revision: run.revision + 1,
        updatedAt: '2026-08-20T10:01:00.000Z',
      };
    }
    await fulfillJson(route, jsonApi(run));
  });

  await page.route(
    `**/content-runs/${options.id}/remix/start`,
    async (route) => {
      run = {
        ...run,
        execution: {
          actualCount: 1,
          generationBrief: {
            constraints: [],
            fidelityMode: 'guided' as const,
            intent: {
              objective: run.draft.intent.objective,
              requestedText: [],
              subjects: ['Northstar'],
            },
            mediaKind: 'image' as const,
            output: { aspectRatio: run.draft.output.aspectRatio },
            provenance: [],
            references: [],
            version: 1 as const,
          },
          requestedCount: 1,
          variants: [
            {
              assetIds: ['generated-image-1'],
              id: 'variant-1',
              recipeRevision: run.revision,
              status: 'ready' as const,
            },
          ],
        },
        phase: 'ready_for_review' as const,
        status: ContentRunStatus.COMPLETED,
      };
      await fulfillJson(route, jsonApi(run));
    },
  );

  await page.route(
    `**/content-runs/${options.id}/remix/review`,
    async (route) => {
      run = {
        ...run,
        phase: 'in_review' as const,
        review: {
          approvedPostIds: [],
          batchId: 'review-batch-1',
          postIds: ['draft-post-1'],
        },
      };
      await fulfillJson(route, jsonApi(run));
    },
  );
}

test.describe('Discover prefilled remix handoff', () => {
  test('takes an eligible TikTok trend through a durable Studio run and Review draft', async ({
    authenticatedPage,
  }) => {
    let createBody: Record<string, unknown> | null = null;
    await routeRemixRun(
      authenticatedPage,
      { id: 'run-tiktok-1', platform: 'tiktok', target: 'organic' },
      (body) => {
        createBody = body;
      },
    );
    await routeTikTokTrend(authenticatedPage);

    await authenticatedPage.goto(`${BRAND_BASE}/discover/tiktok`);
    await authenticatedPage.getByRole('button', { name: 'Remix' }).click();

    await expect(
      authenticatedPage.getByRole('heading', { name: /Remix for Northstar/i }),
    ).toBeVisible();
    await expect(authenticatedPage.getByText('What is working')).toBeVisible();
    await authenticatedPage
      .getByRole('button', { name: 'Continue to Studio' })
      .click();

    await expect(authenticatedPage).toHaveURL(
      /\/studio\/generate\?run=run-tiktok-1$/,
    );
    await expect(
      authenticatedPage.getByRole('region', { name: 'Remix run' }),
    ).toBeVisible();
    await expect(createBody).toMatchObject({
      source: {
        kind: 'trend_reference',
        sourceReferenceId: 'tiktok-reference-1',
        trendId: 'tiktok-trend-1',
      },
    });

    const generate = authenticatedPage.getByRole('button', {
      name: 'Generate',
    });
    await expect(generate).toBeEnabled();
    await generate.click();
    await authenticatedPage
      .getByRole('button', { name: 'Send 1 to Review' })
      .click();

    const reviewLink = authenticatedPage.getByRole('link', {
      name: 'Open Review',
    });
    await expect(reviewLink).toHaveAttribute(
      'href',
      /\/publish\/review\?batch=review-batch-1$/,
    );
  });

  test('turns a public Meta winner into the same editable server-prefilled run', async ({
    authenticatedPage,
  }) => {
    let createBody: Record<string, unknown> | null = null;
    await routeRemixRun(
      authenticatedPage,
      { id: 'run-meta-1', platform: 'meta', target: 'paid' },
      (body) => {
        createBody = body;
      },
    );

    const metaAd = {
      channel: 'all',
      explanation: 'Proof appears before the product promise.',
      id: 'ad-performance-meta-1',
      metricLabel: 'ROAS',
      metricValue: 4.2,
      metrics: { ctr: 0.031, performanceScore: 92, roas: 4.2 },
      patternSummary: [
        {
          id: 'proof-first',
          label: 'Proof first',
          score: 92,
          summary: 'Lead with evidence before presenting the offer.',
        },
      ],
      platform: 'meta',
      source: 'public',
      sourceId: 'ad-performance-meta-1',
      title: 'Meta proof-led winner',
    };

    await authenticatedPage.route(
      /\/ads\/research(?:\?.*)?$/,
      async (route) => {
        await fulfillJson(route, {
          connectedAds: [],
          filters: {},
          publicAds: [metaAd],
          summary: {
            connectedCount: 0,
            publicCount: 1,
            reviewPolicy: 'All remixes remain paused for review.',
            selectedPlatform: 'meta',
            selectedSource: 'public',
          },
        });
      },
    );
    await authenticatedPage.route(
      /\/ads\/research\/public\/ad-performance-meta-1(?:\?.*)?$/,
      async (route) => {
        await fulfillJson(route, {
          ...metaAd,
          creative: {
            body: 'Source body retained only in research.',
            headline: 'Source headline retained only in research.',
          },
        });
      },
    );

    await authenticatedPage.goto(`${BRAND_BASE}/discover/ads/meta`);
    await authenticatedPage
      .getByRole('button', {
        name: 'Select Meta proof-led winner for research context',
      })
      .click();
    await authenticatedPage
      .getByRole('button', { name: 'Remix for my brand' })
      .click();

    await expect(
      authenticatedPage.getByRole('heading', { name: /Remix for Northstar/i }),
    ).toBeVisible();
    await authenticatedPage
      .getByRole('button', { name: 'Continue to Studio' })
      .click();

    await expect(authenticatedPage).toHaveURL(
      /\/studio\/generate\?run=run-meta-1$/,
    );
    await expect(createBody).toMatchObject({
      source: {
        adPerformanceId: 'ad-performance-meta-1',
        kind: 'public_ad',
      },
    });
    await expect(
      authenticatedPage.getByText(/Paid\s*·\s*Meta\s*·\s*Image\s*·\s*1:1/),
    ).toBeVisible();
  });

  test('keeps a stale or unauthorized TikTok selector in an actionable inspector state', async ({
    authenticatedPage,
  }) => {
    await routeTikTokTrend(authenticatedPage);
    await authenticatedPage.route(
      '**/brands/brand-1/content-runs/remixes',
      async (route) => {
        await route.fulfill({
          body: JSON.stringify({
            errors: [
              {
                detail:
                  'The selected trend reference is stale or unavailable to this brand.',
                title: 'Trend reference unavailable',
              },
            ],
          }),
          contentType: 'application/json',
          status: 404,
        });
      },
    );

    await authenticatedPage.goto(`${BRAND_BASE}/discover/tiktok`);
    await authenticatedPage.getByRole('button', { name: 'Remix' }).click();

    await expect(
      authenticatedPage.getByText(
        'The selected trend reference is stale or unavailable to this brand.',
      ),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: 'Retry' }),
    ).toBeVisible();
    await expect(authenticatedPage).toHaveURL(
      new RegExp(`${BRAND_BASE}/discover/tiktok$`),
    );
  });

  test('restores grouped processing outputs and reconciles completion', async ({
    authenticatedPage,
  }) => {
    const baseRun = buildRun({
      id: 'run-restore-1',
      platform: 'tiktok',
      target: 'organic',
    });
    const processingExecution: NonNullable<BrandRemixRunView['execution']> = {
      actualCount: 0,
      generationBrief: {
        constraints: [],
        fidelityMode: 'guided',
        intent: {
          objective: baseRun.draft.intent.objective,
          requestedText: [],
          subjects: ['Northstar'],
        },
        mediaKind: 'image',
        output: { aspectRatio: '9:16' },
        provenance: [],
        references: [],
        version: 1,
      },
      requestedCount: 1,
      variants: [
        {
          assetIds: ['generated-image-restore-1'],
          id: 'variant-restored-1',
          recipeRevision: 1,
          status: 'processing',
        },
      ],
    };
    const processingRun: BrandRemixRunView = {
      ...baseRun,
      execution: processingExecution,
      phase: 'generating',
      status: ContentRunStatus.RUNNING,
    };
    const readyRun: BrandRemixRunView = {
      ...processingRun,
      execution: {
        ...processingExecution,
        actualCount: 1,
        variants: [
          {
            assetIds: ['generated-image-restore-1'],
            id: 'variant-restored-1',
            recipeRevision: 1,
            status: 'ready',
          },
        ],
      },
      phase: 'ready_for_review',
      status: ContentRunStatus.COMPLETED,
    };
    let reads = 0;
    await authenticatedPage.route(
      '**/content-runs/run-restore-1/remix',
      async (route) => {
        reads += 1;
        await fulfillJson(
          route,
          jsonApi(reads === 1 ? processingRun : readyRun),
        );
      },
    );

    await authenticatedPage.goto(
      `${BRAND_BASE}/studio/generate?run=run-restore-1`,
    );

    const panel = authenticatedPage.getByRole('region', { name: 'Remix run' });
    await expect(panel).toBeVisible();
    await expect(panel.getByText('variant-restored-1')).toBeVisible();
    await expect(panel.getByText('Processing')).toBeVisible();
    await expect(
      panel.getByRole('button', { name: 'Send 1 to Review' }),
    ).toBeVisible({ timeout: 10_000 });
    expect(reads).toBeGreaterThanOrEqual(2);
  });
});
