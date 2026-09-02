import {
  BRAND_REMIX_DOWNSTREAM_ACTION_IDS,
  BRAND_REMIX_DOWNSTREAM_WORKFLOW_IDS,
  buildBrandRemixReviewWorkflowDefinition,
} from '@api/collections/content-runs/services/brand-remix-downstream-workflow-definition';
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
  type SystemWorkflowProvenance,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
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
import { ContentFormat, ContentRunStatus } from '@genfeedai/enums';
import {
  ConflictException,
  Inject,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';

type ReviewHandoffActionInput = {
  input: SubmitBrandRemixRunForReview;
  organizationId: string;
  recordTrendLineage: boolean;
  runId: string;
  userId: string;
};

type ReviewProjectionState = {
  brandContext: ResolvedBrandContext;
  config: BrandRemixRunConfig;
  run: BrandRemixRunRecord;
};

type ReviewPreparedState = ReviewProjectionState & {
  brandId: string;
  needsHandoff: boolean;
  organizationId: string;
  recordTrendLineage: boolean;
  runId: string;
  selected: BrandRemixExecution['variants'];
  selectedAssetIds: string[];
  userId: string;
};

type ReviewClaimedState = ReviewPreparedState & {
  claimedConfig: BrandRemixRunConfig;
  claimedRun: BrandRemixRunRecord;
};

type ReviewHandoffState = ReviewClaimedState & {
  completed: {
    batchId: string;
    postIds: string[];
    workflowExecutionId: string;
    workflowId: string;
  };
};

@Injectable()
export class BrandRemixRunReviewService implements OnModuleInit {
  constructor(
    private readonly planning: BrandRemixRunPlanningService,
    private readonly persistence: BrandRemixRunPersistenceService,
    private readonly state: BrandRemixRunStateService,
    private readonly batchGenerationService: BatchGenerationService,
    private readonly trendReferenceCorpusService: TrendReferenceCorpusService,
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
    @Inject(BRAND_REMIX_RUNTIME)
    private readonly runtime: BrandRemixRuntime,
  ) {}

  onModuleInit(): void {
    this.systemWorkflowRunner.registerAction(
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.REVIEW_PREPARE,
      ({ input }) =>
        this.prepareReview(input.request as ReviewHandoffActionInput),
    );
    this.systemWorkflowRunner.registerAction(
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.REVIEW_CLAIM,
      ({ input }) => this.claimReviewAction(this.unwrapState(input.state)),
    );
    this.systemWorkflowRunner.registerAction(
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.REVIEW_CREATE_HANDOFF,
      ({ input, provenance }) =>
        this.createReviewHandoffAction(
          input.state as ReviewClaimedState,
          provenance,
        ),
    );
    this.systemWorkflowRunner.registerAction(
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.REVIEW_RECORD_LINEAGE,
      ({ input }) => this.recordReviewLineage(this.unwrapState(input.state)),
    );
    this.systemWorkflowRunner.registerAction(
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.REVIEW_COMPLETE,
      ({ input }) => this.completeReview(this.unwrapState(input.state)),
    );
    this.systemWorkflowRunner.registerAction(
      BRAND_REMIX_DOWNSTREAM_ACTION_IDS.REVIEW_PROJECT,
      ({ input }) => this.projectReview(this.unwrapState(input.state)),
    );
    this.systemWorkflowRunner.registerWorkflow(
      buildBrandRemixReviewWorkflowDefinition(),
    );
  }

  async submit(
    organizationId: string,
    runId: string,
    userId: string,
    input: SubmitBrandRemixRunForReview,
  ): Promise<BrandRemixRunView> {
    const { result } =
      await this.systemWorkflowRunner.runWorkflow<BrandRemixRunView>({
        actionType: BRAND_REMIX_DOWNSTREAM_WORKFLOW_IDS.REVIEW_HANDOFF,
        canonicalId: BRAND_REMIX_DOWNSTREAM_WORKFLOW_IDS.REVIEW_HANDOFF,
        inputValues: {
          request: {
            input,
            organizationId,
            runId,
            userId,
          },
        },
        organizationId,
        source: 'BrandRemixRunsService.submitForReview',
        userId,
      });
    return result;
  }

  private async prepareReview(
    actionInput: ReviewHandoffActionInput,
  ): Promise<ReviewPreparedState> {
    const { input, organizationId, runId, userId } = actionInput;
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
        needsHandoff: false,
        organizationId,
        recordTrendLineage: false,
        run,
        runId,
        selected: [],
        selectedAssetIds: [],
        userId,
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
      needsHandoff: true,
      organizationId,
      recordTrendLineage:
        config.sourceSnapshot.selector.kind === 'trend_reference',
      run,
      runId,
      selected,
      selectedAssetIds,
      userId,
    };
  }

  private async claimReviewAction(
    state: ReviewPreparedState,
  ): Promise<ReviewClaimedState> {
    const claimed = await this.claimReview(state);
    return {
      ...state,
      claimedConfig: claimed.config,
      claimedRun: claimed.run,
    };
  }

  private async createReviewHandoffAction(
    state: ReviewClaimedState,
    provenance: SystemWorkflowProvenance,
  ): Promise<ReviewHandoffState> {
    const completed = await this.createReviewHandoff({
      ...state,
      provenance,
    });
    return { ...state, completed };
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
    provenance: SystemWorkflowProvenance;
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
        sourceWorkflowId: params.provenance.workflowId,
        sourceWorkflowName: params.provenance.workflowLabel,
        targetIdempotencyKey: `brand-remix:${params.run.id}:${params.config.revision}:${variant.id}:${ingredientId ?? 'copy'}`,
        variantId: variant.id,
        workflowExecutionId: params.provenance.executionId,
      }));
    });
    const batch = await this.batchGenerationService.createManualReviewBatch(
      { brandId: params.brandId, items },
      params.userId,
      params.organizationId,
      `brand-remix:${params.run.id}:review:${params.config.revision}:${selectedKey}`,
    );
    const itemCount = items.length;
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
    return {
      batchId: batch.id,
      postIds,
      workflowExecutionId: params.provenance.executionId,
      workflowId: params.provenance.workflowId,
    };
  }

  private async recordReviewLineage(
    params: ReviewHandoffState,
  ): Promise<ReviewHandoffState> {
    const selector = params.config.sourceSnapshot.selector;
    if (selector.kind !== 'trend_reference') {
      throw new ConflictException(
        'Trend lineage can only be recorded for a trend reference remix.',
      );
    }
    await Promise.all(
      params.completed.postIds.map((postId) =>
        this.trendReferenceCorpusService.recordPostRemixLineage({
          brandId: params.brandId,
          generatedBy: BRAND_REMIX_RUN_CONTRACT,
          metadata: {
            sourceReferenceId: selector.sourceReferenceId,
            trendId: selector.trendId,
          },
          organizationId: params.organizationId,
          platforms: [params.config.draft.target.platform],
          postId,
          prompt: params.config.execution?.generationBrief.intent.objective,
        }),
      ),
    );
    return params;
  }

  private async completeReview(
    params: ReviewHandoffState,
  ): Promise<ReviewProjectionState> {
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
    return {
      brandContext: params.brandContext,
      config: nextConfig,
      run: updated,
    };
  }

  private projectReview(state: ReviewProjectionState): BrandRemixRunView {
    return projectBrandRemixRun(state.run, state.brandContext, state.config);
  }

  private unwrapState<T>(value: unknown): T {
    if (value && typeof value === 'object' && 'data' in value) {
      return (value as { data: T }).data;
    }
    return value as T;
  }
}
