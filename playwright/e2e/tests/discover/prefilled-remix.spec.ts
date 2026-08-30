import type { BrandRemixRunView } from '@genfeedai/api-types/contracts';
import { ContentRunStatus } from '@genfeedai/enums';
import type { Page, Route } from '@playwright/test';
import { mockReviewQueue } from '../../fixtures/api-mocks.fixture';
import { expect, test } from '../../fixtures/auth.fixture';

const BRAND_BASE = '/test-org/brand-1';
const FIXED_TIME = '2026-08-20T10:00:00.000Z';

type RemixPlatform = 'meta' | 'tiktok';

interface RemixFixtureOptions {
  id: string;
  platform: RemixPlatform;
  source?: 'connected' | 'public' | 'saved';
  target: 'organic' | 'paid';
}

function buildRun({
  id,
  platform,
  source = 'public',
  target,
}: RemixFixtureOptions): BrandRemixRunView {
  const selector =
    platform === 'tiktok'
      ? {
          kind: 'trend_reference' as const,
          sourceReferenceId: 'tiktok-reference-1',
          trendId: 'tiktok-trend-1',
        }
      : source === 'connected'
        ? {
            adAccountId: 'act_123',
            adId: 'meta-ad-1',
            credentialId: 'credential-meta-1',
            kind: 'connected_ad' as const,
            platform: 'meta' as const,
          }
        : source === 'saved'
          ? { kind: 'saved_ad' as const, savedAdId: 'saved-ad-1' }
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
      ...(platform === 'meta' && source === 'connected'
        ? { destinationUrl: 'https://northstar.example/product' }
        : {}),
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

async function openTikTokTrendFeed(page: Page): Promise<void> {
  await page.goto(`${BRAND_BASE}/discover/tiktok`);
  await page.getByRole('button', { name: 'Refresh' }).click();
  await expect(page.getByRole('button', { name: 'Remix' })).toBeVisible();
}

async function routeRemixRun(
  page: Page,
  options: RemixFixtureOptions,
  onCreate: (body: Record<string, unknown>) => void,
  isReviewApproved: () => boolean = () => false,
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
    if (isReviewApproved() && run.review) {
      run = {
        ...run,
        phase: 'approved',
        review: { ...run.review, approvedPostIds: run.review.postIds },
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
          workflowExecutionId: 'review-workflow-execution-1',
          workflowId: 'review-workflow-1',
        },
      };
      await fulfillJson(route, jsonApi(run));
    },
  );
}

test.describe('Discover prefilled remix handoff', () => {
  test('takes an eligible TikTok trend through Review approval to a Publish draft', async ({
    authenticatedPage,
  }) => {
    let approved = false;
    let createBody: Record<string, unknown> | null = null;
    await routeRemixRun(
      authenticatedPage,
      { id: 'run-tiktok-1', platform: 'tiktok', target: 'organic' },
      (body) => {
        createBody = body;
      },
      () => approved,
    );
    await routeTikTokTrend(authenticatedPage);
    await mockReviewQueue(authenticatedPage, {
      batchId: 'review-batch-1',
      itemAttributes: {
        contentRunId: 'run-tiktok-1',
        creativeVersion: 'recipe-1',
        format: 'image',
        ingredientId: 'generated-image-1',
        label: 'Northstar TikTok remix',
        platform: 'tiktok',
        sourceActionId: 'tiktok-reference-1',
        sourceWorkflowId: 'review-workflow-1',
        sourceWorkflowName: 'Brand Remix Review Handoff',
        status: 'COMPLETED',
        variantId: 'variant-1',
        workflowExecutionId: 'review-workflow-execution-1',
      },
      itemId: 'review-item-tiktok-1',
      onItemAction: (body) => {
        if (body.action === 'approve') approved = true;
      },
      postId: 'draft-post-1',
    });

    await openTikTokTrendFeed(authenticatedPage);
    await authenticatedPage.getByRole('button', { name: 'Remix' }).click();

    await expect(
      authenticatedPage.getByRole('heading', { name: /Remix for Northstar/i }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText('Source pattern', { exact: true }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByText(
        'Lead with a clear outcome, support it with proof, then close with a brand-specific action.',
        { exact: true },
      ),
    ).toBeVisible();
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
    await reviewLink.click();
    await expect(
      authenticatedPage.getByText('Brand Remix Review Handoff'),
    ).toBeVisible();
    await authenticatedPage
      .getByRole('button', { name: 'Approve and open draft' })
      .click();
    await expect.poll(() => approved).toBe(true);

    await authenticatedPage.goto(
      `${BRAND_BASE}/studio/generate?run=run-tiktok-1`,
    );
    await expect(
      authenticatedPage.getByRole('link', { name: 'Open Publish drafts' }),
    ).toHaveAttribute('href', /\/publish\/scheduled$/);
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

  test('saves an ad, filters the swipe file, and remixes from the durable snapshot', async ({
    authenticatedPage,
  }) => {
    let isSaved = false;
    let savedGetCount = 0;
    let createBody: Record<string, unknown> | null = null;
    await routeRemixRun(
      authenticatedPage,
      {
        id: 'run-saved-ad-1',
        platform: 'meta',
        source: 'saved',
        target: 'paid',
      },
      (body) => {
        createBody = body;
      },
    );
    const metaAd = {
      channel: 'all',
      explanation: 'Proof appears before the product promise.',
      id: 'ad-performance-meta-1',
      imageUrls: ['https://source.example/ad.jpg'],
      metrics: { performanceScore: 92 },
      platform: 'meta',
      source: 'public',
      sourceId: 'meta-source-1',
      title: 'Durable Meta winner',
      usagePolicy: 'remix_allowed',
    };
    const savedAttributes = {
      body: 'Saved body copy',
      brandId: 'brand-1',
      capturedAt: FIXED_TIME,
      channel: 'all',
      createdAt: FIXED_TIME,
      explanation: metaAd.explanation,
      imageUrls: ['https://files.example/copied-ad.jpg'],
      isDeleted: false,
      metrics: metaAd.metrics,
      organizationId: 'org-1',
      patternSummary: [],
      platform: 'meta',
      previewUrl: 'https://files.example/copied-ad.jpg',
      source: 'public',
      sourceAdId: 'meta-source-1',
      sourceRecordId: 'ad-performance-meta-1',
      title: metaAd.title,
      updatedAt: FIXED_TIME,
      usagePolicy: 'remix_allowed',
      userId: 'user-1',
      videoUrls: [],
    };
    const savedDocument = () => ({
      data: isSaved
        ? [
            {
              attributes: savedAttributes,
              id: 'saved-ad-1',
              type: 'saved-ad',
            },
            {
              attributes: {
                ...savedAttributes,
                platform: 'tiktok',
                sourceAdId: 'tiktok-source-1',
                sourceRecordId: 'tiktok-record-1',
                title: 'Saved TikTok winner',
              },
              id: 'saved-ad-2',
              type: 'saved-ad',
            },
          ]
        : [],
    });

    await authenticatedPage.route(/\/ads\/research(?:\?.*)?$/, (route) =>
      fulfillJson(route, {
        connectedAds: [],
        filters: {},
        publicAds: [metaAd],
        summary: {
          connectedCount: 0,
          publicCount: 1,
          reviewPolicy: 'Review required.',
          selectedPlatform: 'meta',
          selectedSource: 'public',
        },
      }),
    );
    await authenticatedPage.route(
      /\/ads\/research\/public\/ad-performance-meta-1(?:\?.*)?$/,
      (route) =>
        fulfillJson(route, {
          ...metaAd,
          creative: {
            body: 'Saved body copy',
            imageUrls: metaAd.imageUrls,
          },
        }),
    );
    await authenticatedPage.route(/\/saved-ads(?:\?.*)?$/, async (route) => {
      if (route.request().method() === 'POST') isSaved = true;
      if (route.request().method() === 'GET') savedGetCount += 1;
      await fulfillJson(route, savedDocument());
    });

    await authenticatedPage.goto(
      `${BRAND_BASE}/discover/ads/meta?source=saved`,
    );
    await expect(
      authenticatedPage.getByText('No ads match the current filters.'),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: 'Filters' }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('button', { name: 'Refresh' }),
    ).toBeVisible();

    await authenticatedPage.goto(`${BRAND_BASE}/discover/ads/meta`);
    await authenticatedPage
      .getByRole('button', { name: 'Save Durable Meta winner' })
      .click();
    await expect.poll(() => isSaved).toBe(true);
    await expect(
      authenticatedPage.getByRole('button', {
        name: 'Unsave Durable Meta winner',
      }),
    ).toBeVisible();
    await authenticatedPage
      .getByRole('button', {
        name: 'Select Durable Meta winner for research context',
      })
      .click();
    await expect(
      authenticatedPage.getByRole('button', {
        name: 'Unsave from swipe file',
      }),
    ).toBeVisible();
    await expect(authenticatedPage.getByText('Brand note')).toBeVisible();

    await authenticatedPage.goto(
      `${BRAND_BASE}/discover/ads/meta?source=saved`,
    );
    await expect(
      authenticatedPage.getByRole('heading', {
        name: 'Durable Meta winner',
      }),
    ).toBeVisible();
    await expect(
      authenticatedPage.getByRole('heading', {
        name: 'Saved TikTok winner',
      }),
    ).toBeHidden();
    const refreshBaseline = savedGetCount;
    await authenticatedPage.getByRole('button', { name: 'Refresh' }).click();
    await expect.poll(() => savedGetCount).toBeGreaterThan(refreshBaseline);
    await authenticatedPage.getByRole('button', { name: 'Filters' }).click();
    await expect(authenticatedPage.getByText('Timeframe')).toBeHidden();
    await authenticatedPage
      .getByRole('button', {
        name: 'Select Durable Meta winner for research context',
      })
      .click();
    await authenticatedPage
      .getByRole('button', { name: 'Remix for my brand' })
      .click();
    await authenticatedPage
      .getByRole('button', { name: 'Continue to Studio' })
      .click();

    expect(createBody).toMatchObject({
      source: { kind: 'saved_ad', savedAdId: 'saved-ad-1' },
    });
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

    await openTikTokTrendFeed(authenticatedPage);
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
    let isReady = false;
    await authenticatedPage.route(
      '**/content-runs/run-restore-1/remix',
      async (route) => {
        reads += 1;
        await fulfillJson(route, jsonApi(isReady ? readyRun : processingRun));
      },
    );

    await authenticatedPage.goto(
      `${BRAND_BASE}/studio/generate?run=run-restore-1`,
    );

    const panel = authenticatedPage.getByRole('region', { name: 'Remix run' });
    await expect(panel).toBeVisible();
    await expect(panel.getByText('variant-restored-1')).toBeVisible();
    await expect(panel.getByText('Processing')).toBeVisible();
    isReady = true;
    await expect(
      panel.getByRole('button', { name: 'Send 1 to Review' }),
    ).toBeVisible({ timeout: 10_000 });
    expect(reads).toBeGreaterThanOrEqual(2);
  });

  test('links an approved organic TikTok run to its Publish drafts downstream', async ({
    authenticatedPage,
  }) => {
    const baseRun = buildRun({
      id: 'run-publish-1',
      platform: 'tiktok',
      target: 'organic',
    });
    const approvedRun: BrandRemixRunView = {
      ...baseRun,
      phase: 'approved',
      review: {
        approvedPostIds: ['draft-post-1'],
        batchId: 'review-batch-1',
        postIds: ['draft-post-1'],
        workflowExecutionId: 'review-workflow-execution-1',
        workflowId: 'review-workflow-1',
      },
      status: ContentRunStatus.COMPLETED,
    };
    await authenticatedPage.route(
      '**/content-runs/run-publish-1/remix',
      async (route) => {
        await fulfillJson(route, jsonApi(approvedRun));
      },
    );

    await authenticatedPage.goto(
      `${BRAND_BASE}/studio/generate?run=run-publish-1`,
    );

    const panel = authenticatedPage.getByRole('region', { name: 'Remix run' });
    await expect(panel).toBeVisible();
    const publishDrafts = panel.getByRole('link', {
      name: 'Open Publish drafts',
    });
    await expect(publishDrafts).toHaveAttribute(
      'href',
      /\/publish\/scheduled$/,
    );
  });

  test('takes a connected Meta ad through Review into a PAUSED campaign draft', async ({
    authenticatedPage,
  }) => {
    let approved = false;
    let createBody: Record<string, unknown> | null = null;
    let paidDraftBody: Record<string, unknown> | null = null;
    await routeRemixRun(
      authenticatedPage,
      {
        id: 'run-meta-paid-1',
        platform: 'meta',
        source: 'connected',
        target: 'paid',
      },
      (body) => {
        createBody = body;
      },
      () => approved,
    );
    const connectedAd = {
      accountName: 'Northstar Ads',
      adAccountId: 'act_123',
      channel: 'feed',
      credentialId: 'credential-meta-1',
      headline: 'Proof-led Meta winner',
      id: 'connected-meta-1',
      metrics: { ctr: 0.041, performanceScore: 96, roas: 5.1 },
      platform: 'meta',
      source: 'my_accounts',
      sourceId: 'meta-ad-1',
      title: 'Connected Meta proof winner',
    };
    await authenticatedPage.route(
      /\/ads\/research(?:\?.*)?$/,
      async (route) => {
        await fulfillJson(route, {
          connectedAds: [connectedAd],
          filters: {},
          publicAds: [],
          summary: {
            connectedCount: 1,
            publicCount: 0,
            reviewPolicy: 'All remixes remain paused for review.',
            selectedPlatform: 'meta',
            selectedSource: 'all',
          },
        });
      },
    );
    await authenticatedPage.route(
      /\/ads\/research\/my_accounts\/meta-ad-1(?:\?.*)?$/,
      async (route) => {
        await fulfillJson(route, {
          ...connectedAd,
          creative: { body: 'Research-only source copy.' },
          landingPageUrl: 'https://northstar.example/product',
          patternSummary: [
            {
              id: 'proof-first',
              label: 'Proof first',
              score: 96,
              summary: 'Lead with evidence before the offer.',
            },
          ],
        });
      },
    );
    await mockReviewQueue(authenticatedPage, {
      batchId: 'review-batch-1',
      itemAttributes: {
        contentRunId: 'run-meta-paid-1',
        creativeVersion: 'recipe-1',
        format: 'image',
        ingredientId: 'generated-image-1',
        label: 'Northstar Meta remix',
        platform: 'meta',
        sourceActionId: 'meta-ad-1',
        sourceWorkflowId: 'review-workflow-1',
        sourceWorkflowName: 'Brand Remix Review Handoff',
        status: 'COMPLETED',
        variantId: 'variant-1',
        workflowExecutionId: 'review-workflow-execution-1',
      },
      itemId: 'review-item-1',
      onItemAction: (body) => {
        if (body.action === 'approve') approved = true;
      },
      postId: 'draft-post-1',
    });
    await authenticatedPage.route(
      '**/content-runs/run-meta-paid-1/remix/paid-draft',
      async (route) => {
        paidDraftBody = route.request().postDataJSON() as Record<
          string,
          unknown
        >;
        const paidRun = buildRun({
          id: 'run-meta-paid-1',
          platform: 'meta',
          source: 'connected',
          target: 'paid',
        });
        await fulfillJson(
          route,
          jsonApi({
            ...paidRun,
            paidDraft: {
              adAccountId: 'act_123',
              adId: 'ad-paused-1',
              adSetId: 'adset-paused-1',
              campaignId: 'campaign-paused-1',
              credentialId: 'credential-meta-1',
              ingredientId: 'generated-image-1',
              postId: 'draft-post-1',
              recipeRevision: 1,
              recipeVersion: 1,
              replayed: false,
              status: 'PAUSED',
              variantId: 'variant-1',
              workflowExecutionId: 'meta-workflow-execution-1',
              workflowId: 'meta-workflow-1',
            },
            phase: 'paid_draft_ready',
            review: {
              approvedPostIds: ['draft-post-1'],
              batchId: 'review-batch-1',
              postIds: ['draft-post-1'],
              workflowExecutionId: 'review-workflow-execution-1',
              workflowId: 'review-workflow-1',
            },
            status: ContentRunStatus.COMPLETED,
          }),
        );
      },
    );

    await authenticatedPage.goto(`${BRAND_BASE}/discover/ads/meta`);
    await authenticatedPage
      .getByRole('button', {
        name: 'Select Connected Meta proof winner for research context',
      })
      .click();
    await authenticatedPage
      .getByRole('button', { name: 'Remix for my brand' })
      .click();
    await authenticatedPage
      .getByRole('button', { name: 'Continue to Studio' })
      .click();

    const panel = authenticatedPage.getByRole('region', { name: 'Remix run' });
    await expect(panel).toBeVisible();
    await authenticatedPage.getByRole('button', { name: 'Generate' }).click();
    await panel.getByRole('button', { name: 'Send 1 to Review' }).click();
    await panel.getByRole('link', { name: 'Open Review' }).click();
    await expect(
      authenticatedPage.getByText('Brand Remix Review Handoff'),
    ).toBeVisible();
    await authenticatedPage
      .getByRole('button', { name: 'Approve and open draft' })
      .click();
    await expect.poll(() => approved).toBe(true);

    await authenticatedPage.goto(
      `${BRAND_BASE}/studio/generate?run=run-meta-paid-1`,
    );
    await panel
      .getByRole('button', { name: 'Prepare paused Meta draft' })
      .click();

    await expect(panel.getByText(/campaign-paused-1/)).toBeVisible();
    await expect(panel.getByText(/adset-paused-1/)).toBeVisible();
    await expect(panel.getByText(/ad-paused-1/)).toBeVisible();
    await expect(panel.getByText(/PAUSED/)).toBeVisible();
    expect(createBody).toMatchObject({
      source: {
        adAccountId: 'act_123',
        adId: 'meta-ad-1',
        credentialId: 'credential-meta-1',
        kind: 'connected_ad',
        platform: 'meta',
      },
    });
    expect(paidDraftBody).toMatchObject({
      destination: {
        adAccountId: 'act_123',
        credentialId: 'credential-meta-1',
      },
    });
  });

  test('copies the grouped caption and assets of a ready TikTok variant', async ({
    authenticatedPage,
    browserName,
  }) => {
    test.skip(browserName === 'webkit', 'Clipboard grants are Chromium-only');
    await authenticatedPage
      .context()
      .grantPermissions(['clipboard-read', 'clipboard-write']);
    const baseRun = buildRun({
      id: 'run-copy-1',
      platform: 'tiktok',
      target: 'organic',
    });
    const readyRun: BrandRemixRunView = {
      ...baseRun,
      execution: {
        actualCount: 1,
        generationBrief: {
          constraints: [],
          fidelityMode: 'guided' as const,
          intent: {
            objective: baseRun.draft.intent.objective,
            requestedText: [],
            subjects: ['Northstar'],
          },
          mediaKind: 'image' as const,
          output: { aspectRatio: '9:16' },
          provenance: [],
          references: [],
          version: 1 as const,
        },
        requestedCount: 1,
        variants: [
          {
            assetIds: ['generated-image-1'],
            id: 'variant-copy-1',
            recipeRevision: 1,
            status: 'ready' as const,
          },
        ],
      },
      phase: 'ready_for_review',
      status: ContentRunStatus.COMPLETED,
    };
    await authenticatedPage.route(
      '**/content-runs/run-copy-1/remix',
      async (route) => {
        await fulfillJson(route, jsonApi(readyRun));
      },
    );

    await authenticatedPage.goto(
      `${BRAND_BASE}/studio/generate?run=run-copy-1`,
    );

    const panel = authenticatedPage.getByRole('region', { name: 'Remix run' });
    await expect(panel).toBeVisible();
    await panel.getByRole('button', { name: 'Copy outputs' }).click();

    const clipboard = await authenticatedPage.evaluate(() =>
      navigator.clipboard.readText(),
    );
    expect(clipboard).toContain('variant-copy-1');
    expect(clipboard).toContain('generated-image-1');
    expect(clipboard).toContain(baseRun.draft.intent.objective);
  });
});
