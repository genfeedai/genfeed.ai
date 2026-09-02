/**
 * Real-Postgres proof for durable brand-remix -> paused paid-platform handoffs.
 * Provider HTTP and final provider-draft creation are mocked; research,
 * adapter mapping, claim/replay/recovery state, and jsonb persistence stay real.
 */

import { assembleBrandRemixRunsGraph } from '@api/collections/content-runs/services/brand-remix-runs.factory';
import { BrandRemixRunsService } from '@api/collections/content-runs/services/brand-remix-runs.service';
import type { PausedMetaCampaignDraftResult } from '@api/collections/content-runs/services/paused-meta-campaign-draft.service';
import type { PausedXAdsCampaignDraftResult } from '@api/collections/content-runs/services/paused-x-ads-campaign-draft.service';
import { AdsResearchService } from '@api/endpoints/ads-research/ads-research.service';
import { XAdsAdapter } from '@api/services/ads-gateway/adapters/x-ads.adapter';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  createTestBrand,
  createTestCredential,
  createTestIngredient,
  createTestOrganization,
  createTestPost,
  generateIdString,
} from '@api-test/e2e/e2e-test.utils';
import { E2ETestModule, TestDatabaseHelper } from '@api-test/e2e-test.module';
import {
  ContentRunStatus,
  IngredientCategory,
  IngredientStatus,
  PersistedReviewDecision,
} from '@genfeedai/contracts';
import {
  BRAND_REMIX_RUN_CONTRACT,
  BRAND_REMIX_RUN_VERSION,
  brandRemixRunConfigSchema,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { CredentialPlatform, type Prisma } from '@genfeedai/prisma';
import { Test, type TestingModule } from '@nestjs/testing';

const describeWithDatabase =
  process.env.SKIP_PRISMA_DB === 'true' ? describe.skip : describe;

const NOW = new Date('2026-08-20T10:00:00.000Z');

interface RemixFixture {
  brandId: string;
  credentialId: string;
  ingredientId: string;
  organizationId: string;
  postId: string;
  runId: string;
  userId: string;
}

describeWithDatabase('Brand remix paid draft integration', () => {
  let dbHelper: TestDatabaseHelper;
  let moduleRef: TestingModule;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleConfig = await E2ETestModule.forRoot();
    moduleRef = await Test.createTestingModule({
      imports: [moduleConfig],
    }).compile();
    prisma = moduleRef.get(PrismaService);
    dbHelper = new TestDatabaseHelper(prisma);
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  it('serializes concurrent preparation and replays the persisted result once', async () => {
    const fixture = await seedApprovedRun();
    const result = paidDraftResult(fixture);
    let releaseProvider = (): void => undefined;
    let markProviderStarted = (): void => undefined;
    const providerStarted = new Promise<void>((resolve) => {
      markProviderStarted = resolve;
    });
    const providerCompletion = new Promise<PausedMetaCampaignDraftResult>(
      (resolve) => {
        releaseProvider = () => resolve(result);
      },
    );
    const prepare = vi.fn(async () => {
      markProviderStarted();
      return providerCompletion;
    });
    const service = createService(fixture, prepare);
    const body = paidDraftBody(fixture);

    const first = service.preparePausedMetaDraft(
      fixture.organizationId,
      fixture.runId,
      fixture.userId,
      body,
    );
    await providerStarted;

    const concurrent = await service.preparePausedMetaDraft(
      fixture.organizationId,
      fixture.runId,
      fixture.userId,
      body,
    );
    expect(concurrent.phase).toBe('paid_draft_creating');
    expect(prepare).toHaveBeenCalledTimes(1);

    releaseProvider();
    const completed = await first;
    expect(completed).toMatchObject({
      paidDraft: { adId: result.adId, status: 'PAUSED' },
      phase: 'paid_draft_ready',
    });

    const replayed = await service.preparePausedMetaDraft(
      fixture.organizationId,
      fixture.runId,
      fixture.userId,
      body,
    );
    expect(replayed).toMatchObject({
      paidDraft: { adId: result.adId, replayed: true, status: 'PAUSED' },
      phase: 'paid_draft_ready',
    });
    expect(prepare).toHaveBeenCalledTimes(1);

    const persisted = await prisma.contentRun.findUniqueOrThrow({
      where: { id: fixture.runId },
    });
    expect(persisted.config).toMatchObject({
      paidDraft: { adId: result.adId, status: 'PAUSED' },
      phase: 'paid_draft_ready',
    });
    expect(
      (persisted.config as Record<string, unknown>).paidDraftOperation,
    ).toBeUndefined();
  });

  it('releases a failed operation and recovers without marking a false draft', async () => {
    const fixture = await seedApprovedRun();
    const prepare = vi
      .fn<() => Promise<PausedMetaCampaignDraftResult>>()
      .mockRejectedValueOnce(new Error('Meta ad creation failed'))
      .mockResolvedValueOnce(paidDraftResult(fixture));
    const service = createService(fixture, prepare);
    const body = paidDraftBody(fixture);

    await expect(
      service.preparePausedMetaDraft(
        fixture.organizationId,
        fixture.runId,
        fixture.userId,
        body,
      ),
    ).rejects.toThrow('Meta ad creation failed');

    const failedAttempt = await prisma.contentRun.findUniqueOrThrow({
      where: { id: fixture.runId },
    });
    expect(failedAttempt.config).toMatchObject({ phase: 'approved' });
    expect(
      (failedAttempt.config as Record<string, unknown>).paidDraft,
    ).toBeUndefined();
    expect(
      (failedAttempt.config as Record<string, unknown>).paidDraftOperation,
    ).toBeUndefined();

    const recovered = await service.preparePausedMetaDraft(
      fixture.organizationId,
      fixture.runId,
      fixture.userId,
      body,
    );
    expect(recovered).toMatchObject({
      paidDraft: { status: 'PAUSED' },
      phase: 'paid_draft_ready',
    });
    expect(prepare).toHaveBeenCalledTimes(2);
  });

  it('persists a fail-closed capability issue before calling Meta', async () => {
    const fixture = await seedApprovedRun();
    await prisma.credential.update({
      data: { grantedScopes: [] },
      where: { id: fixture.credentialId },
    });
    const prepare = vi.fn<() => Promise<PausedMetaCampaignDraftResult>>();
    const service = createService(fixture, prepare);

    const blocked = await service.preparePausedMetaDraft(
      fixture.organizationId,
      fixture.runId,
      fixture.userId,
      paidDraftBody(fixture),
    );

    expect(blocked).toMatchObject({
      phase: 'approved',
      readiness: {
        issues: [
          expect.objectContaining({
            code: 'missing_ads_management',
            field: 'target',
            severity: 'blocked',
          }),
        ],
        state: 'blocked',
      },
    });
    expect(prepare).not.toHaveBeenCalled();

    const persisted = await prisma.contentRun.findUniqueOrThrow({
      where: { id: fixture.runId },
    });
    expect(persisted.config).toMatchObject({
      readiness: {
        issues: [expect.objectContaining({ code: 'missing_ads_management' })],
        state: 'blocked',
      },
    });
  });

  it('carries a connected X promoted Tweet through research, remix, and the durable paused-draft handoff', async () => {
    const fixture = await seedConnectedXFixture();
    const xProvider = {
      getPromotedTweetStats: vi.fn().mockResolvedValue([
        {
          endTime: '2026-08-20',
          id: 'promoted-tweet-1',
          metrics: {
            billedCharge: 12,
            clicks: 120,
            impressions: 2_400,
          },
          startTime: '2026-07-22',
        },
      ]),
      listPromotedTweets: vi.fn().mockResolvedValue([
        {
          approvalStatus: 'ACCEPTED',
          entityStatus: 'PAUSED',
          id: 'promoted-tweet-1',
          lineItemId: 'line-item-1',
          tweetId: 'tweet-owned-1',
        },
      ]),
    };
    const adapter = new XAdsAdapter(
      xProvider as never,
      { warn: vi.fn() } as never,
    );
    const adsResearchService = new AdsResearchService(
      {} as never,
      { findAll: vi.fn().mockResolvedValue([]) } as never,
      {
        findOne: vi.fn().mockResolvedValue({
          accessToken: 'x-access-token',
          accessTokenSecret: 'x-access-token-secret',
        }),
      } as never,
      { getAdapter: vi.fn().mockReturnValue(adapter) } as never,
      {} as never,
    );
    const prepareX = vi
      .fn<() => Promise<PausedXAdsCampaignDraftResult>>()
      .mockResolvedValue(xPaidDraftResult(fixture));
    const service = createService(fixture, vi.fn(), {
      adsResearchService,
      prepareX,
    });

    const created = await service.create(
      fixture.organizationId,
      fixture.brandId,
      {
        source: {
          adAccountId: 'x-account-1',
          adId: 'promoted-tweet-1',
          credentialId: fixture.credentialId,
          kind: 'connected_ad',
          platform: 'x',
        },
      },
    );

    expect(created.sourceSnapshot).toMatchObject({
      metrics: {
        clicks: 120,
        impressions: 2_400,
        spend: 12,
      },
      platform: 'x',
      selector: {
        adAccountId: 'x-account-1',
        adId: 'promoted-tweet-1',
        credentialId: fixture.credentialId,
        kind: 'connected_ad',
        platform: 'x',
      },
      sourceId: 'promoted-tweet-1',
      title: 'tweet-owned-1',
    });
    expect(xProvider.getPromotedTweetStats).toHaveBeenCalledWith(
      {
        accessToken: 'x-access-token',
        accessTokenSecret: 'x-access-token-secret',
      },
      'x-account-1',
      ['promoted-tweet-1'],
      expect.objectContaining({
        endDate: expect.any(String),
        startDate: expect.any(String),
      }),
    );

    const persistedPrefill = await prisma.contentRun.findUniqueOrThrow({
      where: { id: created.id },
    });
    const prefilledConfig = brandRemixRunConfigSchema.parse(
      persistedPrefill.config,
    );
    const approvedXConfig = brandRemixRunConfigSchema.parse({
      ...prefilledConfig,
      execution: approvedExecution(fixture, 'Create an original X visual.'),
      phase: 'approved',
      readiness: { issues: [], state: 'ready' },
      review: {
        approvedPostIds: [fixture.postId],
        batchId: 'batch-x-1',
        postIds: [fixture.postId],
        workflowExecutionId: 'review-x-execution-1',
        workflowId: 'review-x-workflow-1',
      },
    });
    await prisma.post.create({
      data: createTestPost({
        brandId: fixture.brandId,
        contentRunId: created.id,
        externalId: 'tweet-owned-1',
        id: fixture.postId,
        organizationId: fixture.organizationId,
        platform: 'twitter',
        reviewDecision: PersistedReviewDecision.APPROVED,
        status: 'public',
        userId: fixture.userId,
        variantId: 'variant-1',
      }),
    });
    await prisma.contentRun.update({
      data: {
        config: approvedXConfig as Prisma.InputJsonValue,
        status: ContentRunStatus.COMPLETED,
      },
      where: { id: created.id },
    });

    const completed = await service.preparePausedMetaDraft(
      fixture.organizationId,
      created.id,
      fixture.userId,
      {
        destination: {
          adAccountId: 'x-account-1',
          credentialId: fixture.credentialId,
        },
        sourceTweetId: 'tweet-owned-1',
        variantId: 'variant-1',
      },
    );

    expect(prepareX).toHaveBeenCalledWith(
      expect.objectContaining({
        adAccountId: 'x-account-1',
        brandId: fixture.brandId,
        credentialId: fixture.credentialId,
        organizationId: fixture.organizationId,
        runId: created.id,
        sourceTweetId: 'tweet-owned-1',
        variant: expect.objectContaining({ id: 'variant-1' }),
      }),
    );
    expect(completed).toMatchObject({
      paidDraft: {
        adId: 'promoted-tweet-1',
        postId: fixture.postId,
        status: 'PAUSED',
      },
      phase: 'paid_draft_ready',
      sourceSnapshot: {
        selector: { kind: 'connected_ad', platform: 'x' },
      },
    });

    const persistedCompleted = await prisma.contentRun.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(persistedCompleted.config).toMatchObject({
      paidDraft: {
        adId: 'promoted-tweet-1',
        ingredientId: fixture.ingredientId,
        status: 'PAUSED',
      },
      phase: 'paid_draft_ready',
    });
    expect(
      (persistedCompleted.config as Record<string, unknown>).paidDraftOperation,
    ).toBeUndefined();
  });

  const seedApprovedRun = async (): Promise<RemixFixture> => {
    const fixture: RemixFixture = {
      brandId: generateIdString(),
      credentialId: generateIdString(),
      ingredientId: generateIdString(),
      organizationId: generateIdString(),
      postId: generateIdString(),
      runId: generateIdString(),
      userId: generateIdString(),
    };
    await dbHelper.seedCollection('organizations', [
      createTestOrganization({
        id: fixture.organizationId,
        userId: fixture.userId,
      }),
    ]);
    await dbHelper.seedCollection('brands', [
      createTestBrand({
        id: fixture.brandId,
        label: 'Acme',
        organizationId: fixture.organizationId,
        userId: fixture.userId,
      }),
    ]);
    await prisma.ingredient.create({
      data: createTestIngredient({
        brandId: fixture.brandId,
        category: IngredientCategory.IMAGE,
        cdnUrl: 'https://cdn.example.test/remix.png',
        id: fixture.ingredientId,
        organizationId: fixture.organizationId,
        status: IngredientStatus.GENERATED,
        userId: fixture.userId,
      }),
    });
    const config = approvedConfig(fixture);
    await prisma.contentRun.create({
      data: {
        brandId: fixture.brandId,
        config: config as Prisma.InputJsonValue,
        id: fixture.runId,
        organizationId: fixture.organizationId,
        status: ContentRunStatus.COMPLETED,
      },
    });
    await prisma.post.create({
      data: createTestPost({
        brandId: fixture.brandId,
        contentRunId: fixture.runId,
        id: fixture.postId,
        organizationId: fixture.organizationId,
        platform: 'meta',
        reviewDecision: PersistedReviewDecision.APPROVED,
        userId: fixture.userId,
      }),
    });
    await prisma.credential.create({
      data: createTestCredential({
        brandId: fixture.brandId,
        grantedScopes: ['ads_management', 'ads_read'],
        grantedScopesCapturedAt: new Date('2026-08-20T09:59:00.000Z'),
        id: fixture.credentialId,
        organizationId: fixture.organizationId,
        platform: CredentialPlatform.FACEBOOK,
        userId: fixture.userId,
      }),
    });
    return fixture;
  };

  const seedConnectedXFixture = async (): Promise<RemixFixture> => {
    const fixture: RemixFixture = {
      brandId: generateIdString(),
      credentialId: generateIdString(),
      ingredientId: generateIdString(),
      organizationId: generateIdString(),
      postId: generateIdString(),
      runId: generateIdString(),
      userId: generateIdString(),
    };
    await dbHelper.seedCollection('organizations', [
      createTestOrganization({
        id: fixture.organizationId,
        userId: fixture.userId,
      }),
    ]);
    await dbHelper.seedCollection('brands', [
      createTestBrand({
        id: fixture.brandId,
        label: 'Acme X',
        organizationId: fixture.organizationId,
        userId: fixture.userId,
      }),
    ]);
    await prisma.ingredient.create({
      data: createTestIngredient({
        brandId: fixture.brandId,
        category: IngredientCategory.IMAGE,
        cdnUrl: 'https://cdn.example.test/x-remix.png',
        id: fixture.ingredientId,
        organizationId: fixture.organizationId,
        status: IngredientStatus.GENERATED,
        userId: fixture.userId,
      }),
    });
    await prisma.credential.create({
      data: createTestCredential({
        brandId: fixture.brandId,
        grantedScopes: ['ads.read', 'ads.write', 'offline.access'],
        grantedScopesCapturedAt: new Date('2026-08-20T09:59:00.000Z'),
        id: fixture.credentialId,
        organizationId: fixture.organizationId,
        platform: CredentialPlatform.X_ADS,
        userId: fixture.userId,
      }),
    });
    return fixture;
  };

  const createService = (
    fixture: RemixFixture,
    prepare: ReturnType<typeof vi.fn>,
    options?: {
      adsResearchService?: AdsResearchService;
      prepareX?: ReturnType<typeof vi.fn>;
    },
  ): BrandRemixRunsService =>
    assembleBrandRemixRunsGraph({
      adsResearchService: (options?.adsResearchService ?? {}) as never,
      avatarVideoGenerationService: {} as never,
      batchGenerationService: {} as never,
      brandsService: {
        findOne: vi.fn().mockResolvedValue({
          agentConfig: {},
          description: 'Operational content systems.',
          id: fixture.brandId,
          isActive: true,
          label: 'Acme',
          organizationId: fixture.organizationId,
          text: 'Turn content signals into approved campaigns.',
        }),
        resolveBrandKitAssets: vi.fn().mockResolvedValue({ references: [] }),
      } as never,
      byokService: {
        isByokActiveForProvider: vi.fn().mockResolvedValue(false),
        isByokBillingInGoodStanding: vi.fn().mockResolvedValue(true),
      } as never,
      contentGeneratorService: {} as never,
      creditsUtilsService: {} as never,
      imageGenerationService: {} as never,
      organizationSettingsService: {
        findOne: vi.fn().mockResolvedValue(null),
      } as never,
      pausedMetaCampaignDraftService: { prepare } as never,
      pausedXAdsCampaignDraftService: (options?.prepareX
        ? { prepare: options.prepareX }
        : {}) as never,
      prisma,
      runtime: { now: () => NOW, randomId: () => 'unused-random-id' },
      systemWorkflowRunner: {} as never,
      trendReferenceCorpusService: {} as never,
      videoGenerationService: {} as never,
    }).service;
});

const approvedExecution = (fixture: RemixFixture, objective: string) => ({
  actualCount: 1,
  generationBrief: {
    constraints: [],
    fidelityMode: 'guided' as const,
    intent: {
      objective,
      requestedText: [],
      subjects: ['Acme'],
      visualDirection: 'Use an original product-led composition.',
    },
    mediaKind: 'image' as const,
    output: { aspectRatio: '1:1' },
    provenance: [],
    references: [],
    version: 1 as const,
  },
  requestedCount: 1,
  variants: [
    {
      assetIds: [fixture.ingredientId],
      id: 'variant-1',
      recipeRevision: 1,
      status: 'ready' as const,
    },
  ],
});

const approvedConfig = (fixture: RemixFixture) =>
  brandRemixRunConfigSchema.parse({
    contract: BRAND_REMIX_RUN_CONTRACT,
    draft: {
      fidelityMode: 'guided',
      identity: {},
      intent: {
        objective: 'Lead with Acme value and close with a clear action.',
        visualDirection: 'Use an original product-led composition.',
      },
      output: { aspectRatio: '1:1', count: 1, kind: 'image' },
      references: [],
      reviewRequired: true,
      target: { kind: 'paid', platform: 'meta' },
    },
    execution: approvedExecution(fixture, 'Create an original Meta visual.'),
    phase: 'approved',
    readiness: { issues: [], state: 'ready' },
    recipeVersion: BRAND_REMIX_RUN_VERSION,
    review: {
      approvedPostIds: [fixture.postId],
      batchId: 'batch-1',
      postIds: [fixture.postId],
      workflowExecutionId: 'review-workflow-execution-1',
      workflowId: 'review-workflow-1',
    },
    revision: 1,
    sourceSnapshot: {
      canonicalUrl: 'https://source.example.test/remix',
      capturedAt: NOW.toISOString(),
      destinationUrl: 'https://acme.example.test/offer',
      evidence: ['A durable source pattern.'],
      metrics: {},
      pattern: {
        structure: 'Lead with an outcome, prove it, then close clearly.',
      },
      platform: 'meta',
      selector: { kind: 'source_post', sourcePostId: 'source-post-1' },
      sourceId: 'source-post-1',
      title: 'Source pattern',
    },
    version: BRAND_REMIX_RUN_VERSION,
  });

const paidDraftBody = (fixture: RemixFixture) => ({
  destination: {
    adAccountId: 'act-1',
    credentialId: fixture.credentialId,
  },
  variantId: 'variant-1',
});

const paidDraftResult = (
  fixture: RemixFixture,
): PausedMetaCampaignDraftResult => ({
  adAccountId: 'act-1',
  adId: 'ad-1',
  adSetId: 'ad-set-1',
  campaignId: 'campaign-1',
  credentialId: fixture.credentialId,
  ingredientId: fixture.ingredientId,
  postId: fixture.postId,
  recipeRevision: 1,
  recipeVersion: BRAND_REMIX_RUN_VERSION,
  replayed: false,
  status: 'PAUSED',
  variantId: 'variant-1',
  workflowExecutionId: 'meta-workflow-execution-1',
  workflowId: 'meta-workflow-1',
});

const xPaidDraftResult = (
  fixture: RemixFixture,
): PausedXAdsCampaignDraftResult => ({
  adAccountId: 'x-account-1',
  adId: 'promoted-tweet-1',
  adSetId: 'line-item-1',
  campaignId: 'campaign-1',
  credentialId: fixture.credentialId,
  ingredientId: fixture.ingredientId,
  postId: fixture.postId,
  recipeRevision: 1,
  recipeVersion: BRAND_REMIX_RUN_VERSION,
  replayed: false,
  status: 'PAUSED',
  variantId: 'variant-1',
  workflowExecutionId: 'x-workflow-execution-1',
  workflowId: 'x-workflow-1',
});
