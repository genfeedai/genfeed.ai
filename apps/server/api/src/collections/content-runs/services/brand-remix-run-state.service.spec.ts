import { BrandRemixRunPersistenceService } from '@api/collections/content-runs/services/brand-remix-run-persistence.service';
import { BrandRemixRunStateService } from '@api/collections/content-runs/services/brand-remix-run-state.service';
import type { BrandRemixRunRecord } from '@api/collections/content-runs/services/brand-remix-runs.types';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { brandRemixRunConfigSchema } from '@api-types/contracts/brand-remix-run.contract';
import {
  ContentRunStatus,
  IngredientStatus,
  PersistedReviewDecision,
} from '@genfeedai/enums';
import { ConflictException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createdAt = new Date('2026-08-20T10:00:00.000Z');

function makeGeneratingConfig() {
  return brandRemixRunConfigSchema.parse({
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
          assetIds: ['image-1'],
          id: 'variant-1',
          recipeRevision: 1,
          status: 'processing',
        },
      ],
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
}

describe('BrandRemixRunStateService', () => {
  const contentRun = {
    findFirst: vi.fn(),
    updateMany: vi.fn(),
  };
  const prisma = {
    contentRun,
    ingredient: { findMany: vi.fn() },
    post: { findMany: vi.fn() },
  } as unknown as PrismaService;
  let persistence: BrandRemixRunPersistenceService;
  let state: BrandRemixRunStateService;

  beforeEach(() => {
    vi.resetAllMocks();
    persistence = new BrandRemixRunPersistenceService(prisma);
    state = new BrandRemixRunStateService(prisma, persistence);
  });

  it('transitions processing variants to ready when tenant-owned ingredients complete', async () => {
    const config = makeGeneratingConfig();
    const run = {
      brandId: 'brand-1',
      config,
      createdAt,
      id: 'run-1',
      isDeleted: false,
      organizationId: 'org-1',
      status: ContentRunStatus.RUNNING,
      updatedAt: createdAt,
    } as BrandRemixRunRecord;
    (prisma.ingredient.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'image-1', status: IngredientStatus.GENERATED },
    ]);
    contentRun.updateMany.mockResolvedValue({ count: 1 });
    contentRun.findFirst.mockResolvedValue({
      ...run,
      status: ContentRunStatus.COMPLETED,
    });

    const reconciled = await state.reconcile(run);

    expect(prisma.ingredient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          brandId: 'brand-1',
          id: { in: ['image-1'] },
          isDeleted: false,
          organizationId: 'org-1',
        },
      }),
    );
    expect(reconciled.config.phase).toBe('ready_for_review');
    expect(reconciled.config.execution?.variants[0]?.status).toBe('ready');
  });

  it('retries reconciliation after a lost compare-and-swap', async () => {
    const config = makeGeneratingConfig();
    const run = {
      brandId: 'brand-1',
      config,
      createdAt,
      id: 'run-1',
      isDeleted: false,
      organizationId: 'org-1',
      status: ContentRunStatus.RUNNING,
      updatedAt: createdAt,
    } as BrandRemixRunRecord;
    (prisma.ingredient.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'image-1', status: IngredientStatus.GENERATED },
    ]);
    contentRun.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    contentRun.findFirst
      .mockResolvedValueOnce(run)
      .mockResolvedValueOnce({ ...run, status: ContentRunStatus.COMPLETED });

    const reconciled = await state.reconcile(run);

    expect(contentRun.updateMany).toHaveBeenCalledTimes(2);
    expect(reconciled.config.phase).toBe('ready_for_review');
  });

  it('keeps paid_draft_ready when approved review posts reconcile', async () => {
    const config = brandRemixRunConfigSchema.parse({
      ...makeGeneratingConfig(),
      execution: {
        ...makeGeneratingConfig().execution,
        actualCount: 1,
        variants: [
          {
            assetIds: ['image-1'],
            id: 'variant-1',
            recipeRevision: 1,
            status: 'ready',
          },
        ],
      },
      phase: 'paid_draft_ready',
      review: {
        approvedPostIds: ['post-1'],
        batchId: 'batch-1',
        postIds: ['post-1'],
        workflowExecutionId: 'workflow-execution-1',
        workflowId: 'workflow-1',
      },
    });
    const run = {
      brandId: 'brand-1',
      config,
      createdAt,
      id: 'run-1',
      isDeleted: false,
      organizationId: 'org-1',
      status: ContentRunStatus.COMPLETED,
      updatedAt: createdAt,
    } as BrandRemixRunRecord;
    (prisma.ingredient.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'image-1', status: IngredientStatus.GENERATED },
    ]);
    (prisma.post.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'post-1', reviewDecision: PersistedReviewDecision.APPROVED },
    ]);

    const reconciled = await state.reconcile(run);

    expect(prisma.post.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          brandId: 'brand-1',
          id: { in: ['post-1'] },
          isDeleted: false,
          organizationId: 'org-1',
        },
      }),
    );
    expect(reconciled.config.phase).toBe('paid_draft_ready');
    expect(contentRun.updateMany).not.toHaveBeenCalled();
  });

  it('fails closed after repeated variant-patch conflicts', async () => {
    const config = makeGeneratingConfig();
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
    contentRun.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      state.patchGeneratingVariant({
        organizationId: 'org-1',
        patch: { status: 'ready' },
        recipeRevision: 1,
        runId: 'run-1',
        status: ContentRunStatus.RUNNING,
        variantId: 'variant-1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(contentRun.updateMany).toHaveBeenCalledTimes(16);
  });
});
