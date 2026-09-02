import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandRemixRunExecutionService } from '@api/collections/content-runs/services/brand-remix-run-execution.service';
import { assembleBrandRemixRunsGraph } from '@api/collections/content-runs/services/brand-remix-runs.factory';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { brandRemixRunConfigSchema } from '@api-types/contracts/brand-remix-run.contract';
import { ContentRunStatus } from '@genfeedai/enums';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createdAt = new Date('2026-08-20T10:00:00.000Z');

describe('BrandRemixRunExecutionService', () => {
  const contentRun = {
    create: vi.fn(),
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  };
  const prisma = {
    $transaction: vi.fn(),
    asset: { findMany: vi.fn() },
    contentRun,
    ingredient: { findMany: vi.fn(), updateMany: vi.fn() },
    sourcePost: { findFirst: vi.fn() },
  } as unknown as PrismaService;
  const imageGenerationService = { generateImage: vi.fn() };
  const brandsService = {
    findOne: vi.fn(),
    resolveBrandKitAssets: vi.fn(),
  };
  const byokService = {
    isByokActiveForProvider: vi.fn(),
    isByokBillingInGoodStanding: vi.fn(),
  };
  const runtime = {
    now: () => new Date('2026-08-20T10:00:00.000Z'),
    randomId: vi.fn(() => 'variant-1'),
  };
  let execution: BrandRemixRunExecutionService;

  beforeEach(() => {
    vi.resetAllMocks();
    runtime.randomId.mockReturnValue('variant-1');
    (prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
      (
        operation: (transaction: { contentRun: typeof contentRun }) => unknown,
      ) => operation({ contentRun }),
    );
    brandsService.findOne.mockResolvedValue({
      agentConfig: {},
      description: 'Operational content systems.',
      id: 'brand-1',
      isActive: true,
      label: 'Acme',
      organizationId: 'org-1',
      text: 'Turn content signals into campaigns.',
    });
    brandsService.resolveBrandKitAssets.mockResolvedValue({ references: [] });
    (prisma.asset.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.ingredient.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(
      [],
    );
    (
      prisma.ingredient.updateMany as ReturnType<typeof vi.fn>
    ).mockResolvedValue({ count: 1 });
    byokService.isByokActiveForProvider.mockResolvedValue(false);
    byokService.isByokBillingInGoodStanding.mockResolvedValue(true);
    const graph = assembleBrandRemixRunsGraph({
      adsResearchService: {} as never,
      avatarVideoGenerationService: {} as never,
      batchGenerationService: {} as never,
      brandsService: brandsService as never,
      byokService: byokService as never,
      contentGeneratorService: {} as never,
      creditsUtilsService: {
        checkOrganizationCreditsAvailable: vi.fn().mockResolvedValue(true),
        getOrganizationCreditsBalance: vi.fn().mockResolvedValue(100),
      } as never,
      imageGenerationService: imageGenerationService as never,
      organizationSettingsService: {
        findOne: vi.fn().mockResolvedValue({ organizationId: 'org-1' }),
      } as never,
      pausedMetaCampaignDraftService: { prepare: vi.fn() } as never,
      pausedXAdsCampaignDraftService: { prepare: vi.fn() } as never,
      prisma,
      runtime,
      systemWorkflowRunner: {} as never,
      trendReferenceCorpusService: {} as never,
      videoGenerationService: {} as never,
    });
    execution = graph.execution;
  });

  it('returns the live claim without redispatching while the generation lease is active', async () => {
    const config = brandRemixRunConfigSchema.parse({
      contract: 'brand-remix-run',
      draft: {
        fidelityMode: 'guided',
        identity: {},
        intent: { objective: 'Create an original brand execution.' },
        output: { aspectRatio: '1:1', count: 1, kind: 'image' },
        references: [],
        reviewRequired: true,
        target: { kind: 'organic', platform: 'instagram' },
      },
      execution: {
        actualCount: 0,
        generationBrief: {
          constraints: [],
          fidelityMode: 'guided',
          intent: {
            objective: 'Create an original brand execution.',
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
            assetIds: [],
            id: 'variant-1',
            recipeRevision: 1,
            status: 'queued',
          },
        ],
      },
      generationClaim: {
        claimedAt: '2026-08-20T10:00:00.000Z',
        id: 'run-1:generate:1',
        variantIds: ['variant-1'],
      },
      phase: 'generating',
      readiness: { issues: [], state: 'ready' },
      recipeVersion: 1,
      revision: 1,
      sourceSnapshot: {
        capturedAt: '2026-08-20T10:00:00.000Z',
        evidence: ['hook'],
        metrics: {},
        pattern: { hook: 'Outcome-led relevance hook.' },
        platform: 'instagram',
        selector: { kind: 'source_post', sourcePostId: 'source-post-1' },
        sourceId: 'source-post-1',
        title: 'hook',
      },
      version: 1,
    });
    contentRun.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      config,
      createdAt,
      id: 'run-1',
      isDeleted: false,
      organizationId: 'org-1',
      status: ContentRunStatus.RUNNING,
      updatedAt: createdAt,
    });
    (prisma.sourcePost.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      {
        authorHandle: 'creator',
        contentType: 'image',
        id: 'source-post-1',
        mediaUrls: [],
        metrics: {},
        platform: 'instagram',
        sourceUrl: 'https://instagram.example/p/1',
        text: 'Show the outcome first.',
      },
    );

    const result = await execution.start(
      'org-1',
      'run-1',
      {
        brandId: 'brand-1',
        id: 'user-1',
        organizationId: 'org-1',
        userId: 'user-1',
      } as AuthenticatedUser,
      { creditsConfig: { amount: 0, deferred: true } } as unknown as Request,
      { expectedRevision: 1 },
    );

    expect(result.generationClaim?.id).toBe('run-1:generate:1');
    expect(imageGenerationService.generateImage).not.toHaveBeenCalled();
    expect(contentRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-1', isDeleted: false, organizationId: 'org-1' },
      }),
    );
  });
});
