import { BrandRemixRunPersistenceService } from '@api/collections/content-runs/services/brand-remix-run-persistence.service';
import { BrandRemixRunPlanningService } from '@api/collections/content-runs/services/brand-remix-run-planning.service';
import { projectBrandRemixRun } from '@api/collections/content-runs/services/brand-remix-run-projection';
import { BrandRemixRunStateService } from '@api/collections/content-runs/services/brand-remix-run-state.service';
import {
  type BrandRemixRunRecord,
  REVIEW_CLAIM_LEASE_MS,
  type ResolvedBrandContext,
} from '@api/collections/content-runs/services/brand-remix-runs.types';
import {
  BRAND_REMIX_RUNTIME,
  type BrandRemixRuntime,
} from '@api/collections/content-runs/services/brand-remix-runtime';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import {
  SYSTEM_WORKFLOW_ACTION_IDS,
  SystemWorkflowProvenanceService,
} from '@api/collections/workflows/services/system-workflow-provenance.service';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import type { ReviewBatchItemFormat } from '@api/services/batch-generation/constants/review-batch-item-format.constant';
import {
  BRAND_REMIX_RUN_CONTRACT,
  type BrandRemixExecution,
  type BrandRemixRunConfig,
  type BrandRemixRunView,
  brandRemixRunConfigSchema,
  type SubmitBrandRemixRunForReview,
} from '@api-types/contracts/brand-remix-run.contract';
import {
  ContentFormat,
  ContentRunStatus,
  WorkflowExecutionTrigger,
} from '@genfeedai/enums';
import { ConflictException, Inject, Injectable } from '@nestjs/common';

@Injectable()
export class BrandRemixRunReviewService {
  constructor(
    private readonly planning: BrandRemixRunPlanningService,
    private readonly persistence: BrandRemixRunPersistenceService,
    private readonly state: BrandRemixRunStateService,
    private readonly batchGenerationService: BatchGenerationService,
    private readonly trendReferenceCorpusService: TrendReferenceCorpusService,
    private readonly systemWorkflowProvenanceService: SystemWorkflowProvenanceService,
    @Inject(BRAND_REMIX_RUNTIME)
    private readonly runtime: BrandRemixRuntime,
  ) {}

  async submit(
    organizationId: string,
    runId: string,
    userId: string,
    input: SubmitBrandRemixRunForReview,
  ): Promise<BrandRemixRunView> {
    const prepared = await this.prepareReview(organizationId, runId, input);
    if (prepared.view) return prepared.view;
    const claimed = await this.claimReview(prepared);
    const completed = await this.createReviewHandoff({
      ...prepared,
      claimedConfig: claimed.config,
      claimedRun: claimed.run,
      userId,
    });
    return this.completeReview({
      ...prepared,
      claimedConfig: claimed.config,
      completed,
    });
  }

  private async prepareReview(
    organizationId: string,
    runId: string,
    input: SubmitBrandRemixRunForReview,
  ): Promise<{
    brandContext: ResolvedBrandContext;
    brandId: string;
    config: BrandRemixRunConfig;
    organizationId: string;
    run: BrandRemixRunRecord;
    runId: string;
    selected: BrandRemixExecution['variants'];
    selectedAssetIds: string[];
    view?: BrandRemixRunView;
  }> {
    const initial = await this.persistence.requireRun(organizationId, runId);
    const reconciled = await this.state.reconcile(initial);
    const run = reconciled.run;
    const config = reconciled.config;
    const brandId = this.persistence.requireBrandId(run);
    const brandContext = await this.planning.resolveBrandContext(
      organizationId,
      brandId,
    );

    if (config.review) {
      return {
        brandContext,
        brandId,
        config,
        organizationId,
        run,
        runId,
        selected: [],
        selectedAssetIds: [],
        view: projectBrandRemixRun(run, brandContext, config),
      };
    }
    if (!config.execution) {
      throw new ConflictException({
        detail: 'Generate remix variants before submitting them to Review.',
        title: 'No generated remix variants',
      });
    }

    const requestedIds = input.variantIds
      ? new Set(input.variantIds)
      : undefined;
    const selected = config.execution.variants.filter((variant) =>
      requestedIds ? requestedIds.has(variant.id) : variant.status === 'ready',
    );
    if (
      selected.length === 0 ||
      selected.some(
        (variant) =>
          variant.status !== 'ready' ||
          (config.draft.output.kind !== 'copy' &&
            variant.assetIds.length === 0),
      ) ||
      (requestedIds && selected.length !== requestedIds.size)
    ) {
      throw new ConflictException({
        detail:
          'Every selected remix variant must be ready and owned by this brand.',
        title: 'Review handoff is not ready',
      });
    }

    const selectedAssetIds = selected.flatMap((variant) => variant.assetIds);
    await this.planning.assertGeneratedAssetsAuthorized(
      organizationId,
      brandId,
      selectedAssetIds,
    );
    return {
      brandContext,
      brandId,
      config,
      organizationId,
      run,
      runId,
      selected,
      selectedAssetIds,
    };
  }

  private async claimReview(params: {
    brandContext: ResolvedBrandContext;
    config: BrandRemixRunConfig;
    organizationId: string;
    run: BrandRemixRunRecord;
    runId: string;
    selected: BrandRemixExecution['variants'];
  }): Promise<{ config: BrandRemixRunConfig; run: BrandRemixRunRecord }> {
    if (params.config.reviewClaim) {
      const claimedIds = [
        ...params.config.reviewClaim.selectedVariantIds,
      ].sort();
      const requestedVariantIds = params.selected
        .map((variant) => variant.id)
        .sort();
      if (claimedIds.join(':') !== requestedVariantIds.join(':')) {
        throw new ConflictException({
          detail:
            'Resume the variants already claimed by the interrupted Review handoff.',
          title: 'Review variants already claimed',
        });
      }
      const claimAge =
        this.runtime.now().getTime() -
        new Date(params.config.reviewClaim.claimedAt).getTime();
      if (claimAge < REVIEW_CLAIM_LEASE_MS) {
        throw new ConflictException({
          detail:
            'A concurrent review submission already claimed this remix. Reload it and retry.',
          title: 'Concurrent review submission',
        });
      }
    }
    const claimedConfig = brandRemixRunConfigSchema.parse({
      ...params.config,
      reviewClaim: {
        claimedAt: this.runtime.now().toISOString(),
        id: `${params.run.id}:review:${params.config.revision}`,
        selectedVariantIds: params.selected.map((variant) => variant.id),
        status: 'claimed',
      },
    });
    const claimed = await this.persistence.compareAndSwapExactConfig({
      expectedConfig: params.config,
      nextConfig: claimedConfig,
      organizationId: params.organizationId,
      runId: params.runId,
      status: ContentRunStatus.COMPLETED,
    });
    if (!claimed) {
      throw new ConflictException({
        detail:
          'A concurrent review submission already claimed this remix. Reload it and retry.',
        title: 'Concurrent review submission',
      });
    }
    return { config: claimedConfig, run: claimed };
  }

  private async createReviewHandoff(params: {
    brandContext: ResolvedBrandContext;
    brandId: string;
    claimedConfig: BrandRemixRunConfig;
    claimedRun: BrandRemixRunRecord;
    config: BrandRemixRunConfig;
    organizationId: string;
    run: BrandRemixRunRecord;
    selected: BrandRemixExecution['variants'];
    userId: string;
  }): Promise<{
    batchId: string;
    postIds: string[];
    workflowExecutionId: string;
    workflowId: string;
  }> {
    const format: ReviewBatchItemFormat =
      params.config.draft.output.kind === 'copy'
        ? 'post'
        : params.config.draft.output.kind === 'image'
          ? ContentFormat.IMAGE
          : ContentFormat.VIDEO;
    const platform = params.config.draft.target.platform;
    const selectedKey = params.selected
      .map((variant) => variant.id)
      .sort()
      .join(':');
    const workflow = await this.systemWorkflowProvenanceService.runAction(
      {
        actionType: 'brand-remix-review-handoff',
        canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.BRAND_REMIX_REVIEW_HANDOFF,
        description:
          'Creates canonical draft Posts for selected brand remix variants and routes them to mandatory Review.',
        inputValues: {
          contentRunId: params.run.id,
          recipeRevision: params.config.revision,
          selectedVariantIds: params.selected.map((variant) => variant.id),
        },
        label: 'Brand Remix Review Handoff',
        organizationId: params.organizationId,
        source: 'BrandRemixRunsService.submitForReview',
        trigger: WorkflowExecutionTrigger.MANUAL,
        userId: params.userId,
      },
      async (provenance) => {
        const items = params.selected.flatMap((variant) => {
          const ingredientIds =
            params.config.draft.output.kind === 'copy'
              ? [undefined]
              : variant.assetIds;
          return ingredientIds.map((ingredientId) => ({
            caption: variant.content ?? params.config.draft.intent.objective,
            contentRunId: params.run.id,
            creativeVersion: `recipe-${params.config.revision}`,
            format,
            ...(ingredientId ? { ingredientId } : {}),
            label: `${params.brandContext.brand.label} remix ${variant.id}`,
            platform,
            prompt: params.config.execution?.generationBrief.intent.objective,
            publishIntent:
              params.config.draft.target.kind === 'paid' ? 'campaign' : 'test',
            sourceActionId: params.config.sourceSnapshot.sourceId,
            sourceWorkflowId: provenance.workflowId,
            sourceWorkflowName: provenance.workflowLabel,
            targetIdempotencyKey: `brand-remix:${params.run.id}:${params.config.revision}:${variant.id}:${ingredientId ?? 'copy'}`,
            variantId: variant.id,
            workflowExecutionId: provenance.executionId,
          }));
        });
        const batch = await this.batchGenerationService.createManualReviewBatch(
          { brandId: params.brandId, items },
          params.userId,
          params.organizationId,
          `brand-remix:${params.run.id}:review:${params.config.revision}:${selectedKey}`,
        );
        return { batch, itemCount: items.length };
      },
    );
    const { batch, itemCount } = workflow.result;
    const postIds = batch.items.flatMap((item) =>
      item.postId ? [item.postId] : [],
    );
    if (postIds.length !== itemCount) {
      throw new ConflictException({
        detail:
          'Review did not create a canonical draft for every remix asset.',
        title: 'Review handoff incomplete',
      });
    }
    const selector = params.config.sourceSnapshot.selector;
    if (selector.kind === 'trend_reference') {
      await Promise.all(
        postIds.map((postId) =>
          this.trendReferenceCorpusService.recordPostRemixLineage({
            brandId: params.brandId,
            generatedBy: BRAND_REMIX_RUN_CONTRACT,
            metadata: {
              sourceReferenceId: selector.sourceReferenceId,
              trendId: selector.trendId,
            },
            organizationId: params.organizationId,
            platforms: [platform],
            postId,
            prompt: params.config.execution?.generationBrief.intent.objective,
          }),
        ),
      );
    }
    return {
      batchId: batch.id,
      postIds,
      workflowExecutionId: workflow.provenance.executionId,
      workflowId: workflow.provenance.workflowId,
    };
  }

  private async completeReview(params: {
    brandContext: ResolvedBrandContext;
    claimedConfig: BrandRemixRunConfig;
    completed: {
      batchId: string;
      postIds: string[];
      workflowExecutionId: string;
      workflowId: string;
    };
    organizationId: string;
    runId: string;
  }): Promise<BrandRemixRunView> {
    const completedReviewClaim = params.claimedConfig.reviewClaim;
    if (!completedReviewClaim) {
      throw new ConflictException('The durable Review claim is missing.');
    }
    const nextConfig = brandRemixRunConfigSchema.parse({
      ...params.claimedConfig,
      phase: 'in_review',
      review: {
        approvedPostIds: [],
        batchId: params.completed.batchId,
        postIds: params.completed.postIds,
        workflowExecutionId: params.completed.workflowExecutionId,
        workflowId: params.completed.workflowId,
      },
      reviewClaim: {
        ...completedReviewClaim,
        status: 'completed',
      },
    });
    const updated = await this.persistence.compareAndSwapExactConfig({
      expectedConfig: params.claimedConfig,
      nextConfig,
      organizationId: params.organizationId,
      runId: params.runId,
      status: ContentRunStatus.COMPLETED,
    });
    if (!updated) {
      throw new ConflictException({
        detail:
          'A concurrent review submission already claimed this remix. Reload it and retry.',
        title: 'Concurrent review submission',
      });
    }
    return projectBrandRemixRun(updated, params.brandContext, nextConfig);
  }
}
