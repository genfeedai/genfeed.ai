import { BrandRemixRunPaidDraftService } from '@api/collections/content-runs/services/brand-remix-run-paid-draft.service';
import { assembleBrandRemixRunsGraph } from '@api/collections/content-runs/services/brand-remix-runs.factory';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { brandRemixRunConfigSchema } from '@api-types/contracts/brand-remix-run.contract';
import {
  ContentRunStatus,
  IngredientStatus,
  PersistedReviewDecision,
} from '@genfeedai/enums';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createdAt = new Date('2026-08-20T10:00:00.000Z');

describe('BrandRemixRunPaidDraftService', () => {
  const contentRun = {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  };
  const prisma = {
    contentRun,
    credential: { findFirst: vi.fn() },
    ingredient: { findMany: vi.fn() },
    post: { findMany: vi.fn() },
  } as unknown as PrismaService;
  const pausedMetaCampaignDraftService = { prepare: vi.fn() };
  const pausedXAdsCampaignDraftService = { prepare: vi.fn() };
  let paidDraft: BrandRemixRunPaidDraftService;

  beforeEach(() => {
    vi.resetAllMocks();
    const graph = assembleBrandRemixRunsGraph({
      adsResearchService: {} as never,
      avatarVideoGenerationService: {} as never,
      batchGenerationService: {} as never,
      brandsService: {
        findOne: vi.fn().mockResolvedValue({
          agentConfig: {},
          description: 'Operational content systems.',
          id: 'brand-1',
          isActive: true,
          label: 'Acme',
          organizationId: 'org-1',
          text: 'Turn content signals into campaigns.',
        }),
        resolveBrandKitAssets: vi.fn().mockResolvedValue({ references: [] }),
      } as never,
      byokService: {} as never,
      contentGeneratorService: {} as never,
      creditsUtilsService: {} as never,
      imageGenerationService: {} as never,
      organizationSettingsService: {
        findOne: vi.fn().mockResolvedValue({ organizationId: 'org-1' }),
      } as never,
      pausedMetaCampaignDraftService: pausedMetaCampaignDraftService as never,
      pausedXAdsCampaignDraftService: pausedXAdsCampaignDraftService as never,
      prisma,
      runtime: {
        now: () => new Date('2026-08-20T10:00:00.000Z'),
        randomId: () => 'unused',
      },
      systemWorkflowRunner: {} as never,
      trendReferenceCorpusService: {} as never,
      videoGenerationService: {} as never,
    });
    paidDraft = graph.paidDraft;
  });

  function approvedPaidConfig(platform: 'meta' | 'x') {
    return brandRemixRunConfigSchema.parse({
      contract: 'brand-remix-run',
      draft: {
        fidelityMode: 'guided',
        identity: {},
        intent: { objective: 'Create an original brand execution.' },
        output: { aspectRatio: '1:1', count: 1, kind: 'image' },
        references: [],
        reviewRequired: true,
        target: { kind: 'paid', platform },
      },
      execution: {
        actualCount: 1,
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
            assetIds: ['image-1'],
            id: 'variant-1',
            recipeRevision: 1,
            status: 'ready',
          },
        ],
      },
      phase: 'approved',
      readiness: { issues: [], state: 'ready' },
      recipeVersion: 1,
      revision: 1,
      review: {
        approvedPostIds: ['post-1'],
        batchId: 'batch-1',
        postIds: ['post-1'],
        workflowExecutionId: 'workflow-execution-1',
        workflowId: 'workflow-1',
      },
      sourceSnapshot: {
        capturedAt: '2026-08-20T10:00:00.000Z',
        canonicalUrl: 'https://meta.example/ad/1',
        destinationUrl: 'https://acme.example/offer',
        evidence: ['hook'],
        metrics: {},
        pattern: { hook: 'Outcome-led relevance hook.' },
        platform,
        selector: { adPerformanceId: 'ad-1', kind: 'public_ad' },
        sourceId: 'ad-1',
        title: 'hook',
      },
      version: 1,
    });
  }

  it('rejects an X Ads draft that is missing a source tweet before provider calls', async () => {
    contentRun.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      config: approvedPaidConfig('x'),
      createdAt,
      id: 'run-1',
      isDeleted: false,
      organizationId: 'org-1',
      status: ContentRunStatus.COMPLETED,
      updatedAt: createdAt,
    });
    (prisma.ingredient.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'image-1', status: IngredientStatus.GENERATED },
    ]);
    (prisma.post.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'post-1', reviewDecision: PersistedReviewDecision.APPROVED },
    ]);

    await expect(
      paidDraft.prepare('org-1', 'run-1', 'user-1', {
        destination: { adAccountId: 'act-1', credentialId: 'credential-1' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(pausedXAdsCampaignDraftService.prepare).not.toHaveBeenCalled();
  });

  it('does not call Meta when the paid-draft claim loses its exact-config CAS', async () => {
    contentRun.findFirst.mockResolvedValue({
      brandId: 'brand-1',
      config: approvedPaidConfig('meta'),
      createdAt,
      id: 'run-1',
      isDeleted: false,
      organizationId: 'org-1',
      status: ContentRunStatus.COMPLETED,
      updatedAt: createdAt,
    });
    (prisma.ingredient.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'image-1', status: IngredientStatus.GENERATED },
    ]);
    (prisma.post.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'post-1', reviewDecision: PersistedReviewDecision.APPROVED },
    ]);
    (prisma.credential.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(
      {
        grantedScopes: ['ads_management'],
        grantedScopesCapturedAt: new Date('2026-08-20T09:59:00.000Z'),
        id: 'credential-1',
      },
    );
    contentRun.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      paidDraft.prepare('org-1', 'run-1', 'user-1', {
        destination: { adAccountId: 'act-1', credentialId: 'credential-1' },
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(pausedMetaCampaignDraftService.prepare).not.toHaveBeenCalled();
    expect(prisma.credential.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          brandId: 'brand-1',
          isDeleted: false,
          organizationId: 'org-1',
        }),
      }),
    );
  });
});
