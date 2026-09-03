import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BRAND_REMIX_DOWNSTREAM_ACTION_IDS } from '@api/collections/content-runs/services/brand-remix-downstream-workflow-definition';
import { runBrandRemixGenerateWorkflow } from '@api/collections/content-runs/services/brand-remix-generate-workflow.test-util';
import { assembleBrandRemixRunsGraph } from '@api/collections/content-runs/services/brand-remix-runs.factory';
import { BrandRemixRunsService } from '@api/collections/content-runs/services/brand-remix-runs.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  ContentRunStatus,
  IngredientCategory,
  IngredientStatus,
  PersistedReviewDecision,
  ReferenceImageCategory,
} from '@genfeedai/contracts';
import { brandRemixRunConfigSchema } from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createdAt = new Date('2026-08-20T10:00:00.000Z');
const updatedAt = new Date('2026-08-20T10:01:00.000Z');

const brand = {
  agentConfig: {
    defaultAvatarIngredientId: 'avatar-1',
    defaultVoiceId: 'voice-1',
    strategy: { goals: ['Grow qualified demand'] },
    voice: { audience: ['founders'], tone: 'direct' },
  },
  description: 'Operational content systems for founder-led teams.',
  id: 'brand-1',
  isActive: true,
  label: 'Acme',
  organizationId: 'org-1',
  text: 'Turn content signals into approved campaigns.',
};

const sourcePost = {
  authorHandle: 'creator',
  collectedAt: new Date('2026-08-20T09:00:00.000Z'),
  contentType: 'video',
  id: 'source-post-1',
  mediaUrls: ['https://media.example/video.mp4'],
  metrics: { comments: 18, likes: 1200, views: 25000 },
  platform: 'tiktok',
  sourceUrl:
    'https://tiktok.example/@creator/video/1?token=must-not-persist#preview',
  text: 'Show the painful old workflow, then reveal the one-click fix.',
  thumbnailUrl: 'https://media.example/thumb.jpg',
};

const makeRun = (config: Record<string, unknown>) => ({
  brandId: 'brand-1',
  config,
  createdAt,
  id: 'run-1',
  isDeleted: false,
  organizationId: 'org-1',
  status: ContentRunStatus.PENDING,
  updatedAt,
});

type TestRun = ReturnType<typeof makeRun>;

type CapturedWorkflowAction = (request: {
  input: Record<string, unknown>;
  provenance: {
    executionId: string;
    workflowId: string;
    workflowLabel: string;
  };
}) => Promise<unknown> | unknown;

type TestCreditsRequest = Request & {
  creditsConfig: {
    amount: number;
    deferred: boolean;
    description: string;
  };
};

describe('BrandRemixRunsService', () => {
  const contentRun = {
    create: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  };
  const prisma = {
    $transaction: vi.fn(),
    asset: { findMany: vi.fn() },
    contentRun,
    credential: { findFirst: vi.fn() },
    ingredient: { findMany: vi.fn(), updateMany: vi.fn() },
    post: { findFirst: vi.fn(), findMany: vi.fn() },
    sourcePost: { findFirst: vi.fn() },
    trendSourceReference: { findFirst: vi.fn() },
  } as unknown as PrismaService;
  const brandsService = {
    findOne: vi.fn(),
    resolveBrandKitAssets: vi.fn(),
  };
  const organizationSettingsService = { findOne: vi.fn() };
  const adsResearchService = {
    getAdDetail: vi.fn(),
    prepareCampaignForReview: vi.fn(),
  };
  const imageGenerationService = { generateImage: vi.fn() };
  const videoGenerationService = { generateVideo: vi.fn() };
  const avatarVideoGenerationService = { generateAvatarVideo: vi.fn() };
  const batchGenerationService = { createManualReviewBatch: vi.fn() };
  const trendReferenceCorpusService = { recordPostRemixLineage: vi.fn() };
  const contentGeneratorService = { generateContent: vi.fn() };
  const pausedMetaCampaignDraftService = { prepare: vi.fn() };
  const pausedXAdsCampaignDraftService = { prepare: vi.fn() };
  const creditsUtilsService = {
    checkOrganizationCreditsAvailable: vi.fn(),
    deductCreditsFromOrganization: vi.fn(),
    getOrganizationCreditsBalance: vi.fn(),
  };
  const workflowActions = new Map<string, CapturedWorkflowAction>();
  const systemWorkflowRunner = {
    registerAction: vi.fn((id: string, action: CapturedWorkflowAction) => {
      workflowActions.set(id, action);
    }),
    registerWorkflow: vi.fn(),
    runWorkflow: vi.fn(),
  };
  const byokService = {
    isByokActiveForProvider: vi.fn(),
    isByokBillingInGoodStanding: vi.fn(),
  };
  const runtime = {
    now: () => new Date('2026-08-20T10:00:00.000Z'),
    randomId: vi.fn(),
  };
  const request = {
    context: { organizationId: 'org-1' },
    creditsConfig: {
      amount: 0,
      deferred: true,
      description: 'Brand remix generation',
    },
  } as unknown as TestCreditsRequest;
  const user = {
    brandId: 'brand-1',
    id: 'user-1',
    organizationId: 'org-1',
    userId: 'user-1',
  } as AuthenticatedUser;
  let remixGraph!: ReturnType<typeof assembleBrandRemixRunsGraph>;
  let service: BrandRemixRunsService;

  beforeEach(() => {
    vi.resetAllMocks();
    request.creditsConfig = {
      amount: 0,
      deferred: true,
      description: 'Brand remix generation',
    };
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (
        operation: (transaction: { contentRun: typeof contentRun }) => unknown,
      ) => operation({ contentRun }),
    );
    contentRun.findFirst.mockResolvedValue(null);
    let variantSequence = 0;
    runtime.randomId
      .mockReset()
      .mockImplementation(() => `variant-${++variantSequence}`);
    brandsService.findOne.mockResolvedValue(brand);
    brandsService.resolveBrandKitAssets.mockResolvedValue({
      references: [
        {
          id: 'brand-reference-1',
          label: 'Product reference',
          referenceCategory: ReferenceImageCategory.PRODUCT,
          role: 'reference',
          url: 'https://signed.example/reference?token=must-not-persist',
        },
      ],
    });
    organizationSettingsService.findOne.mockResolvedValue({
      organizationId: 'org-1',
    });
    (prisma.sourcePost.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      sourcePost,
    );
    (prisma.asset.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'brand-reference-1' },
    ]);
    (prisma.ingredient.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      {
        brandId: 'brand-1',
        category: 'AVATAR',
        id: 'avatar-1',
        status: IngredientStatus.GENERATED,
      },
      {
        brandId: 'brand-1',
        category: 'VOICE',
        externalVoiceId: 'voice-external-1',
        id: 'voice-1',
        isCloned: true,
        status: IngredientStatus.GENERATED,
      },
    ]);
    (
      prisma.ingredient.updateMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ count: 1 });
    creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
      true,
    );
    creditsUtilsService.deductCreditsFromOrganization.mockResolvedValue(
      undefined,
    );
    creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(100);
    byokService.isByokActiveForProvider.mockResolvedValue(false);
    byokService.isByokBillingInGoodStanding.mockResolvedValue(true);
    workflowActions.clear();
    systemWorkflowRunner.registerAction.mockImplementation(
      (id: string, action: CapturedWorkflowAction) => {
        workflowActions.set(id, action);
      },
    );
    const graph = assembleBrandRemixRunsGraph({
      adsResearchService: adsResearchService as never,
      avatarVideoGenerationService: avatarVideoGenerationService as never,
      batchGenerationService: batchGenerationService as never,
      brandsService: brandsService as never,
      byokService: byokService as never,
      contentGeneratorService: contentGeneratorService as never,
      creditsUtilsService: creditsUtilsService as never,
      imageGenerationService: imageGenerationService as never,
      organizationSettingsService: organizationSettingsService as never,
      pausedMetaCampaignDraftService: pausedMetaCampaignDraftService as never,
      pausedXAdsCampaignDraftService: pausedXAdsCampaignDraftService as never,
      prisma,
      runtime,
      systemWorkflowRunner: systemWorkflowRunner as never,
      trendReferenceCorpusService: trendReferenceCorpusService as never,
      videoGenerationService: videoGenerationService as never,
    });
    remixGraph = graph;
    graph.review.onModuleInit();
    graph.execution.onModuleInit();
    systemWorkflowRunner.runWorkflow.mockImplementation(async (request) => {
      if (request.canonicalId === 'brand-remix.generate') {
        return runBrandRemixGenerateWorkflow({
          actions: workflowActions,
          request,
        });
      }
      const provenance = {
        executionId: 'workflow-execution-1',
        workflowId: 'workflow-1',
        workflowLabel: 'Brand Remix Review Handoff',
      };
      const execute = async (id: string, input: Record<string, unknown>) => {
        const action = workflowActions.get(id);
        if (!action) throw new Error(`Missing action ${id}`);
        return action({ input, provenance } as never);
      };
      const ids = BRAND_REMIX_DOWNSTREAM_ACTION_IDS;
      let state = (await execute(ids.REVIEW_PREPARE, {
        request: request.inputValues.request,
      })) as { needsHandoff: boolean };
      if (state.needsHandoff) {
        state = (await execute(ids.REVIEW_CLAIM, { state })) as typeof state;
        state = (await execute(ids.REVIEW_CREATE_HANDOFF, {
          state,
        })) as typeof state;
        if ('recordTrendLineage' in state && state.recordTrendLineage) {
          state = (await execute(ids.REVIEW_RECORD_LINEAGE, {
            state,
          })) as typeof state;
        }
        state = (await execute(ids.REVIEW_COMPLETE, { state })) as typeof state;
      }
      const result = await execute(ids.REVIEW_PROJECT, { state });
      return { provenance, result };
    });
    service = graph.service;
  });

  describe('planning and source graph', () => {
    it('prefills a durable run exclusively from a server-authorized source and live brand defaults', async () => {
      contentRun.create.mockImplementation(({ data }) =>
        Promise.resolve(makeRun(data.config as Record<string, unknown>)),
      );

      const result = await service.create('org-1', 'brand-1', {
        source: { kind: 'source_post', sourcePostId: 'source-post-1' },
      });

      expect(prisma.sourcePost.findFirst).toHaveBeenCalledWith({
        select: expect.any(Object),
        where: {
          brandId: 'brand-1',
          id: 'source-post-1',
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
      expect(result).toMatchObject({
        brand: { contextMode: 'brand', id: 'brand-1', name: 'Acme' },
        contract: 'brand-remix-run',
        draft: {
          identity: {
            avatarAssetId: 'avatar-1',
            speechVoiceId: 'voice-1',
          },
          output: { aspectRatio: '9:16', count: 3, kind: 'avatar' },
          references: [
            {
              assetId: 'brand-reference-1',
              role: 'product',
              source: 'brand_default',
            },
          ],
          reviewRequired: true,
          target: { kind: 'organic', platform: 'tiktok' },
        },
        phase: 'prefilled',
        recipeVersion: 1,
        revision: 1,
        sourceSnapshot: {
          canonicalUrl: 'https://tiktok.example/@creator/video/1',
          platform: 'tiktok',
          selector: { kind: 'source_post', sourcePostId: 'source-post-1' },
          sourceId: 'source-post-1',
        },
        status: ContentRunStatus.PENDING,
        version: 1,
      });
      const persisted = contentRun.create.mock.calls[0]?.[0]?.data?.config;
      expect(JSON.stringify(persisted)).not.toContain('signed.example');
      expect(JSON.stringify(persisted)).not.toContain('media.example');
      expect(JSON.stringify(persisted)).not.toContain('must-not-persist');
      expect(result.draft.intent.objective).toBe(
        'Meet Acme. Put the outcome first, make the next step clear, and discover what Acme can do for you.',
      );
      expect(result.draft.intent.objective).not.toContain(sourcePost.text);
      expect(result.draft.intent.objective).not.toContain('Create an original');
      expect(result.source).toBeUndefined();
    });

    it('recommends a brand avatar for vertical video when paired identity defaults are ready', async () => {
      contentRun.create.mockImplementation(({ data }) =>
        Promise.resolve(makeRun(data.config as Record<string, unknown>)),
      );

      const result = await service.create('org-1', 'brand-1', {
        source: { kind: 'source_post', sourcePostId: 'source-post-1' },
      });

      expect(result.draft.output).toEqual({
        aspectRatio: '9:16',
        count: 3,
        kind: 'avatar',
      });
    });

    it('rejects an owned Post outside the requested organization and brand scope', async () => {
      (prisma.post.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
        null,
      );

      await expect(
        service.create('org-1', 'brand-1', {
          source: { kind: 'owned_post', postId: 'post-other-brand' },
        }),
      ).rejects.toThrow();

      expect(prisma.post.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            brandId: 'brand-1',
            id: 'post-other-brand',
            isDeleted: false,
            organizationId: 'org-1',
          },
        }),
      );
    });

    it('resolves a trend reference only through a live tenant-visible trend link', async () => {
      (
        prisma.trendSourceReference.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        authorHandle: 'creator',
        canonicalUrl: 'https://tiktok.example/trend/1?token=secret',
        currentEngagementTotal: 2400,
        data: {
          caption: 'A source caption that remains snapshot-only.',
          contentType: 'video',
        },
        id: 'reference-1',
        latestTrendViralityScore: 82,
        platform: 'tiktok',
      });
      contentRun.create.mockImplementation(({ data }) =>
        Promise.resolve(makeRun(data.config as Record<string, unknown>)),
      );

      const result = await service.create('org-1', 'brand-1', {
        source: {
          kind: 'trend_reference',
          sourceReferenceId: 'reference-1',
          trendId: 'trend-1',
        },
      });

      expect(prisma.trendSourceReference.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'reference-1',
            isDeleted: false,
            links: {
              some: {
                isDeleted: false,
                trend: {
                  OR: [{ brandId: 'brand-1' }, { brandId: null }],
                  id: 'trend-1',
                  isDeleted: false,
                  organizationId: 'org-1',
                },
                trendId: 'trend-1',
              },
            },
          },
        }),
      );
      expect(result.sourceSnapshot.canonicalUrl).toBe(
        'https://tiktok.example/trend/1',
      );
    });

    it('keeps source copy in the snapshot but never compiles it into generation intent', async () => {
      const created = await createPersistedRun({
        draft: {
          output: { aspectRatio: '1:1', count: 1, kind: 'image' },
        },
      });
      installExactConfigStore(created);
      imageGenerationService.generateImage.mockResolvedValue({
        data: { id: 'image-1', type: 'ingredient' },
      });
      const result = await service.start(
        'org-1',
        'run-1',
        user,
        request as never,
        { expectedRevision: 1 },
      );

      const compiled = JSON.stringify(result.execution?.generationBrief);
      expect(result.sourceSnapshot.title).toContain('painful old workflow');
      expect(compiled).not.toContain(sourcePost.text);
      expect(compiled).not.toContain('painful old workflow');
      expect(imageGenerationService.generateImage).toHaveBeenCalledWith(
        user,
        expect.objectContaining({
          text: expect.not.stringContaining('painful old workflow'),
        }),
        expect.objectContaining({
          context: { organizationId: 'org-1' },
          creditsConfig: expect.objectContaining({ deferred: true }),
        }),
        expect.any(Function),
        expect.objectContaining({
          groupId: 'run-1',
          settleCreditsExternally: true,
        }),
        expect.any(Function),
        expect.arrayContaining([
          expect.objectContaining({
            assetId: 'brand-reference-1',
            role: 'product',
          }),
        ]),
      );
    });

    it('authorizes a connected-ad credential against both organization and brand before provider reads', async () => {
      (
        prisma.credential.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.create('org-1', 'brand-1', {
          source: {
            adAccountId: 'act-1',
            adId: 'ad-1',
            credentialId: 'credential-other-brand',
            kind: 'connected_ad',
            platform: 'meta',
          },
        }),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.credential.findFirst).toHaveBeenCalledWith({
        select: {
          grantedScopes: true,
          grantedScopesCapturedAt: true,
          id: true,
        },
        where: {
          brandId: 'brand-1',
          id: 'credential-other-brand',
          isConnected: true,
          isDeleted: false,
          organizationId: 'org-1',
          platform: 'FACEBOOK',
        },
      });
      expect(adsResearchService.getAdDetail).not.toHaveBeenCalled();
    });

    it('normalizes empty provider ad labels into durable safe snapshot fallbacks', async () => {
      adsResearchService.getAdDetail.mockResolvedValue({
        channel: 'all',
        creative: {},
        explanation: '   ',
        id: 'public:meta:ad-1',
        metrics: {},
        platform: 'meta',
        source: 'public',
        sourceId: '   ',
        title: '   ',
      });
      contentRun.create.mockImplementation(({ data }) =>
        Promise.resolve(makeRun(data.config as Record<string, unknown>)),
      );

      const result = await service.create('org-1', 'brand-1', {
        source: { adPerformanceId: 'performance-1', kind: 'public_ad' },
      });

      expect(result.sourceSnapshot).toMatchObject({
        evidence: ['Performance evidence is available for this ad.'],
        sourceId: 'performance-1',
        title: 'Performance meta ad',
      });
    });

    it('rejects disclosure-only repository ads before raw creative can be persisted or generated', async () => {
      const rawCreative = 'VERBATIM REPOSITORY CREATIVE';
      adsResearchService.getAdDetail.mockResolvedValue({
        body: rawCreative,
        channel: 'all',
        creative: {
          body: rawCreative,
          headline: rawCreative,
          imageUrls: ['https://repository.example/raw.jpg'],
          videoUrls: [],
        },
        id: 'public:x:ad-1',
        metrics: {},
        platform: 'x',
        source: 'public',
        sourceId: 'ad-1',
        title: rawCreative,
        usagePolicy: 'disclosure_only',
      });
      contentRun.create.mockImplementation(({ data }) =>
        Promise.resolve(makeRun(data.config as Record<string, unknown>)),
      );

      await expect(
        service.create('org-1', 'brand-1', {
          source: { adPerformanceId: 'performance-1', kind: 'public_ad' },
        }),
      ).rejects.toThrow(BadRequestException);

      expect(adsResearchService.getAdDetail).toHaveBeenCalledWith('org-1', {
        brandId: 'brand-1',
        id: 'performance-1',
        source: 'public',
      });
      expect(contentRun.create).not.toHaveBeenCalled();
      expect(contentGeneratorService.generateContent).not.toHaveBeenCalled();
      expect(imageGenerationService.generateImage).not.toHaveBeenCalled();
      expect(videoGenerationService.generateVideo).not.toHaveBeenCalled();
      expect(
        avatarVideoGenerationService.generateAvatarVideo,
      ).not.toHaveBeenCalled();
      expect(JSON.stringify(contentRun.create.mock.calls)).not.toContain(
        rawCreative,
      );
    });
  });

  describe('persistence and recipe transitions', () => {
    it('uses an atomic revision compare-and-swap and rejects stale editors', async () => {
      const created = await createPersistedRun();
      contentRun.findFirst.mockResolvedValue(created);
      contentRun.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.revise('org-1', 'run-1', {
          edits: { intent: { hook: 'A sharper hook' } },
          expectedRevision: 1,
        }),
      ).rejects.toThrow(ConflictException);

      expect(contentRun.updateMany).toHaveBeenCalledWith({
        data: expect.objectContaining({ config: expect.any(Object) }),
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            { config: { equals: 1, path: ['revision'] } },
            { config: { equals: 'prefilled', path: ['phase'] } },
          ]),
          id: 'run-1',
          isDeleted: false,
          organizationId: 'org-1',
        }),
      });
    });

    it('replaces an unchanged visual directive with safe speech when switching to Avatar', async () => {
      const created = await createPersistedRun({
        draft: {
          output: { aspectRatio: '9:16', count: 1, kind: 'video' },
        },
      });
      contentRun.findFirst.mockResolvedValue(created);
      contentRun.updateMany.mockImplementation(({ data }) => {
        contentRun.findFirst.mockResolvedValue(
          makeRun(data.config as Record<string, unknown>),
        );
        return Promise.resolve({ count: 1 });
      });

      const result = await service.revise('org-1', 'run-1', {
        edits: { output: { kind: 'avatar' } },
        expectedRevision: 1,
      });

      expect(result.draft.intent.objective).toBe(
        'Meet Acme. Put the outcome first, make the next step clear, and discover what Acme can do for you.',
      );
    });

    it('lets explicit semantic references outrank same-role brand defaults', async () => {
      (prisma.asset.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 'explicit-product' },
      ]);
      contentRun.create.mockImplementation(({ data }) =>
        Promise.resolve(makeRun(data.config as Record<string, unknown>)),
      );

      const result = await service.create('org-1', 'brand-1', {
        edits: {
          references: [
            {
              assetId: 'explicit-product',
              role: 'product',
            },
          ],
        },
        source: { kind: 'source_post', sourcePostId: 'source-post-1' },
      });

      expect(result.draft.references).toEqual([
        {
          assetId: 'explicit-product',
          role: 'product',
          source: 'explicit',
        },
      ]);
    });

    it('authorizes every reference before invoking credits or a provider', async () => {
      const created = await createPersistedRun({
        draft: {
          references: [
            {
              assetId: 'missing-reference',
              role: 'product',
              source: 'explicit',
            },
          ],
        },
      });
      contentRun.findFirst.mockResolvedValue(created);
      (prisma.asset.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (
        prisma.ingredient.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([]);

      await expect(
        service.start('org-1', 'run-1', user, request as never, {
          expectedRevision: 1,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(imageGenerationService.generateImage).not.toHaveBeenCalled();
      expect(videoGenerationService.generateVideo).not.toHaveBeenCalled();
      expect(
        avatarVideoGenerationService.generateAvatarVideo,
      ).not.toHaveBeenCalled();
      expect(contentRun.updateMany).not.toHaveBeenCalled();
    });

    it('rejects an explicit clone-only remix voice before placeholder, credit, or provider work', async () => {
      const created = await createPersistedRun();
      contentRun.findFirst.mockResolvedValue(created);
      (
        prisma.ingredient.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        {
          brandId: 'brand-1',
          category: 'AVATAR',
          id: 'avatar-1',
          status: IngredientStatus.GENERATED,
        },
        {
          brandId: 'brand-1',
          category: 'VOICE',
          externalVoiceId: null,
          id: 'voice-1',
          isCloned: true,
          sampleAudioUrl: null,
          status: IngredientStatus.GENERATED,
        },
      ]);

      try {
        await service.start('org-1', 'run-1', user, request as never, {
          expectedRevision: 1,
        });
        expect.unreachable('clone-only explicit remix voices must be rejected');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toMatchObject({
          detail: 'The selected voice must be a usable saved brand voice.',
          title: 'Invalid remix voice',
        });
        expect(
          JSON.stringify((error as BadRequestException).getResponse()),
        ).not.toContain('voice-1');
      }

      expect(
        avatarVideoGenerationService.generateAvatarVideo,
      ).not.toHaveBeenCalled();
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).not.toHaveBeenCalled();
      expect(contentRun.updateMany).not.toHaveBeenCalled();
      expect(byokService.isByokActiveForProvider).not.toHaveBeenCalled();
    });

    it('fails closed for a foreign remix voice without disclosing existence', async () => {
      const created = await createPersistedRun();
      contentRun.findFirst.mockResolvedValue(created);
      (
        prisma.ingredient.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        {
          brandId: 'brand-1',
          category: 'AVATAR',
          id: 'avatar-1',
          status: IngredientStatus.GENERATED,
        },
      ]);

      try {
        await service.start('org-1', 'run-1', user, request as never, {
          expectedRevision: 1,
        });
        expect.unreachable('foreign remix voices must be rejected');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toMatchObject({
          detail: 'The selected voice must be a usable saved brand voice.',
          title: 'Invalid remix voice',
        });
        expect(
          JSON.stringify((error as BadRequestException).getResponse()),
        ).not.toContain('voice-1');
        expect(
          JSON.stringify((error as BadRequestException).getResponse()),
        ).not.toContain('org-2');
      }

      expect(
        avatarVideoGenerationService.generateAvatarVideo,
      ).not.toHaveBeenCalled();
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).not.toHaveBeenCalled();
      expect(contentRun.updateMany).not.toHaveBeenCalled();
    });

    it('admits an explicit sample-backed remix voice into avatar generation', async () => {
      const created = await createPersistedRun();
      let stored = created;
      contentRun.findFirst.mockImplementation(() => Promise.resolve(stored));
      contentRun.updateMany.mockImplementation(({ data }) => {
        stored = makeRun(data.config as Record<string, unknown>);
        stored.status = (data.status ?? stored.status) as ContentRunStatus;
        return Promise.resolve({ count: 1 });
      });
      (
        prisma.ingredient.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        {
          brandId: 'brand-1',
          category: 'AVATAR',
          id: 'avatar-1',
          status: IngredientStatus.GENERATED,
        },
        {
          brandId: 'brand-1',
          category: 'VOICE',
          externalVoiceId: null,
          id: 'voice-1',
          isCloned: true,
          sampleAudioUrl: 'https://cdn.example.com/reference.wav',
          status: IngredientStatus.GENERATED,
        },
      ]);
      avatarVideoGenerationService.generateAvatarVideo.mockImplementation(
        async (_params, _context, onCreated, _scope, onCredits) => {
          await onCreated?.('avatar-sample-1');
          await onCredits?.();
          return {
            externalId: 'heygen-sample-1',
            ingredientId: 'avatar-sample-1',
            status: 'processing',
          };
        },
      );

      await service.start('org-1', 'run-1', user, request as never, {
        expectedRevision: 1,
      });

      expect(
        avatarVideoGenerationService.generateAvatarVideo,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          clonedVoiceId: 'voice-1',
          photoIngredientId: 'avatar-1',
        }),
        expect.objectContaining({
          organizationId: 'org-1',
        }),
        expect.any(Function),
        expect.any(Object),
        expect.any(Function),
      );
    });

    it('reuses the latest editable run for the same scoped source selector', async () => {
      const created = await createPersistedRun();
      contentRun.findFirst.mockResolvedValue(created);

      const result = await service.create('org-1', 'brand-1', {
        source: { kind: 'source_post', sourcePostId: 'source-post-1' },
      });

      expect(result.id).toBe('run-1');
      expect(contentRun.findFirst).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        select: expect.any(Object),
        where: expect.objectContaining({
          AND: [
            {
              config: {
                equals: {
                  kind: 'source_post',
                  sourcePostId: 'source-post-1',
                },
                path: ['sourceSnapshot', 'selector'],
              },
            },
            { config: { equals: 'prefilled', path: ['phase'] } },
          ],
          brandId: 'brand-1',
          isDeleted: false,
          organizationId: 'org-1',
          status: ContentRunStatus.PENDING,
        }),
      });
      expect(contentRun.create).toHaveBeenCalledTimes(1);
    });

    it('serializes the final reuse-or-create boundary for rapid Remix clicks', async () => {
      contentRun.create.mockImplementation(({ data }) =>
        Promise.resolve(makeRun(data.config as Record<string, unknown>)),
      );

      await service.create('org-1', 'brand-1', {
        source: { kind: 'source_post', sourcePostId: 'source-post-1' },
      });

      expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'Serializable',
      });
      expect(contentRun.findFirst).toHaveBeenCalledTimes(2);
      expect(contentRun.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('execution, dispatch, and credit settlement', () => {
    it('dispatches one durable variant per requested image and preserves the canonical generation brief', async () => {
      const created = await createPersistedRun({
        draft: {
          output: { aspectRatio: '1:1', count: 2, kind: 'image' },
        },
      });
      installExactConfigStore(created);
      imageGenerationService.generateImage
        .mockResolvedValueOnce({ data: { id: 'image-1', type: 'ingredient' } })
        .mockResolvedValueOnce({ data: { id: 'image-2', type: 'ingredient' } });

      const result = await service.start(
        'org-1',
        'run-1',
        user,
        request as never,
        { expectedRevision: 1 },
      );

      expect(imageGenerationService.generateImage).toHaveBeenCalledTimes(2);
      expect(imageGenerationService.generateImage).toHaveBeenNthCalledWith(
        1,
        user,
        expect.objectContaining({
          brandId: 'brand-1',
          brandingMode: 'brand',
          height: 1024,
          outputs: 1,
          references: ['brand-reference-1'],
          width: 1024,
        }),
        expect.objectContaining({
          context: { organizationId: 'org-1' },
          creditsConfig: expect.objectContaining({ deferred: true }),
        }),
        expect.any(Function),
        expect.objectContaining({
          groupId: 'run-1',
          groupIndex: 0,
          settleCreditsExternally: true,
        }),
        expect.any(Function),
        expect.arrayContaining([
          expect.objectContaining({
            assetId: 'brand-reference-1',
            role: 'product',
          }),
        ]),
      );
      expect(result.execution).toMatchObject({
        actualCount: 0,
        generationBrief: {
          mediaKind: 'image',
          references: [{ assetId: 'brand-reference-1', role: 'product' }],
          version: 1,
        },
        requestedCount: 2,
        variants: [
          {
            assetIds: ['image-1'],
            id: 'variant-1',
            recipeRevision: 1,
            status: 'processing',
          },
          {
            assetIds: ['image-2'],
            id: 'variant-2',
            recipeRevision: 1,
            status: 'processing',
          },
        ],
      });
    });

    it('persists the placeholder ID before image provider dispatch continues', async () => {
      const created = await createPersistedRun({
        draft: {
          output: { aspectRatio: '1:1', count: 1, kind: 'image' },
        },
      });
      let stored = created;
      const order: string[] = [];
      contentRun.findFirst.mockImplementation(() => Promise.resolve(stored));
      contentRun.updateMany.mockImplementation(({ data }) => {
        stored = makeRun(data.config as Record<string, unknown>);
        stored.status = (data.status ?? stored.status) as ContentRunStatus;
        const execution = (
          stored.config as {
            execution?: { variants?: Array<{ assetIds?: string[] }> };
          }
        ).execution;
        if (
          execution?.variants?.some((variant) =>
            variant.assetIds?.includes('image-linked-before-provider'),
          )
        ) {
          order.push('linked');
        }
        return Promise.resolve({ count: 1 });
      });
      imageGenerationService.generateImage.mockImplementation(
        async (
          _user,
          _dto,
          _request,
          onPlaceholderCreated,
          _scope,
          onCreditsPrepared,
        ) => {
          await onPlaceholderCreated?.('image-linked-before-provider');
          await onCreditsPrepared?.();
          order.push('provider');
          return {
            data: {
              id: 'image-linked-before-provider',
              type: 'ingredient',
            },
          };
        },
      );

      const result = await service.start(
        'org-1',
        'run-1',
        user,
        request as never,
        { expectedRevision: 1 },
      );

      expect(order.indexOf('linked')).toBeGreaterThanOrEqual(0);
      expect(order.indexOf('linked')).toBeLessThan(order.indexOf('provider'));
      expect(result.execution?.variants[0]?.assetIds).toEqual([
        'image-linked-before-provider',
      ]);
    });

    it('makes a concurrent start loser perform no provider side effect', async () => {
      const created = await createPersistedRun({
        draft: {
          output: { aspectRatio: '1:1', count: 1, kind: 'image' },
        },
      });
      contentRun.findFirst.mockResolvedValue(created);
      contentRun.updateMany.mockImplementation(({ data }) => {
        const next = data.config as Record<string, unknown>;
        return Promise.resolve(
          next.generationClaim ? { count: 0 } : { count: 1 },
        );
      });

      await service.start('org-1', 'run-1', user, request as never, {
        expectedRevision: 1,
      });

      expect(imageGenerationService.generateImage).not.toHaveBeenCalled();
      expect(videoGenerationService.generateVideo).not.toHaveBeenCalled();
      expect(
        avatarVideoGenerationService.generateAvatarVideo,
      ).not.toHaveBeenCalled();
    });

    it('generates grouped copy with durable partial-output reasons', async () => {
      const created = await createPersistedRun({
        draft: { output: { count: 3, kind: 'copy' } },
      });
      installExactConfigStore(created);
      contentGeneratorService.generateContent
        .mockResolvedValueOnce([{ content: 'Original brand copy one.' }])
        .mockResolvedValueOnce([{ content: 'Original brand copy two.' }])
        .mockResolvedValueOnce([{ content: 'Original brand copy two.' }]);

      const result = await service.start(
        'org-1',
        'run-1',
        user,
        request as never,
        { expectedRevision: 1 },
      );

      expect(result).toMatchObject({
        execution: {
          actualCount: 2,
          partialReason: expect.stringContaining('1 requested copy'),
          requestedCount: 3,
          variants: [
            expect.objectContaining({
              content: 'Original brand copy one.',
              status: 'ready',
            }),
            expect.objectContaining({
              content: 'Original brand copy two.',
              status: 'ready',
            }),
            expect.objectContaining({ status: 'failed' }),
          ],
        },
        phase: 'partially_ready',
      });
      expect(contentGeneratorService.generateContent).toHaveBeenCalledTimes(3);
      const creditCheckOrder =
        creditsUtilsService.checkOrganizationCreditsAvailable.mock
          .invocationCallOrder[0];
      const generationOrder =
        contentGeneratorService.generateContent.mock.invocationCallOrder[0];
      expect(creditCheckOrder).toBeDefined();
      expect(generationOrder).toBeDefined();
      expect(creditCheckOrder ?? Number.MAX_SAFE_INTEGER).toBeLessThan(
        generationOrder ?? 0,
      );
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith('org-1', 3);
      expect(
        creditsUtilsService.deductCreditsFromOrganization,
      ).toHaveBeenCalledWith(
        'org-1',
        'user-1',
        2,
        'Brand remix generation',
        ActivitySource.SCRIPT,
        expect.objectContaining({
          idempotencyKey: 'brand-remix.generate:generate-workflow-execution-1',
          referenceId: 'run-1',
          referenceType: 'brand-remix-run',
        }),
      );
    });

    it('binds a durable placeholder for each dispatched image variant', async () => {
      const created = await createPersistedRun({
        draft: {
          output: { aspectRatio: '1:1', count: 3, kind: 'image' },
        },
      });
      installExactConfigStore(created);
      imageGenerationService.generateImage.mockImplementation(
        async (
          _user,
          _dto,
          _request,
          onCreated,
          reservation,
          onCreditsPrepared,
        ) => {
          await onCreated?.(`image-${reservation.groupIndex}`);
          await onCreditsPrepared?.();
          return {
            data: {
              id: `image-${reservation.groupIndex}`,
              type: 'ingredient',
            },
          };
        },
      );

      const result = await service.start(
        'org-1',
        'run-1',
        user,
        request as never,
        { expectedRevision: 1 },
      );

      expect(result.execution?.variants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ assetIds: ['image-0'] }),
          expect.objectContaining({ assetIds: ['image-1'] }),
          expect.objectContaining({ assetIds: ['image-2'] }),
        ]),
      );
      expect(prisma.ingredient.updateMany).toHaveBeenNthCalledWith(1, {
        data: { templateVersion: 1 },
        where: {
          brandId: 'brand-1',
          groupId: 'run-1',
          groupIndex: 0,
          id: 'image-0',
          isDeleted: false,
          organizationId: 'org-1',
        },
      });
      expect(imageGenerationService.generateImage).toHaveBeenCalledTimes(3);
      expect(imageGenerationService.generateImage).toHaveBeenNthCalledWith(
        1,
        expect.any(Object),
        expect.any(Object),
        expect.any(Object),
        expect.any(Function),
        expect.objectContaining({
          groupId: 'run-1',
          groupIndex: 0,
          settleCreditsExternally: true,
        }),
        expect.any(Function),
        expect.arrayContaining([
          expect.objectContaining({
            assetId: 'brand-reference-1',
            role: 'product',
          }),
        ]),
      );
    });

    it('blocks strict fidelity before any generation provider call', async () => {
      const created = await createPersistedRun({
        draft: {
          fidelityMode: 'strict',
          output: { aspectRatio: '1:1', count: 1, kind: 'image' },
          references: [],
        },
      });
      contentRun.findFirst.mockResolvedValue(created);

      await expect(
        service.start('org-1', 'run-1', user, request as never, {
          expectedRevision: 1,
        }),
      ).rejects.toThrow(ConflictException);

      expect(imageGenerationService.generateImage).not.toHaveBeenCalled();
      expect(videoGenerationService.generateVideo).not.toHaveBeenCalled();
      expect(
        avatarVideoGenerationService.generateAvatarVideo,
      ).not.toHaveBeenCalled();
    });

    it('persists an actionable Guided degradation when an optional signal is omitted', async () => {
      contentRun.create.mockImplementation(({ data }) =>
        Promise.resolve(makeRun(data.config as Record<string, unknown>)),
      );

      const result = await service.create('org-1', 'brand-1', {
        edits: {
          fidelityMode: 'guided',
          output: { aspectRatio: '1:1', count: 1, kind: 'image' },
          references: [{ assetId: 'brand-reference-1', role: 'first_frame' }],
        },
        source: { kind: 'source_post', sourcePostId: 'source-post-1' },
      });

      expect(result).toMatchObject({
        draft: { fidelityMode: 'guided' },
        readiness: {
          issues: [
            expect.objectContaining({
              code: 'unsupported_reference_role',
              severity: 'degraded',
            }),
          ],
          state: 'degraded',
        },
      });
      expect(contentRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            config: expect.objectContaining({
              readiness: expect.objectContaining({ state: 'degraded' }),
            }),
          }),
        }),
      );
    });

    it('resumes only unlinked queued or processing variants after a crash', async () => {
      const created = await createPersistedRun({
        draft: {
          identity: {},
          output: { aspectRatio: '1:1', count: 4, kind: 'image' },
        },
        execution: {
          actualCount: 1,
          generationBrief: {
            constraints: [
              {
                kind: 'avoid',
                required: true,
                value: 'Do not copy the source creative.',
              },
            ],
            fidelityMode: 'guided',
            intent: {
              objective: 'Create an original TikTok execution for Acme.',
              requestedText: [],
              subjects: ['Acme'],
              visualDirection: 'Use an original product-led composition.',
            },
            mediaKind: 'image',
            output: { aspectRatio: '1:1' },
            provenance: [],
            references: [{ assetId: 'brand-reference-1', role: 'product' }],
            version: 1,
          },
          requestedCount: 4,
          variants: [
            {
              assetIds: [],
              id: 'variant-queued',
              recipeRevision: 1,
              status: 'queued',
            },
            {
              assetIds: [],
              id: 'variant-crashed-before-link',
              recipeRevision: 1,
              status: 'processing',
            },
            {
              assetIds: ['image-in-flight'],
              id: 'variant-in-flight',
              recipeRevision: 1,
              status: 'processing',
            },
            {
              assetIds: ['image-ready'],
              id: 'variant-ready',
              recipeRevision: 1,
              status: 'ready',
            },
          ],
        },
        phase: 'partially_ready',
      });
      installExactConfigStore(created);
      (
        prisma.ingredient.findMany as ReturnType<typeof vi.fn>
      ).mockImplementation(
        ({ where }: { where?: Record<string, unknown> } = {}) => {
          if (where && 'groupId' in where) {
            return Promise.resolve([]);
          }
          return Promise.resolve([
            { id: 'image-in-flight', status: IngredientStatus.PROCESSING },
            { id: 'image-ready', status: IngredientStatus.GENERATED },
          ]);
        },
      );
      imageGenerationService.generateImage
        .mockImplementationOnce(
          async (_user, _dto, _request, onCreated, _scope, onCredits) => {
            await onCreated?.('image-resumed-1');
            await onCredits?.();
            return { data: { id: 'image-resumed-1', type: 'ingredient' } };
          },
        )
        .mockImplementationOnce(
          async (_user, _dto, _request, onCreated, _scope, onCredits) => {
            await onCreated?.('image-resumed-2');
            await onCredits?.();
            return { data: { id: 'image-resumed-2', type: 'ingredient' } };
          },
        );

      const result = await service.start(
        'org-1',
        'run-1',
        user,
        request as never,
        { expectedRevision: 1 },
      );

      expect(imageGenerationService.generateImage).toHaveBeenCalledTimes(2);
      expect(result.execution?.variants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            assetIds: ['image-in-flight'],
            id: 'variant-in-flight',
          }),
          expect.objectContaining({
            assetIds: ['image-ready'],
            id: 'variant-ready',
            status: 'ready',
          }),
          expect.objectContaining({
            assetIds: ['image-resumed-1'],
            id: 'variant-queued',
          }),
          expect.objectContaining({
            assetIds: ['image-resumed-2'],
            id: 'variant-crashed-before-link',
          }),
        ]),
      );
    });

    it('does not redispatch a provider-marked reservation after its lease expires', async () => {
      const created = await createPersistedRun({
        execution: {
          actualCount: 0,
          generationBrief: {
            constraints: [],
            fidelityMode: 'guided',
            intent: {
              objective: 'Introduce Acme with a concise result-led script.',
              requestedText: [],
              subjects: ['Acme'],
            },
            mediaKind: 'video',
            output: { aspectRatio: '9:16' },
            provenance: [],
            references: [{ assetId: 'brand-reference-1', role: 'product' }],
            version: 1,
          },
          requestedCount: 1,
          variants: [
            {
              assetIds: ['avatar-in-flight'],
              id: 'variant-in-flight',
              recipeRevision: 1,
              status: 'processing',
            },
          ],
        },
        generationClaim: {
          claimedAt: '2026-08-20T09:50:00.000Z',
          id: 'run-1:generate:1',
          variantIds: ['variant-in-flight'],
        },
        phase: 'generating',
      });
      contentRun.findFirst.mockResolvedValue(created);
      contentRun.updateMany.mockResolvedValue({ count: 1 });
      (
        prisma.ingredient.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        {
          brandId: 'brand-1',
          category: 'AVATAR',
          id: 'avatar-1',
          status: IngredientStatus.GENERATED,
        },
        {
          brandId: 'brand-1',
          category: 'VOICE',
          externalVoiceId: 'voice-external-1',
          id: 'voice-1',
          isCloned: true,
          status: IngredientStatus.GENERATED,
        },
        {
          id: 'avatar-in-flight',
          metadata: { externalId: null, externalProvider: 'heygen' },
          status: IngredientStatus.PROCESSING,
        },
      ]);

      const result = await service.start(
        'org-1',
        'run-1',
        user,
        request as never,
        { expectedRevision: 1 },
      );

      expect(
        avatarVideoGenerationService.generateAvatarVideo,
      ).not.toHaveBeenCalled();
      expect(prisma.ingredient.updateMany).not.toHaveBeenCalled();
      expect(result.execution?.variants[0]).toMatchObject({
        assetIds: ['avatar-in-flight'],
        status: 'processing',
      });
    });

    it('adopts an orphaned placeholder after a crash instead of paying for the variant twice', async () => {
      const created = await createPersistedRun({
        draft: {
          identity: {},
          output: { aspectRatio: '1:1', count: 2, kind: 'image' },
        },
        execution: {
          actualCount: 0,
          generationBrief: {
            constraints: [],
            fidelityMode: 'guided',
            intent: {
              objective: 'Create an original TikTok execution for Acme.',
              requestedText: [],
              subjects: ['Acme'],
              visualDirection: 'Use an original product-led composition.',
            },
            mediaKind: 'image',
            output: { aspectRatio: '1:1' },
            provenance: [],
            references: [{ assetId: 'brand-reference-1', role: 'product' }],
            version: 1,
          },
          requestedCount: 2,
          variants: [
            {
              assetIds: [],
              id: 'variant-queued',
              recipeRevision: 1,
              status: 'queued',
            },
            {
              assetIds: [],
              id: 'variant-crashed-before-link',
              recipeRevision: 1,
              status: 'processing',
            },
          ],
        },
        phase: 'generating',
      });
      let stored = created;
      contentRun.findFirst.mockImplementation(() => Promise.resolve(stored));
      contentRun.updateMany.mockImplementation(({ data }) => {
        stored = makeRun(data.config as Record<string, unknown>);
        stored.status = (data.status ?? stored.status) as ContentRunStatus;
        return Promise.resolve({ count: 1 });
      });
      (
        prisma.ingredient.findMany as ReturnType<typeof vi.fn>
      ).mockImplementation(
        ({ where }: { where?: Record<string, unknown> } = {}) => {
          if (where && 'groupId' in where) {
            return Promise.resolve([
              { groupIndex: 1, id: 'image-orphan-1' },
              { groupIndex: 1, id: 'image-orphan-duplicate' },
            ]);
          }
          return Promise.resolve([
            { id: 'image-orphan-1', status: IngredientStatus.PROCESSING },
            { id: 'image-resumed-1', status: IngredientStatus.PROCESSING },
          ]);
        },
      );
      imageGenerationService.generateImage.mockImplementation(
        async (_user, _dto, _request, onCreated, _scope, onCredits) => {
          await onCreated?.('image-resumed-1');
          await onCredits?.();
          return { data: { id: 'image-resumed-1', type: 'ingredient' } };
        },
      );

      const result = await service.start(
        'org-1',
        'run-1',
        user,
        request as never,
        { expectedRevision: 1 },
      );

      expect(imageGenerationService.generateImage).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(result.execution?.variants)).not.toContain(
        'image-orphan-duplicate',
      );
      expect(prisma.ingredient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            brandId: 'brand-1',
            groupId: 'run-1',
            isDeleted: false,
            status: { not: IngredientStatus.FAILED },
            templateVersion: 1,
          }),
        }),
      );
      const orphanLookup = (
        prisma.ingredient.findMany as ReturnType<typeof vi.fn>
      ).mock.calls.find(
        ([query]) =>
          query &&
          typeof query === 'object' &&
          'where' in query &&
          (query.where as Record<string, unknown>).groupId === 'run-1',
      )?.[0] as Record<string, unknown> | undefined;
      expect(orphanLookup).not.toHaveProperty('take');
      expect(prisma.ingredient.updateMany).toHaveBeenCalledWith({
        data: { status: IngredientStatus.FAILED },
        where: expect.objectContaining({
          brandId: 'brand-1',
          groupId: 'run-1',
          id: { in: ['image-orphan-duplicate'] },
          isDeleted: false,
          organizationId: 'org-1',
          status: { not: IngredientStatus.FAILED },
          templateVersion: 1,
        }),
      });
      expect(result.execution?.variants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            assetIds: ['image-resumed-1'],
            id: 'variant-queued',
          }),
          expect.objectContaining({
            assetIds: ['image-orphan-1'],
            id: 'variant-crashed-before-link',
          }),
        ]),
      );
    });

    it('adopts an orphaned Avatar placeholder after a crash without redispatching it', async () => {
      const created = await createPersistedRun({
        draft: {
          output: { aspectRatio: '9:16', count: 2, kind: 'avatar' },
        },
        execution: {
          actualCount: 0,
          generationBrief: {
            constraints: [],
            fidelityMode: 'guided',
            intent: {
              objective: 'Introduce Acme with a concise result-led script.',
              requestedText: [],
              subjects: ['Acme'],
            },
            mediaKind: 'video',
            output: { aspectRatio: '9:16' },
            provenance: [],
            references: [{ assetId: 'brand-reference-1', role: 'product' }],
            version: 1,
          },
          requestedCount: 2,
          variants: [
            {
              assetIds: [],
              id: 'variant-queued',
              recipeRevision: 1,
              status: 'queued',
            },
            {
              assetIds: [],
              id: 'variant-crashed-before-link',
              recipeRevision: 1,
              status: 'processing',
            },
          ],
        },
        phase: 'generating',
      });
      let stored = created;
      contentRun.findFirst.mockImplementation(() => Promise.resolve(stored));
      contentRun.updateMany.mockImplementation(({ data }) => {
        stored = makeRun(data.config as Record<string, unknown>);
        stored.status = (data.status ?? stored.status) as ContentRunStatus;
        return Promise.resolve({ count: 1 });
      });
      (
        prisma.ingredient.findMany as ReturnType<typeof vi.fn>
      ).mockImplementation(
        ({ where }: { where?: Record<string, unknown> } = {}) => {
          if (where && 'groupId' in where) {
            return Promise.resolve([{ groupIndex: 1, id: 'avatar-orphan-1' }]);
          }
          const requestedIds = (where?.id as { in?: string[] } | undefined)?.in;
          if (requestedIds?.includes('avatar-1')) {
            return Promise.resolve([
              {
                brandId: 'brand-1',
                category: 'AVATAR',
                id: 'avatar-1',
                status: IngredientStatus.GENERATED,
              },
              {
                brandId: 'brand-1',
                category: 'VOICE',
                externalVoiceId: 'voice-external-1',
                id: 'voice-1',
                isCloned: true,
                status: IngredientStatus.GENERATED,
              },
            ]);
          }
          return Promise.resolve([
            { id: 'avatar-orphan-1', status: IngredientStatus.PROCESSING },
            { id: 'avatar-resumed-1', status: IngredientStatus.PROCESSING },
          ]);
        },
      );
      avatarVideoGenerationService.generateAvatarVideo.mockImplementation(
        async (_params, _context, onCreated, _scope, onCredits) => {
          await onCreated?.('avatar-resumed-1');
          await onCredits?.();
          return {
            externalId: 'heygen-resumed-1',
            ingredientId: 'avatar-resumed-1',
            status: 'processing',
          };
        },
      );

      const result = await service.start(
        'org-1',
        'run-1',
        user,
        request as never,
        { expectedRevision: 1 },
      );

      expect(
        avatarVideoGenerationService.generateAvatarVideo,
      ).toHaveBeenCalledTimes(1);
      expect(prisma.ingredient.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: IngredientCategory.AVATAR,
            groupId: 'run-1',
            templateVersion: 1,
          }),
        }),
      );
      expect(result.execution?.variants).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            assetIds: ['avatar-resumed-1'],
            id: 'variant-queued',
          }),
          expect.objectContaining({
            assetIds: ['avatar-orphan-1'],
            id: 'variant-crashed-before-link',
          }),
        ]),
      );
    });

    it('re-authorizes the durable source selector before generation dispatch', async () => {
      const created = await createPersistedRun({
        draft: {
          output: { aspectRatio: '1:1', count: 1, kind: 'image' },
        },
      });
      contentRun.findFirst.mockResolvedValue(created);
      (
        prisma.sourcePost.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.start('org-1', 'run-1', user, request as never, {
          expectedRevision: 1,
        }),
      ).rejects.toThrow();

      expect(imageGenerationService.generateImage).not.toHaveBeenCalled();
      expect(videoGenerationService.generateVideo).not.toHaveBeenCalled();
      expect(
        avatarVideoGenerationService.generateAvatarVideo,
      ).not.toHaveBeenCalled();
    });

    it('re-checks a connected credential before any generation provider call', async () => {
      const created = await createPersistedRun({
        draft: {
          output: { aspectRatio: '1:1', count: 1, kind: 'image' },
        },
      });
      const config = created.config as Record<string, unknown>;
      const sourceSnapshot = config.sourceSnapshot as Record<string, unknown>;
      const connected = makeRun({
        ...config,
        sourceSnapshot: {
          ...sourceSnapshot,
          platform: 'meta',
          selector: {
            adAccountId: 'act-1',
            adId: 'ad-1',
            credentialId: 'credential-1',
            kind: 'connected_ad',
            platform: 'meta',
          },
          sourceId: 'ad-1',
        },
      });
      contentRun.findFirst.mockResolvedValue(connected);
      (
        prisma.credential.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue(null);

      await expect(
        service.start('org-1', 'run-1', user, request as never, {
          expectedRevision: 1,
        }),
      ).rejects.toThrow(BadRequestException);

      expect(adsResearchService.getAdDetail).not.toHaveBeenCalled();
      expect(imageGenerationService.generateImage).not.toHaveBeenCalled();
    });

    it('compiles the canonical brief into safe semantic provider input', async () => {
      const created = await createPersistedRun({
        draft: {
          output: { aspectRatio: '1:1', count: 1, kind: 'image' },
        },
      });
      let stored = created;
      contentRun.findFirst.mockImplementation(() => Promise.resolve(stored));
      contentRun.updateMany.mockImplementation(({ data }) => {
        stored = makeRun(data.config as Record<string, unknown>);
        stored.status = (data.status ?? stored.status) as ContentRunStatus;
        return Promise.resolve({ count: 1 });
      });
      imageGenerationService.generateImage.mockImplementation(
        async (_user, _dto, _request, onCreated, _scope, onCredits) => {
          await onCreated?.('image-semantic-1');
          await onCredits?.();
          return { data: { id: 'image-semantic-1', type: 'ingredient' } };
        },
      );

      await service.start('org-1', 'run-1', user, request as never, {
        expectedRevision: 1,
      });

      const providerInput = imageGenerationService.generateImage.mock
        .calls[0]?.[1].text as string;
      expect(providerInput).toContain('Brand subjects: Acme');
      expect(providerInput).toContain('Reference 1 role: product');
      expect(providerInput).toContain('Required avoid constraint:');
      expect(providerInput).toContain('Output aspect ratio: 1:1');
      expect(providerInput).not.toContain(sourcePost.text);
    });

    it('sends Avatar a speakable brand script instead of provider instructions', async () => {
      const created = await createPersistedRun();
      let stored = created;
      contentRun.findFirst.mockImplementation(() => Promise.resolve(stored));
      contentRun.updateMany.mockImplementation(({ data }) => {
        stored = makeRun(data.config as Record<string, unknown>);
        stored.status = (data.status ?? stored.status) as ContentRunStatus;
        return Promise.resolve({ count: 1 });
      });
      avatarVideoGenerationService.generateAvatarVideo.mockImplementation(
        async (_params, _context, onCreated, _scope, onCredits) => {
          await onCreated?.('avatar-semantic-1');
          await onCredits?.();
          return {
            externalId: 'heygen-1',
            ingredientId: 'avatar-semantic-1',
            status: 'processing',
          };
        },
      );

      await service.start('org-1', 'run-1', user, request as never, {
        expectedRevision: 1,
      });

      expect(
        avatarVideoGenerationService.generateAvatarVideo,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          aspectRatio: '9:16',
          clonedVoiceId: 'voice-1',
          photoIngredientId: 'avatar-1',
          text: expect.stringContaining('Acme'),
        }),
        expect.objectContaining({
          brandId: 'brand-1',
          organizationId: 'org-1',
        }),
        expect.any(Function),
        expect.objectContaining({
          groupId: 'run-1',
          settleCreditsExternally: true,
        }),
        expect.any(Function),
      );
      const providerText =
        avatarVideoGenerationService.generateAvatarVideo.mock.calls[0]?.[0]
          .text;
      expect(providerText).not.toContain('Objective:');
      expect(providerText).not.toContain('Reference 1 role:');
      expect(providerText).not.toContain('constraint:');
      expect(providerText).not.toContain('Create an original');
      expect(providerText).not.toContain(sourcePost.text);
    });

    it('settles one credit for every successful Avatar variant', async () => {
      const created = await createPersistedRun();
      let stored = created;
      let generatedCount = 0;
      contentRun.findFirst.mockImplementation(() => Promise.resolve(stored));
      contentRun.updateMany.mockImplementation(({ data }) => {
        stored = makeRun(data.config as Record<string, unknown>);
        stored.status = (data.status ?? stored.status) as ContentRunStatus;
        return Promise.resolve({ count: 1 });
      });
      avatarVideoGenerationService.generateAvatarVideo.mockImplementation(
        async (_params, _context, onCreated, _scope, onCredits) => {
          generatedCount += 1;
          const ingredientId = `avatar-credit-${generatedCount}`;
          await onCreated?.(ingredientId);
          await onCredits?.();
          return {
            externalId: `heygen-credit-${generatedCount}`,
            ingredientId,
            status: 'processing',
          };
        },
      );
      const creditRequest = {
        ...request,
        creditsConfig: {
          amount: 0,
          deferred: true,
          description: 'Brand remix generation',
        },
      };

      const result = await service.start(
        'org-1',
        'run-1',
        user,
        creditRequest as never,
        { expectedRevision: 1 },
      );

      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith('org-1', 3);
      expect(
        creditsUtilsService.deductCreditsFromOrganization,
      ).toHaveBeenCalledWith(
        'org-1',
        'user-1',
        3,
        'Brand remix generation',
        ActivitySource.SCRIPT,
        expect.objectContaining({
          idempotencyKey: 'brand-remix.generate:generate-workflow-execution-1',
          referenceId: 'run-1',
        }),
      );
      expect(result.execution?.generationCredits).toMatchObject({
        isByokBypass: false,
        reservedAmount: 3,
        settledAmount: 3,
      });
      expect(result.execution?.workflowExecutionId).toBe(
        'generate-workflow-execution-1',
      );
      expect(creditRequest.creditsConfig.deferred).toBe(true);
    });

    it('records avatar BYOK usage without checking or deducting platform credits', async () => {
      const created = await createPersistedRun({
        draft: {
          output: { aspectRatio: '9:16', count: 2, kind: 'avatar' },
        },
      });
      let stored = created;
      contentRun.findFirst.mockImplementation(() => Promise.resolve(stored));
      contentRun.updateMany.mockImplementation(({ data }) => {
        stored = makeRun(data.config as Record<string, unknown>);
        stored.status = (data.status ?? stored.status) as ContentRunStatus;
        return Promise.resolve({ count: 1 });
      });
      byokService.isByokActiveForProvider.mockResolvedValue(true);
      let generatedCount = 0;
      avatarVideoGenerationService.generateAvatarVideo.mockImplementation(
        async (_params, _context, onCreated, scope, onCredits) => {
          expect(scope).toMatchObject({ isByokBypass: true });
          const index = ++generatedCount;
          const ingredientId = `avatar-byok-${index}`;
          await onCreated?.(ingredientId);
          await onCredits?.();
          return {
            externalId: `heygen-byok-${index}`,
            ingredientId,
            status: 'processing',
          };
        },
      );

      const result = await service.start(
        'org-1',
        'run-1',
        user,
        request as never,
        { expectedRevision: 1 },
      );

      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).not.toHaveBeenCalled();
      expect(
        creditsUtilsService.deductCreditsFromOrganization,
      ).not.toHaveBeenCalled();
      expect(result.execution?.generationCredits).toMatchObject({
        isByokBypass: true,
        reservedAmount: 0,
        settledAmount: 0,
      });
      expect(request.creditsConfig).toMatchObject({
        isByokBypass: true,
        modelKey: 'heygen/avatar',
        provider: 'heygen',
      });
    });

    it('preserves an explicit positive Avatar credit amount', async () => {
      const created = await createPersistedRun({
        draft: {
          output: { aspectRatio: '9:16', count: 1, kind: 'avatar' },
        },
      });
      let stored = created;
      contentRun.findFirst.mockImplementation(() => Promise.resolve(stored));
      contentRun.updateMany.mockImplementation(({ data }) => {
        stored = makeRun(data.config as Record<string, unknown>);
        stored.status = (data.status ?? stored.status) as ContentRunStatus;
        return Promise.resolve({ count: 1 });
      });
      avatarVideoGenerationService.generateAvatarVideo.mockImplementation(
        async (_params, _context, onCreated, _scope, onCredits) => {
          await onCreated?.('avatar-explicit-credit-1');
          await onCredits?.();
          return {
            externalId: 'heygen-explicit-credit-1',
            ingredientId: 'avatar-explicit-credit-1',
            status: 'processing',
          };
        },
      );
      const creditRequest = {
        ...request,
        creditsConfig: {
          amount: 5,
          deferred: true,
          description: 'Brand remix generation',
        },
      };

      const result = await service.start(
        'org-1',
        'run-1',
        user,
        creditRequest as never,
        { expectedRevision: 1 },
      );

      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).toHaveBeenCalledWith('org-1', 5);
      expect(
        creditsUtilsService.deductCreditsFromOrganization,
      ).toHaveBeenCalledWith(
        'org-1',
        'user-1',
        5,
        'Brand remix generation',
        ActivitySource.SCRIPT,
        expect.objectContaining({
          idempotencyKey: 'brand-remix.generate:generate-workflow-execution-1',
        }),
      );
      expect(result.execution?.generationCredits).toMatchObject({
        reservedAmount: 5,
        settledAmount: 5,
      });
      expect(creditRequest.creditsConfig.deferred).toBe(true);
    });

    it('stops Avatar provider consumption when aggregate credit reservation fails', async () => {
      const created = await createPersistedRun();
      const getStored = installExactConfigStore(created);
      let providerConsumptions = 0;
      creditsUtilsService.checkOrganizationCreditsAvailable.mockResolvedValue(
        false,
      );
      creditsUtilsService.getOrganizationCreditsBalance.mockResolvedValue(0);
      avatarVideoGenerationService.generateAvatarVideo.mockImplementation(
        async (_params, _context, onCreated, _scope, onCredits) => {
          const ingredientId = `avatar-credit-blocked-${providerConsumptions + 1}`;
          await onCreated?.(ingredientId);
          await onCredits?.();
          providerConsumptions += 1;
          return {
            externalId: `heygen-credit-blocked-${providerConsumptions}`,
            ingredientId,
            status: 'processing',
          };
        },
      );
      const creditRequest = {
        ...request,
        creditsConfig: {
          amount: 0,
          deferred: true,
          description: 'Brand remix generation',
        },
      };

      await expect(
        service.start('org-1', 'run-1', user, creditRequest as never, {
          expectedRevision: 1,
        }),
      ).rejects.toMatchObject({
        response: {
          detail: 'Insufficient credits: 3 required, 0 available',
          title: 'Insufficient credits',
        },
        status: 402,
      });

      expect(providerConsumptions).toBe(0);
      expect(
        avatarVideoGenerationService.generateAvatarVideo,
      ).not.toHaveBeenCalled();
      expect(
        creditsUtilsService.deductCreditsFromOrganization,
      ).not.toHaveBeenCalled();
      expect(getStored().config).toMatchObject({
        generationClaim: expect.objectContaining({
          id: 'run-1:generate:1',
        }),
        phase: 'generating',
      });
    });

    it('rejects Avatar generation without a deferred credit contract before claiming the run', async () => {
      const created = await createPersistedRun();
      contentRun.findFirst.mockResolvedValue(created);
      const noCreditsRequest = {
        context: { organizationId: 'org-1' },
      } as Request;

      await expect(
        service.start('org-1', 'run-1', user, noCreditsRequest, {
          expectedRevision: 1,
        }),
      ).rejects.toThrow('requires a deferred credit reservation');

      expect(contentRun.updateMany).not.toHaveBeenCalled();
      expect(
        avatarVideoGenerationService.generateAvatarVideo,
      ).not.toHaveBeenCalled();
    });

    it.each(['image', 'video'] as const)(
      'preserves explicit %s remix credit settlement',
      async (kind) => {
        const created = await createPersistedRun({
          draft: {
            output: { aspectRatio: '1:1', count: 1, kind },
          },
        });
        let stored = created;
        contentRun.findFirst.mockImplementation(() => Promise.resolve(stored));
        contentRun.updateMany.mockImplementation(({ data }) => {
          stored = makeRun(data.config as Record<string, unknown>);
          stored.status = (data.status ?? stored.status) as ContentRunStatus;
          return Promise.resolve({ count: 1 });
        });
        const generator =
          kind === 'image'
            ? imageGenerationService.generateImage
            : videoGenerationService.generateVideo;
        generator.mockImplementation(
          async (_user, _dto, _request, onCreated, _scope, onCredits) => {
            const ingredientId = `${kind}-explicit-credit-1`;
            await onCreated?.(ingredientId);
            await onCredits?.();
            return { data: { id: ingredientId, type: 'ingredient' } };
          },
        );
        const creditRequest = {
          ...request,
          creditsConfig: {
            amount: 4,
            deferred: true,
            description: 'Brand remix generation',
          },
        };

        const result = await service.start(
          'org-1',
          'run-1',
          user,
          creditRequest as never,
          { expectedRevision: 1 },
        );

        expect(
          creditsUtilsService.checkOrganizationCreditsAvailable,
        ).toHaveBeenCalledWith('org-1', 4);
        expect(
          creditsUtilsService.deductCreditsFromOrganization,
        ).toHaveBeenCalledWith(
          'org-1',
          'user-1',
          4,
          'Brand remix generation',
          ActivitySource.SCRIPT,
          expect.objectContaining({
            idempotencyKey:
              'brand-remix.generate:generate-workflow-execution-1',
          }),
        );
        expect(result.execution?.generationCredits).toMatchObject({
          reservedAmount: 4,
          settledAmount: 4,
        });
        expect(creditRequest.creditsConfig.deferred).toBe(true);
      },
    );

    it.each(['image', 'video'] as const)(
      'records request-scoped BYOK usage for %s remixes without platform credits',
      async (kind) => {
        const created = await createPersistedRun({
          draft: {
            output: { aspectRatio: '1:1', count: 1, kind },
          },
        });
        let stored = created;
        contentRun.findFirst.mockImplementation(() => Promise.resolve(stored));
        contentRun.updateMany.mockImplementation(({ data }) => {
          stored = makeRun(data.config as Record<string, unknown>);
          stored.status = (data.status ?? stored.status) as ContentRunStatus;
          return Promise.resolve({ count: 1 });
        });
        const generator =
          kind === 'image'
            ? imageGenerationService.generateImage
            : videoGenerationService.generateVideo;
        generator.mockImplementation(
          async (
            _user,
            _dto,
            _variantRequest,
            onCreated,
            _scope,
            onCredits,
          ) => {
            const ingredientId = `${kind}-byok-credit-1`;
            await onCreated?.(ingredientId);
            await onCredits?.();
            return { data: { id: ingredientId, type: 'ingredient' } };
          },
        );
        const creditRequest = {
          ...request,
          creditsConfig: {
            amount: 4,
            deferred: true,
            description: 'Brand remix generation',
            isByokBypass: true,
            modelKey: 'fal-ai/byok-model',
            provider: 'fal',
          },
        };

        const result = await service.start(
          'org-1',
          'run-1',
          user,
          creditRequest as never,
          { expectedRevision: 1 },
        );

        expect(
          creditsUtilsService.checkOrganizationCreditsAvailable,
        ).not.toHaveBeenCalled();
        expect(
          creditsUtilsService.deductCreditsFromOrganization,
        ).not.toHaveBeenCalled();
        expect(result.execution?.generationCredits).toMatchObject({
          isByokBypass: true,
          reservedAmount: 0,
          settledAmount: 0,
        });
      },
    );

    it('stops provider dispatch when variants resolve mixed BYOK billing modes', async () => {
      const created = await createPersistedRun({
        draft: {
          output: { aspectRatio: '1:1', count: 2, kind: 'image' },
        },
      });
      let stored = created;
      contentRun.findFirst.mockImplementation(() => Promise.resolve(stored));
      contentRun.updateMany.mockImplementation(({ data }) => {
        stored = makeRun(data.config as Record<string, unknown>);
        stored.status = (data.status ?? stored.status) as ContentRunStatus;
        return Promise.resolve({ count: 1 });
      });
      vi.spyOn(remixGraph.dispatch, 'resolveVariantCredits').mockImplementation(
        ({ variant }) => ({
          amount: 4,
          isByokBypass: variant.id === 'variant-1',
          variantId: variant.id,
        }),
      );

      await expect(
        service.start('org-1', 'run-1', user, request as never, {
          expectedRevision: 1,
        }),
      ).rejects.toThrow(/mixed BYOK billing modes/);

      expect(imageGenerationService.generateImage).not.toHaveBeenCalled();
      expect(
        creditsUtilsService.checkOrganizationCreditsAvailable,
      ).not.toHaveBeenCalled();
      expect(
        creditsUtilsService.deductCreditsFromOrganization,
      ).not.toHaveBeenCalled();
    });

    it('passes an operator-authored Avatar script verbatim after trimming', async () => {
      const exactScript = '  Here is the exact line our avatar should say.  ';
      const created = await createPersistedRun({
        draft: { intent: { objective: exactScript } },
      });
      let stored = created;
      contentRun.findFirst.mockImplementation(() => Promise.resolve(stored));
      contentRun.updateMany.mockImplementation(({ data }) => {
        stored = makeRun(data.config as Record<string, unknown>);
        stored.status = (data.status ?? stored.status) as ContentRunStatus;
        return Promise.resolve({ count: 1 });
      });
      avatarVideoGenerationService.generateAvatarVideo.mockImplementation(
        async (_params, _context, onCreated, _scope, onCredits) => {
          await onCreated?.('avatar-script-1');
          await onCredits?.();
          return {
            externalId: 'heygen-script-1',
            ingredientId: 'avatar-script-1',
            status: 'processing',
          };
        },
      );

      await service.start('org-1', 'run-1', user, request as never, {
        expectedRevision: 1,
      });

      expect(
        avatarVideoGenerationService.generateAvatarVideo.mock.calls[0]?.[0]
          .text,
      ).toBe(exactScript.trim());
    });
  });

  describe('review state transitions', () => {
    it('hands ready brand-owned variants to the existing manual Review queue idempotently', async () => {
      const created = await createPersistedRun({
        execution: {
          actualCount: 1,
          generationBrief: {
            constraints: [],
            fidelityMode: 'guided',
            intent: {
              objective: 'Create an original TikTok visual.',
              requestedText: [],
              subjects: ['Acme'],
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
              assetIds: ['image-1'],
              id: 'variant-1',
              recipeRevision: 1,
              status: 'ready',
            },
          ],
        },
        phase: 'ready_for_review',
      });
      contentRun.findFirst.mockResolvedValue(created);
      contentRun.updateMany.mockResolvedValue({ count: 1 });
      (
        prisma.ingredient.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        {
          brandId: 'brand-1',
          category: 'IMAGE',
          id: 'image-1',
          status: IngredientStatus.GENERATED,
        },
      ]);
      batchGenerationService.createManualReviewBatch.mockResolvedValue({
        id: 'batch-1',
        items: [{ id: 'item-1', postId: 'post-1' }],
      });
      let stored = created;
      contentRun.updateMany.mockImplementation(({ data }) => {
        stored = makeRun(data.config as Record<string, unknown>);
        contentRun.findFirst.mockResolvedValue(stored);
        return Promise.resolve({ count: 1 });
      });

      const result = await service.submitForReview('org-1', 'run-1', 'user-1', {
        variantIds: ['variant-1'],
      });

      expect(
        batchGenerationService.createManualReviewBatch,
      ).toHaveBeenCalledWith(
        {
          brandId: 'brand-1',
          items: [
            expect.objectContaining({
              contentRunId: 'run-1',
              ingredientId: 'image-1',
              sourceActionId: 'source-post-1',
              sourceWorkflowId: 'workflow-1',
              variantId: 'variant-1',
              workflowExecutionId: 'workflow-execution-1',
            }),
          ],
        },
        'user-1',
        'org-1',
        'brand-remix:run-1:review:1:variant-1',
      );
      expect(systemWorkflowRunner.runWorkflow).toHaveBeenCalledWith(
        expect.objectContaining({
          canonicalId: 'brand-remix.review-handoff',
        }),
      );
      expect(result).toMatchObject({
        phase: 'in_review',
        review: {
          approvedPostIds: [],
          batchId: 'batch-1',
          postIds: ['post-1'],
          workflowExecutionId: 'workflow-execution-1',
          workflowId: 'workflow-1',
        },
      });
    });

    it('rejects a concurrent review submission that loses the compare-and-swap race', async () => {
      const created = await createPersistedRun({
        execution: {
          actualCount: 1,
          generationBrief: {
            constraints: [],
            fidelityMode: 'guided',
            intent: {
              objective: 'Create an original TikTok visual.',
              requestedText: [],
              subjects: ['Acme'],
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
              assetIds: ['image-1'],
              id: 'variant-1',
              recipeRevision: 1,
              status: 'ready',
            },
          ],
        },
        phase: 'ready_for_review',
      });
      contentRun.findFirst.mockResolvedValue(created);
      (
        prisma.ingredient.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        {
          brandId: 'brand-1',
          category: 'IMAGE',
          id: 'image-1',
          status: IngredientStatus.GENERATED,
        },
      ]);
      batchGenerationService.createManualReviewBatch.mockResolvedValue({
        id: 'batch-1',
        items: [{ id: 'item-1', postId: 'post-1' }],
      });
      // Reconciliation writes succeed; only the review claim loses the race.
      contentRun.updateMany.mockImplementation(({ data }) => {
        const nextConfig = data.config as {
          reviewClaim?: { status?: string };
        };
        return Promise.resolve(
          nextConfig.reviewClaim?.status === 'claimed'
            ? { count: 0 }
            : { count: 1 },
        );
      });

      await expect(
        service.submitForReview('org-1', 'run-1', 'user-1', {
          variantIds: ['variant-1'],
        }),
      ).rejects.toMatchObject({
        response: {
          detail: expect.stringContaining('concurrent'),
          title: 'Concurrent review submission',
        },
        status: 409,
      });
      expect(
        batchGenerationService.createManualReviewBatch,
      ).not.toHaveBeenCalled();
      expect(
        trendReferenceCorpusService.recordPostRemixLineage,
      ).not.toHaveBeenCalled();
    });

    it('reclaims an expired Review lease through CAS before creating side effects', async () => {
      const created = await createPersistedRun({
        execution: {
          actualCount: 1,
          generationBrief: {
            constraints: [],
            fidelityMode: 'guided',
            intent: {
              objective: 'Create an original TikTok visual.',
              requestedText: [],
              subjects: ['Acme'],
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
              assetIds: ['image-1'],
              id: 'variant-1',
              recipeRevision: 1,
              status: 'ready',
            },
          ],
        },
        phase: 'ready_for_review',
      });
      const stored = makeRun({
        ...(created.config as Record<string, unknown>),
        reviewClaim: {
          claimedAt: '2026-08-20T09:50:00.000Z',
          id: 'run-1:review:1',
          selectedVariantIds: ['variant-1'],
          status: 'claimed',
        },
      });
      stored.status = ContentRunStatus.COMPLETED;
      contentRun.findFirst.mockResolvedValue(stored);
      contentRun.updateMany.mockResolvedValue({ count: 0 });
      (
        prisma.ingredient.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        {
          brandId: 'brand-1',
          category: 'IMAGE',
          id: 'image-1',
          status: IngredientStatus.GENERATED,
        },
      ]);

      await expect(
        service.submitForReview('org-1', 'run-1', 'user-1', {
          variantIds: ['variant-1'],
        }),
      ).rejects.toMatchObject({
        response: {
          detail: expect.stringContaining('concurrent'),
          title: 'Concurrent review submission',
        },
        status: 409,
      });

      expect(contentRun.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            config: expect.objectContaining({
              reviewClaim: expect.objectContaining({
                claimedAt: '2026-08-20T10:00:00.000Z',
              }),
            }),
          }),
          where: expect.objectContaining({
            config: { equals: stored.config },
          }),
        }),
      );
      expect(
        batchGenerationService.createManualReviewBatch,
      ).not.toHaveBeenCalled();
      expect(
        trendReferenceCorpusService.recordPostRemixLineage,
      ).not.toHaveBeenCalled();
    });
  });

  describe('paid-draft claims and recovery', () => {
    it('claims and persists an idempotent paused Meta campaign result', async () => {
      const created = await createPersistedRun({
        draft: { target: { kind: 'paid', platform: 'meta' } },
        execution: {
          actualCount: 1,
          generationBrief: {
            constraints: [],
            fidelityMode: 'guided',
            intent: {
              objective: 'Create an original Meta visual.',
              requestedText: [],
              subjects: ['Acme'],
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
              assetIds: ['image-1'],
              id: 'variant-1',
              recipeRevision: 1,
              status: 'ready',
            },
          ],
        },
        phase: 'approved',
        review: {
          approvedPostIds: ['post-1'],
          batchId: 'batch-1',
          postIds: ['post-1'],
          workflowExecutionId: 'workflow-execution-1',
          workflowId: 'workflow-1',
        },
      });
      contentRun.findFirst.mockResolvedValue(created);
      contentRun.updateMany.mockResolvedValue({ count: 1 });
      (
        prisma.ingredient.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        { id: 'image-1', status: IngredientStatus.GENERATED },
      ]);
      (prisma.post.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'post-1',
          reviewDecision: PersistedReviewDecision.APPROVED,
        },
      ]);
      (
        prisma.credential.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        grantedScopes: ['ads_management', 'ads_read'],
        grantedScopesCapturedAt: new Date('2026-08-20T09:00:00.000Z'),
        id: 'credential-1',
      });
      pausedMetaCampaignDraftService.prepare.mockResolvedValue({
        adAccountId: 'act-1',
        adId: 'ad-1',
        adSetId: 'ad-set-1',
        campaignId: 'campaign-1',
        credentialId: 'credential-1',
        ingredientId: 'image-1',
        postId: 'post-1',
        recipeRevision: 1,
        recipeVersion: 1,
        replayed: false,
        status: 'PAUSED',
        variantId: 'variant-1',
        workflowExecutionId: 'workflow-execution-1',
        workflowId: 'workflow-1',
      });
      let stored = created;
      contentRun.updateMany.mockImplementation(({ data }) => {
        stored = makeRun(data.config as Record<string, unknown>);
        contentRun.findFirst.mockResolvedValue(stored);
        return Promise.resolve({ count: 1 });
      });
      const result = await service.preparePausedMetaDraft(
        'org-1',
        'run-1',
        'user-1',
        {
          destination: {
            adAccountId: 'act-1',
            credentialId: 'credential-1',
          },
          variantId: 'variant-1',
        },
      );

      expect(result).toMatchObject({
        paidDraft: {
          adId: 'ad-1',
          adSetId: 'ad-set-1',
          campaignId: 'campaign-1',
          status: 'PAUSED',
        },
        phase: 'paid_draft_ready',
      });
      expect(pausedMetaCampaignDraftService.prepare).toHaveBeenCalledTimes(1);

      await expect(
        service.preparePausedMetaDraft('org-1', 'run-1', 'user-1', {
          destination: {
            adAccountId: 'act-other',
            credentialId: 'credential-1',
          },
          variantId: 'variant-1',
        }),
      ).rejects.toThrow('already exists for another destination');
      expect(pausedMetaCampaignDraftService.prepare).toHaveBeenCalledTimes(1);
    });

    it('claims and persists an idempotent paused X Ads campaign result', async () => {
      const created = await createPersistedRun({
        draft: { target: { kind: 'paid', platform: 'x' } },
        execution: {
          actualCount: 1,
          generationBrief: {
            constraints: [],
            fidelityMode: 'guided',
            intent: {
              objective: 'Create an original X visual.',
              requestedText: [],
              subjects: ['Acme'],
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
              assetIds: ['image-1'],
              id: 'variant-1',
              recipeRevision: 1,
              status: 'ready',
            },
          ],
        },
        phase: 'approved',
        review: {
          approvedPostIds: ['post-1'],
          batchId: 'batch-1',
          postIds: ['post-1'],
          workflowExecutionId: 'workflow-execution-1',
          workflowId: 'workflow-1',
        },
      });
      contentRun.findFirst.mockResolvedValue(created);
      contentRun.updateMany.mockResolvedValue({ count: 1 });
      (
        prisma.ingredient.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        { id: 'image-1', status: IngredientStatus.GENERATED },
      ]);
      (prisma.post.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'post-1',
          reviewDecision: PersistedReviewDecision.APPROVED,
        },
      ]);
      (
        prisma.credential.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        grantedScopes: ['ads.read', 'ads.write'],
        grantedScopesCapturedAt: new Date('2026-08-20T09:00:00.000Z'),
        id: 'credential-1',
      });
      pausedXAdsCampaignDraftService.prepare.mockResolvedValue({
        adAccountId: 'act-1',
        adId: 'ad-1',
        adSetId: 'ad-set-1',
        campaignId: 'campaign-1',
        credentialId: 'credential-1',
        ingredientId: 'image-1',
        postId: 'post-1',
        recipeRevision: 1,
        recipeVersion: 1,
        replayed: false,
        status: 'PAUSED',
        variantId: 'variant-1',
        workflowExecutionId: 'workflow-execution-1',
        workflowId: 'workflow-1',
      });
      let stored = created;
      contentRun.updateMany.mockImplementation(({ data }) => {
        stored = makeRun(data.config as Record<string, unknown>);
        contentRun.findFirst.mockResolvedValue(stored);
        return Promise.resolve({ count: 1 });
      });
      const result = await service.preparePausedMetaDraft(
        'org-1',
        'run-1',
        'user-1',
        {
          destination: {
            adAccountId: 'act-1',
            credentialId: 'credential-1',
          },
          sourceTweetId: 'tweet-1',
          variantId: 'variant-1',
        },
      );

      expect(result).toMatchObject({
        paidDraft: {
          adId: 'ad-1',
          adSetId: 'ad-set-1',
          campaignId: 'campaign-1',
          status: 'PAUSED',
        },
        phase: 'paid_draft_ready',
      });
      expect(pausedXAdsCampaignDraftService.prepare).toHaveBeenCalledTimes(1);
      expect(pausedXAdsCampaignDraftService.prepare).toHaveBeenCalledWith(
        expect.objectContaining({ sourceTweetId: 'tweet-1' }),
      );
      expect(pausedMetaCampaignDraftService.prepare).not.toHaveBeenCalled();

      await expect(
        service.preparePausedMetaDraft('org-1', 'run-1', 'user-1', {
          destination: {
            adAccountId: 'act-other',
            credentialId: 'credential-1',
          },
          sourceTweetId: 'tweet-1',
          variantId: 'variant-1',
        }),
      ).rejects.toThrow('already exists for another destination');
      expect(pausedXAdsCampaignDraftService.prepare).toHaveBeenCalledTimes(1);
    });

    it('rejects a paused X Ads draft that is missing a source tweet id', async () => {
      const created = await createPersistedRun({
        draft: { target: { kind: 'paid', platform: 'x' } },
        execution: {
          actualCount: 1,
          generationBrief: {
            constraints: [],
            fidelityMode: 'guided',
            intent: {
              objective: 'Create an original X visual.',
              requestedText: [],
              subjects: ['Acme'],
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
              assetIds: ['image-1'],
              id: 'variant-1',
              recipeRevision: 1,
              status: 'ready',
            },
          ],
        },
        phase: 'approved',
        review: {
          approvedPostIds: ['post-1'],
          batchId: 'batch-1',
          postIds: ['post-1'],
          workflowExecutionId: 'workflow-execution-1',
          workflowId: 'workflow-1',
        },
      });
      let stored = created;
      contentRun.findFirst.mockResolvedValue(stored);
      contentRun.updateMany.mockImplementation(({ data, where }) => {
        const predicate = where as {
          config?: { equals?: unknown };
          id?: string;
          isDeleted?: boolean;
          organizationId?: string;
        };
        if (
          predicate.id !== stored.id ||
          predicate.organizationId !== stored.organizationId ||
          predicate.isDeleted !== stored.isDeleted ||
          JSON.stringify(predicate.config?.equals) !==
            JSON.stringify(stored.config)
        ) {
          return Promise.resolve({ count: 0 });
        }
        stored = {
          ...stored,
          config:
            (data.config as Record<string, unknown> | undefined) ??
            stored.config,
          status: (data.status ?? stored.status) as ContentRunStatus,
        };
        contentRun.findFirst.mockResolvedValue(stored);
        return Promise.resolve({ count: 1 });
      });
      (
        prisma.ingredient.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        { id: 'image-1', status: IngredientStatus.GENERATED },
      ]);
      (prisma.post.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'post-1',
          reviewDecision: PersistedReviewDecision.APPROVED,
        },
      ]);

      try {
        await service.preparePausedMetaDraft('org-1', 'run-1', 'user-1', {
          destination: {
            adAccountId: 'act-1',
            credentialId: 'credential-1',
          },
          variantId: 'variant-1',
        });
        expect.unreachable('preparePausedMetaDraft should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).getResponse()).toMatchObject({
          detail: expect.stringContaining('existing tweet id is required'),
        });
      }
      expect(pausedXAdsCampaignDraftService.prepare).not.toHaveBeenCalled();
      expect(prisma.credential.findFirst).not.toHaveBeenCalled();
    });

    it('keeps an X Ads draft blocked before provider calls when ads.write is missing', async () => {
      const created = await createPersistedRun({
        draft: { target: { kind: 'paid', platform: 'x' } },
        execution: {
          actualCount: 1,
          generationBrief: {
            constraints: [],
            fidelityMode: 'guided',
            intent: {
              objective: 'Create an original X visual.',
              requestedText: [],
              subjects: ['Acme'],
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
              assetIds: ['image-1'],
              id: 'variant-1',
              recipeRevision: 1,
              status: 'ready',
            },
          ],
        },
        phase: 'approved',
        review: {
          approvedPostIds: ['post-1'],
          batchId: 'batch-1',
          postIds: ['post-1'],
          workflowExecutionId: 'workflow-execution-1',
          workflowId: 'workflow-1',
        },
      });
      let stored = created;
      contentRun.findFirst.mockResolvedValue(stored);
      contentRun.updateMany.mockImplementation(({ data }) => {
        stored = makeRun(data.config as Record<string, unknown>);
        contentRun.findFirst.mockResolvedValue(stored);
        return Promise.resolve({ count: 1 });
      });
      (
        prisma.ingredient.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        { id: 'image-1', status: IngredientStatus.GENERATED },
      ]);
      (prisma.post.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'post-1',
          reviewDecision: PersistedReviewDecision.APPROVED,
        },
      ]);
      (
        prisma.credential.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        grantedScopes: ['ads.read'],
        grantedScopesCapturedAt: new Date('2026-08-20T09:00:00.000Z'),
        id: 'credential-1',
      });

      const result = await service.preparePausedMetaDraft(
        'org-1',
        'run-1',
        'user-1',
        {
          destination: {
            adAccountId: 'act-1',
            credentialId: 'credential-1',
          },
          sourceTweetId: 'tweet-1',
          variantId: 'variant-1',
        },
      );

      expect(result).toMatchObject({
        phase: 'approved',
        readiness: {
          issues: [
            expect.objectContaining({
              code: 'missing_ads_write',
              field: 'target',
              severity: 'blocked',
            }),
          ],
          state: 'blocked',
        },
      });
      expect(pausedXAdsCampaignDraftService.prepare).not.toHaveBeenCalled();
    });

    it('keeps a Meta draft blocked before provider calls when ads_management is missing', async () => {
      const created = await createPersistedRun({
        draft: { target: { kind: 'paid', platform: 'meta' } },
        execution: {
          actualCount: 1,
          generationBrief: {
            constraints: [],
            fidelityMode: 'guided',
            intent: {
              objective: 'Create an original Meta visual.',
              requestedText: [],
              subjects: ['Acme'],
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
              assetIds: ['image-1'],
              id: 'variant-1',
              recipeRevision: 1,
              status: 'ready',
            },
          ],
        },
        phase: 'approved',
        review: {
          approvedPostIds: ['post-1'],
          batchId: 'batch-1',
          postIds: ['post-1'],
          workflowExecutionId: 'workflow-execution-1',
          workflowId: 'workflow-1',
        },
      });
      let stored = created;
      contentRun.findFirst.mockResolvedValue(stored);
      contentRun.updateMany.mockImplementation(({ data }) => {
        stored = makeRun(data.config as Record<string, unknown>);
        contentRun.findFirst.mockResolvedValue(stored);
        return Promise.resolve({ count: 1 });
      });
      (
        prisma.ingredient.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        { id: 'image-1', status: IngredientStatus.GENERATED },
      ]);
      (prisma.post.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'post-1',
          reviewDecision: PersistedReviewDecision.APPROVED,
        },
      ]);
      (
        prisma.credential.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        grantedScopes: ['ads_read'],
        grantedScopesCapturedAt: new Date('2026-08-20T09:00:00.000Z'),
        id: 'credential-1',
      });

      const result = await service.preparePausedMetaDraft(
        'org-1',
        'run-1',
        'user-1',
        {
          destination: {
            adAccountId: 'act-1',
            credentialId: 'credential-1',
          },
          variantId: 'variant-1',
        },
      );

      expect(result).toMatchObject({
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
      expect(pausedMetaCampaignDraftService.prepare).not.toHaveBeenCalled();
    });

    it('keeps a partial Meta failure recoverable without marking a paid draft', async () => {
      const created = await createPersistedRun({
        draft: { target: { kind: 'paid', platform: 'meta' } },
        execution: {
          actualCount: 1,
          generationBrief: {
            constraints: [],
            fidelityMode: 'guided',
            intent: {
              objective: 'Create an original Meta visual.',
              requestedText: [],
              subjects: ['Acme'],
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
              assetIds: ['image-1'],
              id: 'variant-1',
              recipeRevision: 1,
              status: 'ready',
            },
          ],
        },
        phase: 'approved',
        review: {
          approvedPostIds: ['post-1'],
          batchId: 'batch-1',
          postIds: ['post-1'],
          workflowExecutionId: 'review-workflow-execution-1',
          workflowId: 'review-workflow-1',
        },
      });
      let stored = created;
      let interruptedClaimRelease = false;
      contentRun.findFirst.mockImplementation(() => Promise.resolve(stored));
      contentRun.updateMany.mockImplementation(({ data }) => {
        const nextConfig = data.config as Record<string, unknown>;
        if (
          !interruptedClaimRelease &&
          nextConfig.phase === 'approved' &&
          !nextConfig.paidDraftOperation
        ) {
          interruptedClaimRelease = true;
          stored = makeRun({
            ...(stored.config as Record<string, unknown>),
            readiness: {
              issues: [
                {
                  code: 'organization_defaults',
                  field: 'intent',
                  message: 'Brand-specific context is incomplete.',
                  severity: 'degraded',
                },
              ],
              state: 'degraded',
            },
          });
          return Promise.resolve({ count: 0 });
        }
        stored = makeRun(nextConfig);
        stored.status = (data.status ?? stored.status) as ContentRunStatus;
        return Promise.resolve({ count: 1 });
      });
      (
        prisma.ingredient.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        { id: 'image-1', status: IngredientStatus.GENERATED },
      ]);
      (prisma.post.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'post-1',
          reviewDecision: PersistedReviewDecision.APPROVED,
        },
      ]);
      (
        prisma.credential.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        grantedScopes: ['ads_management', 'ads_read'],
        grantedScopesCapturedAt: new Date('2026-08-20T09:00:00.000Z'),
        id: 'credential-1',
      });
      pausedMetaCampaignDraftService.prepare
        .mockRejectedValueOnce(new Error('Meta ad creation failed'))
        .mockResolvedValueOnce({
          adAccountId: 'act-1',
          adId: 'ad-1',
          adSetId: 'ad-set-1',
          campaignId: 'campaign-1',
          credentialId: 'credential-1',
          ingredientId: 'image-1',
          postId: 'post-1',
          recipeRevision: 1,
          recipeVersion: 1,
          replayed: true,
          status: 'PAUSED',
          variantId: 'variant-1',
          workflowExecutionId: 'meta-workflow-execution-1',
          workflowId: 'meta-workflow-1',
        });
      const body = {
        destination: {
          adAccountId: 'act-1',
          credentialId: 'credential-1',
        },
        variantId: 'variant-1',
      };

      await expect(
        service.preparePausedMetaDraft('org-1', 'run-1', 'user-1', body),
      ).rejects.toThrow('Meta ad creation failed');
      expect(interruptedClaimRelease).toBe(true);
      expect(stored.config).toMatchObject({
        phase: 'approved',
      });
      expect(
        (stored.config as Record<string, unknown>).paidDraft,
      ).toBeUndefined();
      expect(
        (stored.config as Record<string, unknown>).paidDraftOperation,
      ).toBeUndefined();

      const recovered = await service.preparePausedMetaDraft(
        'org-1',
        'run-1',
        'user-1',
        body,
      );

      expect(recovered).toMatchObject({
        paidDraft: { adId: 'ad-1', replayed: true, status: 'PAUSED' },
        phase: 'paid_draft_ready',
      });
    });

    it('does not release a newer reclaimed Meta operation after a stale provider failure', async () => {
      const approved = await createApprovedPaidRun();
      approved.status = ContentRunStatus.COMPLETED;
      let stored = approved;
      let interceptedRelease = false;
      contentRun.findFirst.mockImplementation(() => Promise.resolve(stored));
      contentRun.updateMany.mockImplementation(({ data }) => {
        const nextConfig = data.config as Record<string, unknown>;
        if (
          !interceptedRelease &&
          nextConfig.phase === 'approved' &&
          !nextConfig.paidDraftOperation
        ) {
          interceptedRelease = true;
          const staleOperation = (stored.config as Record<string, unknown>)
            .paidDraftOperation as Record<string, unknown>;
          stored = makeRun({
            ...(stored.config as Record<string, unknown>),
            paidDraftOperation: {
              ...staleOperation,
              claimedAt: '2026-08-20T10:00:01.000Z',
            },
          });
          return Promise.resolve({ count: 0 });
        }
        stored = makeRun(nextConfig);
        stored.status = (data.status ?? stored.status) as ContentRunStatus;
        return Promise.resolve({ count: 1 });
      });
      (
        prisma.ingredient.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        { id: 'image-1', status: IngredientStatus.GENERATED },
      ]);
      (prisma.post.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'post-1',
          reviewDecision: PersistedReviewDecision.APPROVED,
        },
      ]);
      (
        prisma.credential.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        grantedScopes: ['ads_management'],
        grantedScopesCapturedAt: new Date('2026-08-20T09:59:00.000Z'),
        id: 'credential-1',
      });
      pausedMetaCampaignDraftService.prepare.mockRejectedValue(
        new Error('stale Meta provider failure'),
      );

      await expect(
        service.preparePausedMetaDraft('org-1', 'run-1', 'user-1', {
          destination: {
            adAccountId: 'act-1',
            credentialId: 'credential-1',
          },
          variantId: 'variant-1',
        }),
      ).rejects.toThrow('stale Meta provider failure');

      expect(interceptedRelease).toBe(true);
      expect(stored.config).toMatchObject({
        paidDraftOperation: {
          claimedAt: '2026-08-20T10:00:01.000Z',
          id: 'run-1:meta:1:variant-1',
        },
        phase: 'paid_draft_creating',
      });
    });

    it('reclaims an expired Meta operation for a corrected destination', async () => {
      const approved = await createPersistedRun({
        draft: { target: { kind: 'paid', platform: 'meta' } },
        execution: {
          actualCount: 1,
          generationBrief: {
            constraints: [],
            fidelityMode: 'guided',
            intent: {
              objective: 'Create an original Meta visual.',
              requestedText: [],
              subjects: ['Acme'],
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
              assetIds: ['image-1'],
              id: 'variant-1',
              recipeRevision: 1,
              status: 'ready',
            },
          ],
        },
        phase: 'approved',
        review: {
          approvedPostIds: ['post-1'],
          batchId: 'batch-1',
          postIds: ['post-1'],
          workflowExecutionId: 'review-workflow-execution-1',
          workflowId: 'review-workflow-1',
        },
      });
      let stored = makeRun({
        ...(approved.config as Record<string, unknown>),
        paidDraftOperation: {
          adAccountId: 'act-old',
          claimedAt: '2026-08-20T09:50:00.000Z',
          credentialId: 'credential-old',
          id: 'run-1:meta:1:variant-1',
          linkUrl: 'https://tiktok.example/@creator/video/1',
          variantId: 'variant-1',
        },
        phase: 'paid_draft_creating',
      });
      contentRun.findFirst.mockImplementation(() => Promise.resolve(stored));
      contentRun.updateMany.mockImplementation(({ data }) => {
        stored = makeRun(data.config as Record<string, unknown>);
        stored.status = (data.status ?? stored.status) as ContentRunStatus;
        return Promise.resolve({ count: 1 });
      });
      (
        prisma.ingredient.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        { id: 'image-1', status: IngredientStatus.GENERATED },
      ]);
      (prisma.post.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'post-1',
          reviewDecision: PersistedReviewDecision.APPROVED,
        },
      ]);
      (
        prisma.credential.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        grantedScopes: ['ads_management'],
        grantedScopesCapturedAt: new Date('2026-08-20T09:59:00.000Z'),
        id: 'credential-new',
      });
      pausedMetaCampaignDraftService.prepare.mockResolvedValue({
        adAccountId: 'act-new',
        adId: 'ad-new',
        adSetId: 'ad-set-new',
        campaignId: 'campaign-new',
        credentialId: 'credential-new',
        ingredientId: 'image-1',
        postId: 'post-1',
        recipeRevision: 1,
        recipeVersion: 1,
        replayed: false,
        status: 'PAUSED',
        variantId: 'variant-1',
        workflowExecutionId: 'meta-workflow-execution-new',
        workflowId: 'meta-workflow-new',
      });

      const result = await service.preparePausedMetaDraft(
        'org-1',
        'run-1',
        'user-1',
        {
          destination: {
            adAccountId: 'act-new',
            credentialId: 'credential-new',
          },
          variantId: 'variant-1',
        },
      );

      expect(result).toMatchObject({
        paidDraft: {
          adAccountId: 'act-new',
          credentialId: 'credential-new',
        },
        phase: 'paid_draft_ready',
      });
      expect(pausedMetaCampaignDraftService.prepare).toHaveBeenCalledWith(
        expect.objectContaining({
          adAccountId: 'act-new',
          credentialId: 'credential-new',
        }),
      );
    });

    it('preserves paid_draft_ready when approved Review posts reconcile', async () => {
      const approved = await createPersistedRun({
        draft: { target: { kind: 'paid', platform: 'meta' } },
        execution: {
          actualCount: 1,
          generationBrief: {
            constraints: [],
            fidelityMode: 'guided',
            intent: {
              objective: 'Create an original Meta visual.',
              requestedText: [],
              subjects: ['Acme'],
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
              assetIds: ['image-1'],
              id: 'variant-1',
              recipeRevision: 1,
              status: 'ready',
            },
          ],
        },
        phase: 'approved',
        review: {
          approvedPostIds: ['post-1'],
          batchId: 'batch-1',
          postIds: ['post-1'],
          workflowExecutionId: 'review-workflow-execution-1',
          workflowId: 'review-workflow-1',
        },
      });
      let stored = makeRun({
        ...(approved.config as Record<string, unknown>),
        paidDraft: {
          adAccountId: 'act-1',
          adId: 'ad-1',
          adSetId: 'ad-set-1',
          campaignId: 'campaign-1',
          credentialId: 'credential-1',
          ingredientId: 'image-1',
          postId: 'post-1',
          recipeRevision: 1,
          recipeVersion: 1,
          replayed: false,
          status: 'PAUSED',
          variantId: 'variant-1',
          workflowExecutionId: 'meta-workflow-execution-1',
          workflowId: 'meta-workflow-1',
        },
        phase: 'paid_draft_ready',
      });
      contentRun.findFirst.mockImplementation(() => Promise.resolve(stored));
      contentRun.updateMany.mockImplementation(({ data }) => {
        stored = makeRun(data.config as Record<string, unknown>);
        stored.status = (data.status ?? stored.status) as ContentRunStatus;
        return Promise.resolve({ count: 1 });
      });
      (
        prisma.ingredient.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        { id: 'image-1', status: IngredientStatus.GENERATED },
      ]);
      (prisma.post.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'post-1',
          reviewDecision: PersistedReviewDecision.APPROVED,
        },
      ]);

      const result = await service.get('org-1', 'run-1');

      expect(result.phase).toBe('paid_draft_ready');
      expect(result.paidDraft).toMatchObject({ status: 'PAUSED' });
    });

    it('blocks same-destination retries while the Meta claim lease is active', async () => {
      const approved = await createApprovedPaidRun();
      let stored = makeRun({
        ...(approved.config as Record<string, unknown>),
        paidDraftOperation: {
          adAccountId: 'act-1',
          claimedAt: '2026-08-20T10:00:00.000Z',
          credentialId: 'credential-1',
          id: 'run-1:meta:1:variant-1',
          linkUrl: 'https://tiktok.example/@creator/video/1',
          variantId: 'variant-1',
        },
        phase: 'paid_draft_creating',
      });
      contentRun.findFirst.mockImplementation(() => Promise.resolve(stored));
      contentRun.updateMany.mockImplementation(({ data }) => {
        stored = makeRun(data.config as Record<string, unknown>);
        stored.status = (data.status ?? stored.status) as ContentRunStatus;
        return Promise.resolve({ count: 1 });
      });
      (
        prisma.ingredient.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        { id: 'image-1', status: IngredientStatus.GENERATED },
      ]);
      (prisma.post.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'post-1',
          reviewDecision: PersistedReviewDecision.APPROVED,
        },
      ]);
      (
        prisma.credential.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        grantedScopes: ['ads_management'],
        grantedScopesCapturedAt: new Date('2026-08-20T09:59:00.000Z'),
        id: 'credential-1',
      });

      const result = await service.preparePausedMetaDraft(
        'org-1',
        'run-1',
        'user-1',
        {
          destination: {
            adAccountId: 'act-1',
            credentialId: 'credential-1',
          },
          variantId: 'variant-1',
        },
      );

      expect(result.phase).toBe('paid_draft_creating');
      expect(pausedMetaCampaignDraftService.prepare).not.toHaveBeenCalled();
    });

    it('does not call Meta when the paid-draft claim loses its exact-config CAS', async () => {
      const created = await createApprovedPaidRun();
      created.status = ContentRunStatus.COMPLETED;
      contentRun.findFirst.mockResolvedValue(created);
      contentRun.updateMany.mockResolvedValue({ count: 0 });
      (
        prisma.ingredient.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        { id: 'image-1', status: IngredientStatus.GENERATED },
      ]);
      (prisma.post.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'post-1',
          reviewDecision: PersistedReviewDecision.APPROVED,
        },
      ]);
      (
        prisma.credential.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        grantedScopes: ['ads_management'],
        grantedScopesCapturedAt: new Date('2026-08-20T09:59:00.000Z'),
        id: 'credential-1',
      });

      await expect(
        service.preparePausedMetaDraft('org-1', 'run-1', 'user-1', {
          destination: {
            adAccountId: 'act-1',
            credentialId: 'credential-1',
          },
          variantId: 'variant-1',
        }),
      ).rejects.toThrow('concurrent Meta draft action');

      expect(contentRun.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            config: { equals: created.config },
          }),
        }),
      );
      expect(pausedMetaCampaignDraftService.prepare).not.toHaveBeenCalled();
    });

    it('does not call X Ads when the paid-draft claim loses its exact-config CAS', async () => {
      const created = await createApprovedPaidRun('x');
      created.status = ContentRunStatus.COMPLETED;
      contentRun.findFirst.mockResolvedValue(created);
      contentRun.updateMany.mockResolvedValue({ count: 0 });
      (
        prisma.ingredient.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        { id: 'image-1', status: IngredientStatus.GENERATED },
      ]);
      (prisma.post.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'post-1',
          reviewDecision: PersistedReviewDecision.APPROVED,
        },
      ]);
      (
        prisma.credential.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        grantedScopes: ['ads.read', 'ads.write'],
        grantedScopesCapturedAt: new Date('2026-08-20T09:59:00.000Z'),
        id: 'credential-1',
      });

      await expect(
        service.preparePausedMetaDraft('org-1', 'run-1', 'user-1', {
          destination: {
            adAccountId: 'act-1',
            credentialId: 'credential-1',
          },
          sourceTweetId: 'tweet-1',
          variantId: 'variant-1',
        }),
      ).rejects.toThrow('concurrent X Ads draft action');

      expect(contentRun.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            config: { equals: created.config },
          }),
        }),
      );
      expect(pausedXAdsCampaignDraftService.prepare).not.toHaveBeenCalled();
      expect(pausedMetaCampaignDraftService.prepare).not.toHaveBeenCalled();
    });

    it('rejects an explicit unknown paid-draft variant instead of falling back', async () => {
      const created = await createApprovedPaidRun();
      created.status = ContentRunStatus.COMPLETED;
      contentRun.findFirst.mockResolvedValue(created);
      (
        prisma.ingredient.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        { id: 'image-1', status: IngredientStatus.GENERATED },
      ]);
      (prisma.post.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'post-1',
          reviewDecision: PersistedReviewDecision.APPROVED,
        },
      ]);
      (
        prisma.credential.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        grantedScopes: ['ads_management'],
        grantedScopesCapturedAt: new Date('2026-08-20T09:59:00.000Z'),
        id: 'credential-1',
      });

      await expect(
        service.preparePausedMetaDraft('org-1', 'run-1', 'user-1', {
          destination: {
            adAccountId: 'act-1',
            credentialId: 'credential-1',
          },
          variantId: 'variant-missing',
        }),
      ).rejects.toThrow('does not exist');

      expect(pausedMetaCampaignDraftService.prepare).not.toHaveBeenCalled();
      expect(contentRun.updateMany).not.toHaveBeenCalled();
    });

    it('recovers a successful Meta result after a concurrent config write wins the first result CAS', async () => {
      const created = await createApprovedPaidRun();
      created.status = ContentRunStatus.COMPLETED;
      let stored = created;
      let interruptedResultWrite = false;
      contentRun.findFirst.mockImplementation(() => Promise.resolve(stored));
      contentRun.updateMany.mockImplementation(({ data, where }) => {
        const nextConfig = data.config as Record<string, unknown>;
        if (nextConfig.paidDraft !== undefined && !interruptedResultWrite) {
          interruptedResultWrite = true;
          stored = makeRun({
            ...(stored.config as Record<string, unknown>),
            readiness: {
              issues: [
                {
                  code: 'organization_defaults',
                  field: 'intent',
                  message: 'Brand-specific context is incomplete.',
                  severity: 'degraded',
                },
              ],
              state: 'degraded',
            },
          });
          stored.status = ContentRunStatus.RUNNING;
          return Promise.resolve({ count: 0 });
        }
        if (
          JSON.stringify(where.config.equals) !== JSON.stringify(stored.config)
        ) {
          return Promise.resolve({ count: 0 });
        }
        stored = makeRun(nextConfig);
        stored.status = (data.status ?? stored.status) as ContentRunStatus;
        return Promise.resolve({ count: 1 });
      });
      (
        prisma.ingredient.findMany as ReturnType<typeof vi.fn>
      ).mockResolvedValue([
        { id: 'image-1', status: IngredientStatus.GENERATED },
      ]);
      (prisma.post.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'post-1',
          reviewDecision: PersistedReviewDecision.APPROVED,
        },
      ]);
      (
        prisma.credential.findFirst as ReturnType<typeof vi.fn>
      ).mockResolvedValue({
        grantedScopes: ['ads_management'],
        grantedScopesCapturedAt: new Date('2026-08-20T09:59:00.000Z'),
        id: 'credential-1',
      });
      pausedMetaCampaignDraftService.prepare.mockResolvedValue({
        adAccountId: 'act-1',
        adId: 'ad-1',
        adSetId: 'ad-set-1',
        campaignId: 'campaign-1',
        credentialId: 'credential-1',
        ingredientId: 'image-1',
        postId: 'post-1',
        recipeRevision: 1,
        recipeVersion: 1,
        replayed: false,
        status: 'PAUSED',
        variantId: 'variant-1',
        workflowExecutionId: 'meta-workflow-execution-1',
        workflowId: 'meta-workflow-1',
      });

      const result = await service.preparePausedMetaDraft(
        'org-1',
        'run-1',
        'user-1',
        {
          destination: {
            adAccountId: 'act-1',
            credentialId: 'credential-1',
          },
          variantId: 'variant-1',
        },
      );

      expect(interruptedResultWrite).toBe(true);
      expect(pausedMetaCampaignDraftService.prepare).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        paidDraft: { adId: 'ad-1', status: 'PAUSED' },
        phase: 'paid_draft_ready',
        readiness: { state: 'degraded' },
      });
      expect(stored.config).toMatchObject({
        paidDraft: { adId: 'ad-1', status: 'PAUSED' },
        phase: 'paid_draft_ready',
        readiness: { state: 'degraded' },
      });
      expect(
        (stored.config as Record<string, unknown>).paidDraftOperation,
      ).toBeUndefined();
    });
  });

  async function createApprovedPaidRun(platform: 'meta' | 'x' = 'meta') {
    return createPersistedRun({
      draft: { target: { kind: 'paid', platform } },
      execution: {
        actualCount: 1,
        generationBrief: {
          constraints: [],
          fidelityMode: 'guided',
          intent: {
            objective: `Create an original ${platform === 'x' ? 'X' : 'Meta'} visual.`,
            requestedText: [],
            subjects: ['Acme'],
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
            assetIds: ['image-1'],
            id: 'variant-1',
            recipeRevision: 1,
            status: 'ready',
          },
        ],
      },
      phase: 'approved',
      review: {
        approvedPostIds: ['post-1'],
        batchId: 'batch-1',
        postIds: ['post-1'],
        workflowExecutionId: 'review-workflow-execution-1',
        workflowId: 'review-workflow-1',
      },
    });
  }

  function installExactConfigStore(initial: TestRun): () => TestRun {
    let stored = initial;
    contentRun.findFirst.mockImplementation(() => Promise.resolve(stored));
    contentRun.updateMany.mockImplementation(({ data, where }) => {
      const expectedConfig = (
        where as { config?: { equals?: unknown } } | undefined
      )?.config?.equals;
      if (
        expectedConfig !== undefined &&
        JSON.stringify(expectedConfig) !== JSON.stringify(stored.config)
      ) {
        return Promise.resolve({ count: 0 });
      }
      const next = makeRun(data.config as Record<string, unknown>);
      next.status = (data.status ?? stored.status) as ContentRunStatus;
      stored = next;
      return Promise.resolve({ count: 1 });
    });
    return () => stored;
  }

  async function createPersistedRun(
    overrides: {
      draft?: Record<string, unknown>;
      execution?: Record<string, unknown>;
      generationClaim?: Record<string, unknown>;
      phase?: string;
      review?: Record<string, unknown>;
    } = {},
  ) {
    contentRun.create.mockImplementation(({ data }) =>
      Promise.resolve(makeRun(data.config as Record<string, unknown>)),
    );
    const result = await service.create('org-1', 'brand-1', {
      source: { kind: 'source_post', sourcePostId: 'source-post-1' },
    });
    const config = contentRun.create.mock.calls[0]?.[0]?.data?.config as Record<
      string,
      unknown
    >;
    const run = makeRun(
      brandRemixRunConfigSchema.parse({
        ...config,
        ...(overrides.draft
          ? {
              draft: {
                ...(config.draft as Record<string, unknown>),
                ...overrides.draft,
              },
            }
          : {}),
        ...(overrides.execution ? { execution: overrides.execution } : {}),
        ...(overrides.generationClaim
          ? { generationClaim: overrides.generationClaim }
          : {}),
        ...(overrides.phase ? { phase: overrides.phase } : {}),
        ...(overrides.review ? { review: overrides.review } : {}),
      }),
    );
    expect(result.id).toBe('run-1');
    return run;
  }
});
