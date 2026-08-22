/**
 * Real-Postgres proof for the durable brand-remix -> paused Meta handoff.
 * Only the outbound Meta workflow is mocked; claim/replay/recovery state is
 * written and compared through Prisma against the real jsonb column.
 */

import { BrandRemixRunsService } from '@api/collections/content-runs/services/brand-remix-runs.service';
import type { PausedMetaCampaignDraftResult } from '@api/collections/content-runs/services/paused-meta-campaign-draft.service';
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
  BRAND_REMIX_RUN_CONTRACT,
  BRAND_REMIX_RUN_VERSION,
  brandRemixRunConfigSchema,
} from '@api-types/contracts/brand-remix-run.contract';
import {
  ContentRunStatus,
  IngredientCategory,
  IngredientStatus,
  PersistedReviewDecision,
} from '@genfeedai/enums';
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

describeWithDatabase('Brand remix paid Meta draft integration', () => {
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

  beforeEach(async () => {
    vi.clearAllMocks();
    await prisma.post.deleteMany();
    await prisma.contentRun.deleteMany();
    await dbHelper.clearDatabase();
  });

  afterAll(async () => {
    await prisma.post.deleteMany();
    await prisma.contentRun.deleteMany();
    await dbHelper.clearDatabase();
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

  const createService = (
    fixture: RemixFixture,
    prepare: ReturnType<typeof vi.fn>,
  ): BrandRemixRunsService =>
    new BrandRemixRunsService(
      prisma,
      {
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
      { findOne: vi.fn().mockResolvedValue(null) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      { prepare } as never,
      {} as never,
      {} as never,
      { now: () => NOW, randomId: () => 'unused-random-id' },
    );
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
    execution: {
      actualCount: 1,
      generationBrief: {
        constraints: [],
        fidelityMode: 'guided',
        intent: {
          objective: 'Create an original Meta visual.',
          requestedText: [],
          subjects: ['Acme'],
          visualDirection: 'Use an original product-led composition.',
        },
        mediaKind: 'image',
        output: { aspectRatio: '1:1' },
        provenance: [],
        references: [],
        version: 1,
      },
      requestedCount: 1,
      variants: [
        {
          assetIds: [fixture.ingredientId],
          id: 'variant-1',
          recipeRevision: 1,
          status: 'ready',
        },
      ],
    },
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
