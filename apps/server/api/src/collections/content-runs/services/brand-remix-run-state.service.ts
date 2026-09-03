import { BrandRemixRunPersistenceService } from '@api/collections/content-runs/services/brand-remix-run-persistence.service';
import { projectBrandRemixRun } from '@api/collections/content-runs/services/brand-remix-run-projection';
import {
  type BrandRemixRunRecord,
  GENERATION_READY_STATUSES,
  MAX_SERIALIZATION_RETRIES,
  MAX_VARIANT_PATCH_RETRIES,
  type ReconciledBrandRemixRun,
  type ResolvedBrandContext,
} from '@api/collections/content-runs/services/brand-remix-runs.types';
import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ContentRunStatus,
  IngredientStatus,
  PersistedReviewDecision,
} from '@genfeedai/contracts';
import {
  type BrandRemixExecution,
  type BrandRemixRunConfig,
  type BrandRemixRunView,
  brandRemixRunConfigSchema,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import { ConflictException, Injectable } from '@nestjs/common';

@Injectable()
export class BrandRemixRunStateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly persistence: BrandRemixRunPersistenceService,
  ) {}

  async reconcile(
    run: BrandRemixRunRecord,
    attempt = 0,
  ): Promise<ReconciledBrandRemixRun> {
    const originalConfig = this.persistence.parseConfig(run.config, run.id);
    const executionReconciled = await this.reconcileExecution(
      run,
      originalConfig,
    );
    const { changed, config, status } = await this.reconcileReview(
      run,
      executionReconciled.config,
      executionReconciled.status,
      executionReconciled.changed,
    );

    if (!changed && run.status === status) return { config, run };
    const updated = await this.persistence.compareAndSwapExactConfig({
      expectedConfig: originalConfig,
      nextConfig: config,
      organizationId: run.organizationId,
      runId: run.id,
      status,
    });
    if (updated) return { config, run: updated };
    if (attempt >= MAX_SERIALIZATION_RETRIES - 1) {
      throw new ConflictException({
        detail:
          'The remix changed repeatedly while generation state was being reconciled. Reload it and retry.',
        title: 'Remix reconciliation conflict',
      });
    }
    return this.reconcile(
      await this.persistence.requireRun(run.organizationId, run.id),
      attempt + 1,
    );
  }

  updateVariant(
    config: BrandRemixRunConfig,
    variantId: string,
    patch: Partial<BrandRemixExecution['variants'][number]>,
  ): BrandRemixRunConfig {
    if (!config.execution) return config;
    return brandRemixRunConfigSchema.parse({
      ...config,
      execution: {
        ...config.execution,
        variants: config.execution.variants.map((variant) =>
          variant.id === variantId ? { ...variant, ...patch } : variant,
        ),
      },
    });
  }

  async patchGeneratingVariant(params: {
    organizationId: string;
    patch: Partial<BrandRemixExecution['variants'][number]>;
    recipeRevision: number;
    runId: string;
    status: ContentRunStatus;
    variantId: string;
  }): Promise<BrandRemixRunConfig> {
    for (let attempt = 0; attempt < MAX_VARIANT_PATCH_RETRIES; attempt += 1) {
      const run = await this.persistence.requireRun(
        params.organizationId,
        params.runId,
      );
      const current = this.persistence.parseConfig(run.config, run.id);
      const variant = current.execution?.variants.find(
        (candidate) => candidate.id === params.variantId,
      );
      if (!variant || variant.recipeRevision !== params.recipeRevision) {
        throw new ConflictException({
          detail:
            'The target remix variant no longer belongs to this recipe revision.',
          title: 'Stale remix variant',
        });
      }
      const next = this.updateVariant(current, params.variantId, params.patch);
      const updated = await this.persistence.compareAndSwapExactConfig({
        expectedConfig: current,
        nextConfig: next,
        organizationId: params.organizationId,
        runId: params.runId,
        status: params.status,
      });
      if (updated)
        return this.persistence.parseConfig(updated.config, updated.id);
    }

    throw new ConflictException({
      detail:
        'The remix changed repeatedly while its generation placeholder was being linked.',
      title: 'Remix placeholder linkage conflict',
    });
  }

  async clearGenerationClaimAndProject(params: {
    brandContext: ResolvedBrandContext;
    config: BrandRemixRunConfig;
    organizationId: string;
    run: BrandRemixRunRecord;
    runId: string;
  }): Promise<BrandRemixRunView> {
    if (!params.config.generationClaim) {
      return projectBrandRemixRun(
        params.run,
        params.brandContext,
        params.config,
      );
    }
    const nextConfig = brandRemixRunConfigSchema.parse({
      ...params.config,
      generationClaim: undefined,
    });
    const updated = await this.persistence.compareAndSwapExactConfig({
      expectedConfig: params.config,
      nextConfig,
      organizationId: params.organizationId,
      runId: params.runId,
      status:
        params.run.status === ContentRunStatus.FAILED
          ? ContentRunStatus.FAILED
          : params.run.status === ContentRunStatus.COMPLETED
            ? ContentRunStatus.COMPLETED
            : ContentRunStatus.RUNNING,
    });
    if (!updated) {
      const latest = await this.persistence.requireRun(
        params.organizationId,
        params.runId,
      );
      return projectBrandRemixRun(
        latest,
        params.brandContext,
        this.persistence.parseConfig(latest.config, latest.id),
      );
    }
    return projectBrandRemixRun(updated, params.brandContext, nextConfig);
  }

  private async reconcileExecution(
    run: BrandRemixRunRecord,
    config: BrandRemixRunConfig,
  ): Promise<{
    changed: boolean;
    config: BrandRemixRunConfig;
    status: ContentRunStatus;
  }> {
    let status =
      (run.status as ContentRunStatus | null) ?? ContentRunStatus.PENDING;
    if (!config.execution) {
      return { changed: false, config, status };
    }
    const assetIds = [
      ...new Set(
        config.execution.variants.flatMap((variant) => variant.assetIds),
      ),
    ];
    const ingredients = assetIds.length
      ? await this.prisma.ingredient.findMany({
          select: { id: true, status: true },
          where: scopedWhere(run.organizationId, {
            brandId: this.persistence.requireBrandId(run),
            id: { in: assetIds },
          }),
        })
      : [];
    const ingredientStatus = new Map(
      ingredients.map((ingredient) => [
        ingredient.id,
        String(ingredient.status),
      ]),
    );
    let changed = false;
    const variants = config.execution.variants.map((variant) => {
      if (variant.status === 'failed' || variant.assetIds.length === 0) {
        return variant;
      }
      const statuses = variant.assetIds.map((id) => ingredientStatus.get(id));
      const nextStatus = statuses.some(
        (ingredientState) => ingredientState === IngredientStatus.FAILED,
      )
        ? 'failed'
        : statuses.length > 0 &&
            statuses.every(
              (ingredientState) =>
                ingredientState !== undefined &&
                GENERATION_READY_STATUSES.has(ingredientState),
            )
          ? 'ready'
          : 'processing';
      changed ||= nextStatus !== variant.status;
      return { ...variant, status: nextStatus };
    });
    const actualCount = variants.filter(
      (variant) => variant.status === 'ready',
    ).length;
    const activeCount = variants.filter(
      (variant) =>
        variant.status === 'processing' || variant.status === 'queued',
    ).length;
    const failedCount = variants.filter(
      (variant) => variant.status === 'failed',
    ).length;
    let phase = config.phase;
    if (!config.review) {
      phase = activeCount
        ? actualCount
          ? 'partially_ready'
          : 'generating'
        : actualCount === variants.length
          ? 'ready_for_review'
          : actualCount
            ? 'partially_ready'
            : failedCount === variants.length
              ? 'failed'
              : phase;
    }
    status =
      phase === 'failed'
        ? ContentRunStatus.FAILED
        : phase === 'ready_for_review' ||
            phase === 'in_review' ||
            phase === 'approved' ||
            phase === 'paid_draft_ready'
          ? ContentRunStatus.COMPLETED
          : ContentRunStatus.RUNNING;
    const copyPartialReason =
      config.draft.output.kind === 'copy'
        ? actualCount < config.execution.requestedCount
          ? `${config.execution.requestedCount - actualCount} requested copy outputs were not distinct and usable.`
          : undefined
        : config.execution.partialReason;
    changed ||=
      actualCount !== config.execution.actualCount ||
      phase !== config.phase ||
      copyPartialReason !== config.execution.partialReason;
    return {
      changed,
      config: brandRemixRunConfigSchema.parse({
        ...config,
        execution: {
          ...config.execution,
          actualCount,
          partialReason: copyPartialReason,
          variants,
        },
        phase,
      }),
      status,
    };
  }

  private async reconcileReview(
    run: BrandRemixRunRecord,
    config: BrandRemixRunConfig,
    status: ContentRunStatus,
    changed: boolean,
  ): Promise<{
    changed: boolean;
    config: BrandRemixRunConfig;
    status: ContentRunStatus;
  }> {
    if (!config.review?.postIds.length) {
      return { changed, config, status };
    }
    const posts = await this.prisma.post.findMany({
      select: { id: true, reviewDecision: true },
      where: scopedWhere(run.organizationId, {
        brandId: this.persistence.requireBrandId(run),
        id: { in: config.review.postIds },
      }),
    });
    const approvedPostIds = posts
      .filter(
        (post) => post.reviewDecision === PersistedReviewDecision.APPROVED,
      )
      .map((post) => post.id);
    const approved =
      posts.length === config.review.postIds.length &&
      approvedPostIds.length === posts.length;
    const preservesPaidDraftPhase =
      config.phase === 'paid_draft_creating' ||
      config.phase === 'paid_draft_ready';
    const phase =
      approved && !preservesPaidDraftPhase ? 'approved' : config.phase;
    const nextChanged =
      changed ||
      approvedPostIds.length !== config.review.approvedPostIds.length ||
      phase !== config.phase;
    const nextStatus =
      approved && phase !== 'paid_draft_creating'
        ? ContentRunStatus.COMPLETED
        : status;
    return {
      changed: nextChanged,
      config: brandRemixRunConfigSchema.parse({
        ...config,
        phase,
        review: { ...config.review, approvedPostIds },
      }),
      status: nextStatus,
    };
  }
}
