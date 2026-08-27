import { BrandRemixRunReviewService } from '@api/collections/content-runs/services/brand-remix-run-review.service';
import { assembleBrandRemixRunsGraph } from '@api/collections/content-runs/services/brand-remix-runs.factory';
import type { PrismaService } from '@server/shared/modules/prisma/prisma.service';
import { brandRemixRunConfigSchema } from '@api-types/contracts/brand-remix-run.contract';
import { ContentRunStatus, IngredientStatus } from '@genfeedai/enums';
import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createdAt = new Date('2026-08-20T10:00:00.000Z');

describe('BrandRemixRunReviewService', () => {
  const contentRun = {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  };
  const prisma = {
    contentRun,
    ingredient: { findMany: vi.fn() },
    post: { findMany: vi.fn() },
  } as unknown as PrismaService;
  const batchGenerationService = { createManualReviewBatch: vi.fn() };
  const systemWorkflowProvenanceService = { runAction: vi.fn() };
  let review: BrandRemixRunReviewService;

  beforeEach(() => {
    vi.resetAllMocks();
    systemWorkflowProvenanceService.runAction.mockImplementation(
      async (_input, action) => {
        const provenance = {
          executionId: 'workflow-execution-1',
          workflowId: 'workflow-1',
          workflowLabel: 'Brand Remix Review Handoff',
        };
        return { provenance, result: await action(provenance) };
      },
    );
    const graph = assembleBrandRemixRunsGraph({
      adsResearchService: {} as never,
      avatarVideoGenerationService: {} as never,
      batchGenerationService: batchGenerationService as never,
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
      pausedMetaCampaignDraftService: {} as never,
      pausedXAdsCampaignDraftService: {} as never,
      prisma,
      runtime: {
        now: () => new Date('2026-08-20T10:00:00.000Z'),
        randomId: () => 'unused',
      },
      systemWorkflowProvenanceService: systemWorkflowProvenanceService as never,
      trendReferenceCorpusService: {
        recordPostRemixLineage: vi.fn(),
      } as never,
      videoGenerationService: {} as never,
    });
    review = graph.review;
  });

  it('rejects a lost review compare-and-swap before creating side effects', async () => {
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
      phase: 'ready_for_review',
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
      status: ContentRunStatus.COMPLETED,
      updatedAt: createdAt,
    });
    (prisma.ingredient.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'image-1', status: IngredientStatus.GENERATED },
    ]);
    contentRun.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      review.submit('org-1', 'run-1', 'user-1', {}),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(
      batchGenerationService.createManualReviewBatch,
    ).not.toHaveBeenCalled();
    expect(prisma.ingredient.findMany).toHaveBeenCalledWith(
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
