import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import type { BrandDocument } from '@api/collections/brands/schemas/brand.schema';
import { BrandsService } from '@api/collections/brands/services/brands.service';
import { resolveEffectiveBrandAgentConfig } from '@api/collections/brands/utils/brand-agent-config-resolution.util';
import { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import {
  BRAND_REMIX_RUNTIME,
  type BrandRemixRuntime,
} from '@api/collections/content-runs/services/brand-remix-runtime';
import { GenerationReservationBarrier } from '@api/collections/content-runs/services/generation-reservation-barrier';
import {
  type PausedMetaCampaignDraftResult,
  PausedMetaCampaignDraftService,
} from '@api/collections/content-runs/services/paused-meta-campaign-draft.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { ImageGenerationService } from '@api/collections/images/services/image-generation.service';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import { VideoGenerationService } from '@api/collections/videos/services/video-generation.service';
import {
  SYSTEM_WORKFLOW_ACTION_IDS,
  SystemWorkflowProvenanceService,
} from '@api/collections/workflows/services/system-workflow-provenance.service';
import type {
  GenerationPlaceholderCreatedCallback,
  GenerationPlaceholderScope,
} from '@api/common/interfaces/generation-placeholder-lifecycle.interface';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { AdsResearchService } from '@api/endpoints/ads-research/ads-research.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { finalizeOutputCredits } from '@api/helpers/utils/credits/finalize-deferred-credits.util';
import { createInsufficientCreditsException } from '@api/helpers/utils/credits/insufficient-credits.util';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import type { ReviewBatchItemFormat } from '@api/services/batch-generation/constants/review-batch-item-format.constant';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  BRAND_REMIX_RUN_CONTRACT,
  BRAND_REMIX_RUN_VERSION,
  type BrandRemixDraft,
  type BrandRemixDraftEdits,
  type BrandRemixExecution,
  type BrandRemixReadiness,
  type BrandRemixRunConfig,
  type BrandRemixRunView,
  type BrandRemixSourceSelector,
  type BrandRemixSourceSnapshot,
  brandRemixDraftSchema,
  brandRemixRunConfigSchema,
  brandRemixRunViewSchema,
  createBrandRemixRunSchema,
  preparePausedMetaCampaignDraftSchema,
  reviseBrandRemixRunSchema,
  startBrandRemixRunSchema,
  submitBrandRemixRunForReviewSchema,
} from '@api-types/contracts/brand-remix-run.contract';
import type { GenerationBrief } from '@api-types/contracts/generation-brief.contract';
import { generationBriefSchema } from '@api-types/contracts/generation-brief.contract';
import { sourcePostVariationCredits } from '@genfeedai/constants';
import {
  AssetCategory,
  ContentFormat,
  ContentIntelligencePlatform,
  ContentRunStatus,
  IngredientCategory,
  IngredientStatus,
  PersistedReviewDecision,
  WorkflowExecutionTrigger,
} from '@genfeedai/enums';
import type {
  AdsResearchDetail,
  IBrandKitResolvedAssets,
  JsonApiSingleResponse,
} from '@genfeedai/interfaces';
import { CredentialPlatform, Prisma } from '@genfeedai/prisma';
import { scopedWhere } from '@genfeedai/server';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
} from '@nestjs/common';
import type { ZodError, ZodType } from 'zod';

const GENERATION_READY_STATUSES = new Set<string>([
  IngredientStatus.GENERATED,
  IngredientStatus.UPLOADED,
  IngredientStatus.VALIDATED,
]);
const SUPPORTED_ASPECT_RATIOS = new Set(['1:1', '4:5', '9:16', '16:9']);
const MAX_ERROR_LENGTH = 900;
const MAX_SERIALIZATION_RETRIES = 3;
const MAX_VARIANT_PATCH_RETRIES = 16;
const PRISMA_SERIALIZATION_FAILURE = 'P2034';
const REVIEW_CLAIM_LEASE_MS = 5 * 60 * 1000;
const GENERATION_CLAIM_LEASE_MS = 5 * 60 * 1000;
const PAID_DRAFT_CLAIM_LEASE_MS = 5 * 60 * 1000;
const AVATAR_REMIX_CREDIT_COST = 1;

const RUN_SELECT = {
  brandId: true,
  config: true,
  createdAt: true,
  id: true,
  isDeleted: true,
  organizationId: true,
  status: true,
  updatedAt: true,
} satisfies Prisma.ContentRunSelect;

type BrandRemixRunRecord = Prisma.ContentRunGetPayload<{
  select: typeof RUN_SELECT;
}>;

type BrandRemixReferenceEdit = NonNullable<
  BrandRemixDraftEdits['references']
>[number];

type ContentRunPersistenceClient = Pick<PrismaService, 'contentRun'>;

interface ResolvedBrandContext {
  brand: BrandDocument;
  brandKit: IBrandKitResolvedAssets;
  contextMode: 'brand' | 'organization_defaults';
  defaultIdentity: BrandRemixDraft['identity'];
}

interface ResolvedSource {
  recommendedOutputKind: BrandRemixDraft['output']['kind'];
  snapshot: BrandRemixSourceSnapshot;
}

interface GenerationDimensions {
  height: number;
  width: number;
}

type RemixCreditsRequest = Request & {
  creditsConfig?: {
    amount?: number;
    deferred?: boolean;
    [key: string]: unknown;
  };
};

@Injectable()
export class BrandRemixRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly brandsService: BrandsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly adsResearchService: AdsResearchService,
    private readonly imageGenerationService: ImageGenerationService,
    private readonly videoGenerationService: VideoGenerationService,
    private readonly avatarVideoGenerationService: AvatarVideoGenerationService,
    private readonly batchGenerationService: BatchGenerationService,
    private readonly trendReferenceCorpusService: TrendReferenceCorpusService,
    private readonly contentGeneratorService: ContentGeneratorService,
    private readonly pausedMetaCampaignDraftService: PausedMetaCampaignDraftService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly systemWorkflowProvenanceService: SystemWorkflowProvenanceService,
    @Inject(BRAND_REMIX_RUNTIME)
    private readonly runtime: BrandRemixRuntime,
  ) {}

  async create(
    organizationId: string,
    brandId: string,
    body: unknown,
  ): Promise<BrandRemixRunView> {
    const input = this.parse(createBrandRemixRunSchema, body, 'create');
    const brandContext = await this.resolveBrandContext(
      organizationId,
      brandId,
    );
    if (input.source.kind === 'connected_ad') {
      await this.assertConnectedCredential(
        organizationId,
        brandId,
        input.source.credentialId,
        input.source.platform,
      );
    }
    const resolvedSource = await this.resolveSource(
      organizationId,
      brandId,
      input.source,
    );
    const reusable = input.edits
      ? null
      : await this.findReusablePrefilledRun(
          organizationId,
          brandId,
          input.source,
        );
    if (reusable) {
      return this.project(
        reusable,
        brandContext,
        this.parseConfig(reusable.config, reusable.id),
      );
    }
    const defaults = this.defaultDraft(brandContext, resolvedSource);
    const draft = await this.resolveDraft(
      organizationId,
      brandId,
      brandContext,
      defaults,
      input.edits,
    );
    const readiness = this.buildReadiness(brandContext, draft);
    const config = brandRemixRunConfigSchema.parse({
      contract: BRAND_REMIX_RUN_CONTRACT,
      draft,
      phase: 'prefilled',
      readiness,
      recipeVersion: BRAND_REMIX_RUN_VERSION,
      revision: 1,
      sourceSnapshot: resolvedSource.snapshot,
      version: BRAND_REMIX_RUN_VERSION,
    });
    const persisted = await this.createOrReusePrefilledRun({
      brandId,
      config,
      organizationId,
      selector: input.source,
    });

    return this.project(
      persisted,
      brandContext,
      this.parseConfig(persisted.config, persisted.id),
    );
  }

  async get(organizationId: string, runId: string): Promise<BrandRemixRunView> {
    const run = await this.requireRun(organizationId, runId);
    const brandContext = await this.resolveBrandContext(
      organizationId,
      this.requireBrandId(run),
    );
    const reconciled = await this.reconcile(run);
    return this.project(reconciled.run, brandContext, reconciled.config);
  }

  async revise(
    organizationId: string,
    runId: string,
    body: unknown,
  ): Promise<BrandRemixRunView> {
    const input = this.parse(reviseBrandRemixRunSchema, body, 'revise');
    const run = await this.requireRun(organizationId, runId);
    const config = this.parseConfig(run.config, runId);
    if (config.revision !== input.expectedRevision) {
      throw this.staleRevision(input.expectedRevision, config.revision);
    }
    if (config.phase !== 'prefilled' && config.phase !== 'failed') {
      throw new ConflictException({
        detail:
          'A generated remix is immutable. Create another remix from the same source to vary it.',
        title: 'Remix recipe is already executing',
      });
    }

    const brandId = this.requireBrandId(run);
    const brandContext = await this.resolveBrandContext(
      organizationId,
      brandId,
    );
    const draft = await this.resolveDraft(
      organizationId,
      brandId,
      brandContext,
      config.draft,
      input.edits,
    );
    const nextConfig = brandRemixRunConfigSchema.parse({
      ...config,
      draft,
      execution: undefined,
      generationClaim: undefined,
      paidDraft: undefined,
      paidDraftOperation: undefined,
      phase: 'prefilled',
      readiness: this.buildReadiness(brandContext, draft),
      review: undefined,
      reviewClaim: undefined,
      revision: config.revision + 1,
    });
    const updated = await this.compareAndSwapConfig({
      expectedPhase: config.phase,
      expectedRevision: input.expectedRevision,
      nextConfig,
      organizationId,
      runId,
      status: ContentRunStatus.PENDING,
    });

    return this.project(updated, brandContext, nextConfig);
  }

  async start(
    organizationId: string,
    runId: string,
    user: User,
    request: Request,
    body: unknown,
  ): Promise<BrandRemixRunView> {
    const input = this.parse(startBrandRemixRunSchema, body, 'start');
    let run = await this.requireRun(organizationId, runId);
    let config = this.parseConfig(run.config, runId);
    if (config.revision !== input.expectedRevision) {
      throw this.staleRevision(input.expectedRevision, config.revision);
    }
    const brandId = this.requireBrandId(run);
    const brandContext = await this.resolveBrandContext(
      organizationId,
      brandId,
    );

    if (config.execution) {
      const reconciled = await this.reconcile(run);
      run = reconciled.run;
      config = reconciled.config;
    } else if (config.phase !== 'prefilled' && config.phase !== 'failed') {
      throw new ConflictException({
        detail: `A remix cannot start generation from phase ${config.phase}.`,
        title: 'Remix generation unavailable',
      });
    }

    await this.assertDraftAssetsAuthorized(
      organizationId,
      brandId,
      config.draft,
    );
    const readiness = this.buildReadiness(brandContext, config.draft);
    if (readiness.state === 'blocked') {
      throw new ConflictException({
        detail: readiness.issues.map((issue) => issue.message).join('; '),
        title: 'Remix generation is blocked',
      });
    }

    await this.resolveSource(
      organizationId,
      brandId,
      config.sourceSnapshot.selector,
    );
    if (
      config.draft.output.kind === 'avatar' &&
      !(request as RemixCreditsRequest).creditsConfig
    ) {
      throw new ConflictException(
        'Avatar remix generation requires a deferred credit reservation.',
      );
    }

    let activeConfig = config;
    if (!activeConfig.execution) {
      const variants: BrandRemixExecution['variants'] = Array.from(
        { length: config.draft.output.count },
        () => ({
          assetIds: [],
          id: this.runtime.randomId(),
          recipeRevision: config.revision,
          status: 'queued' as const,
        }),
      );
      activeConfig = brandRemixRunConfigSchema.parse({
        ...config,
        execution: {
          actualCount: 0,
          generationBrief: this.buildGenerationBrief(brandContext, config),
          requestedCount: config.draft.output.count,
          variants,
        },
        phase: 'generating',
        readiness,
      });
      run = await this.compareAndSwapConfig({
        expectedPhase: config.phase,
        expectedRevision: config.revision,
        nextConfig: activeConfig,
        organizationId,
        runId,
        status: ContentRunStatus.RUNNING,
      });
      activeConfig = this.parseConfig(run.config, run.id);
    }

    if (activeConfig.generationClaim) {
      const claimAge =
        this.runtime.now().getTime() -
        new Date(activeConfig.generationClaim.claimedAt).getTime();
      if (claimAge < GENERATION_CLAIM_LEASE_MS) {
        return this.project(run, brandContext, activeConfig);
      }
      activeConfig = await this.recoverStalledReservations({
        brandId,
        config: activeConfig,
        organizationId,
        runId,
      });
      run = await this.requireRun(organizationId, runId);
    }

    const resumablePhase =
      activeConfig.phase === 'generating' ||
      activeConfig.phase === 'partially_ready';
    const resumable = resumablePhase
      ? (activeConfig.execution?.variants.filter(
          (variant) =>
            variant.assetIds.length === 0 &&
            (variant.status === 'queued' || variant.status === 'processing'),
        ) ?? [])
      : [];
    if (!resumable.length) {
      return this.project(run, brandContext, activeConfig);
    }

    const claimedConfig = brandRemixRunConfigSchema.parse({
      ...activeConfig,
      generationClaim: {
        claimedAt: this.runtime.now().toISOString(),
        id: `${runId}:generate:${activeConfig.revision}`,
        variantIds: resumable.map((variant) => variant.id),
      },
    });
    const generationClaim = await this.compareAndSwapExactConfig({
      expectedConfig: activeConfig,
      nextConfig: claimedConfig,
      organizationId,
      runId,
      status: ContentRunStatus.RUNNING,
    });
    if (!generationClaim) {
      const latest = await this.requireRun(organizationId, runId);
      return this.project(
        latest,
        brandContext,
        this.parseConfig(latest.config, runId),
      );
    }
    run = generationClaim;
    activeConfig = claimedConfig;

    // Crash recovery first: adopt durable placeholders that a previous
    // attempt persisted before an interruption linked them into the config,
    // so a resumed run never pays for the same variant twice.
    const stuck = resumable.filter(
      (variant) => variant.status === 'processing',
    );
    if (stuck.length) {
      activeConfig = await this.adoptOrphanedPlaceholders({
        brandId,
        config: activeConfig,
        organizationId,
        runId,
        variants: stuck,
      });
    }
    const variants = resumable.filter(
      (variant) =>
        !activeConfig.execution?.variants.find(
          (candidate) => candidate.id === variant.id,
        )?.assetIds.length,
    );
    if (!variants.length) {
      return this.clearGenerationClaimAndProject({
        brandContext,
        config: activeConfig,
        organizationId,
        run,
        runId,
      });
    }

    const generationUser = { ...user, brandId };
    if (activeConfig.draft.output.kind === 'copy') {
      activeConfig = await this.generateCopyVariants({
        brandId,
        config: activeConfig,
        organizationId,
        runId,
        request,
        variants,
      });
      const copied = await this.requireRun(organizationId, runId);
      const reconciled = await this.reconcile(copied);
      return this.clearGenerationClaimAndProject({
        brandContext,
        config: reconciled.config,
        organizationId,
        run: reconciled.run,
        runId,
      });
    }

    for (const variant of variants) {
      await this.patchGeneratingVariant({
        organizationId,
        patch: { status: 'processing' },
        recipeRevision: config.revision,
        runId,
        status: ContentRunStatus.RUNNING,
        variantId: variant.id,
      });
    }

    const creditAmounts = new Map<string, number>();
    const successfulVariants = new Set<string>();
    const barrier = new GenerationReservationBarrier(variants.length);
    const creditBarrier = new GenerationReservationBarrier(
      variants.length,
      async () => {
        const total = [...creditAmounts.values()].reduce(
          (sum, amount) => sum + amount,
          0,
        );
        if (
          total > 0 &&
          !(await this.creditsUtilsService.checkOrganizationCreditsAvailable(
            organizationId,
            total,
          ))
        ) {
          const balance =
            await this.creditsUtilsService.getOrganizationCreditsBalance(
              organizationId,
            );
          throw createInsufficientCreditsException(total, balance);
        }
      },
    );
    await Promise.all(
      variants.map(async (variant) => {
        let linkedAssetId: string | undefined;
        const groupIndex =
          activeConfig.execution?.variants.findIndex(
            (candidate) => candidate.id === variant.id,
          ) ?? -1;
        try {
          const variantRequest = Object.assign(
            Object.create(Object.getPrototypeOf(request)),
            request,
          ) as RemixCreditsRequest;
          const originalCredits = (request as RemixCreditsRequest)
            .creditsConfig;
          if (activeConfig.draft.output.kind === 'avatar') {
            const requestedAmount = originalCredits?.amount;
            variantRequest.creditsConfig = {
              ...originalCredits,
              amount:
                typeof requestedAmount === 'number' &&
                Number.isFinite(requestedAmount) &&
                requestedAmount > 0
                  ? requestedAmount
                  : AVATAR_REMIX_CREDIT_COST,
              deferred: true,
            };
          } else {
            variantRequest.creditsConfig = originalCredits
              ? { ...originalCredits, deferred: true }
              : undefined;
          }
          const assetId = await this.dispatchVariant({
            brandId,
            config: activeConfig,
            onPlaceholderCreated: async (ingredientId) => {
              activeConfig = await this.patchGeneratingVariant({
                organizationId,
                patch: {
                  assetIds: [ingredientId],
                  status: 'processing',
                },
                recipeRevision: config.revision,
                runId,
                status: ContentRunStatus.RUNNING,
                variantId: variant.id,
              });
              linkedAssetId = ingredientId;
              await barrier.arrive();
            },
            onCreditsPrepared: async () => {
              creditAmounts.set(
                variant.id,
                variantRequest.creditsConfig?.amount ?? 0,
              );
              await creditBarrier.arrive();
            },
            placeholderScope: {
              groupId: runId,
              groupIndex,
              settleCreditsExternally: true,
            },
            request: variantRequest,
            user: generationUser,
          });
          if (linkedAssetId && linkedAssetId !== assetId) {
            throw new ConflictException(
              'Generation returned a different Ingredient than its durable placeholder.',
            );
          }
          if (!linkedAssetId) {
            activeConfig = await this.patchGeneratingVariant({
              organizationId,
              patch: { assetIds: [assetId], status: 'processing' },
              recipeRevision: config.revision,
              runId,
              status: ContentRunStatus.RUNNING,
              variantId: variant.id,
            });
          }
          successfulVariants.add(variant.id);
        } catch (error: unknown) {
          barrier.fail(error);
          creditBarrier.fail(error);
          activeConfig = await this.patchGeneratingVariant({
            organizationId,
            patch: {
              error: this.errorMessage(error),
              status: 'failed',
            },
            recipeRevision: config.revision,
            runId,
            status: ContentRunStatus.RUNNING,
            variantId: variant.id,
          });
        }
      }),
    );
    finalizeOutputCredits(
      request,
      [...successfulVariants].reduce(
        (sum, variantId) => sum + (creditAmounts.get(variantId) ?? 0),
        0,
      ),
    );

    const reconciled = await this.reconcile(
      await this.requireRun(organizationId, runId),
    );
    return this.clearGenerationClaimAndProject({
      brandContext,
      config: reconciled.config,
      organizationId,
      run: reconciled.run,
      runId,
    });
  }

  async submitForReview(
    organizationId: string,
    runId: string,
    userId: string,
    body: unknown,
  ): Promise<BrandRemixRunView> {
    const input = this.parse(
      submitBrandRemixRunForReviewSchema,
      body,
      'review',
    );
    const initial = await this.requireRun(organizationId, runId);
    const reconciled = await this.reconcile(initial);
    const run = reconciled.run;
    const config = reconciled.config;
    const brandId = this.requireBrandId(run);
    const brandContext = await this.resolveBrandContext(
      organizationId,
      brandId,
    );

    if (config.review) {
      return this.project(run, brandContext, config);
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
    await this.assertGeneratedAssetsAuthorized(
      organizationId,
      brandId,
      selectedAssetIds,
    );
    const format: ReviewBatchItemFormat =
      config.draft.output.kind === 'copy'
        ? 'post'
        : config.draft.output.kind === 'image'
          ? ContentFormat.IMAGE
          : ContentFormat.VIDEO;
    const platform = config.draft.target.platform;
    const selectedKey = selected
      .map((variant) => variant.id)
      .sort()
      .join(':');
    if (config.reviewClaim) {
      const claimedIds = [...config.reviewClaim.selectedVariantIds].sort();
      const requestedVariantIds = selected.map((variant) => variant.id).sort();
      if (claimedIds.join(':') !== requestedVariantIds.join(':')) {
        throw new ConflictException({
          detail:
            'Resume the variants already claimed by the interrupted Review handoff.',
          title: 'Review variants already claimed',
        });
      }
      const claimAge =
        this.runtime.now().getTime() -
        new Date(config.reviewClaim.claimedAt).getTime();
      if (claimAge < REVIEW_CLAIM_LEASE_MS) {
        throw new ConflictException({
          detail:
            'A concurrent review submission already claimed this remix. Reload it and retry.',
          title: 'Concurrent review submission',
        });
      }
    }
    const claimedConfig = brandRemixRunConfigSchema.parse({
      ...config,
      reviewClaim: {
        claimedAt: this.runtime.now().toISOString(),
        id: `${run.id}:review:${config.revision}`,
        selectedVariantIds: selected.map((variant) => variant.id),
        status: 'claimed',
      },
    });
    const claimed = await this.compareAndSwapExactConfig({
      expectedConfig: config,
      nextConfig: claimedConfig,
      organizationId,
      runId,
      status: ContentRunStatus.COMPLETED,
    });
    if (!claimed) {
      throw new ConflictException({
        detail:
          'A concurrent review submission already claimed this remix. Reload it and retry.',
        title: 'Concurrent review submission',
      });
    }
    const workflow = await this.systemWorkflowProvenanceService.runAction(
      {
        actionType: 'brand-remix-review-handoff',
        canonicalId: SYSTEM_WORKFLOW_ACTION_IDS.BRAND_REMIX_REVIEW_HANDOFF,
        description:
          'Creates canonical draft Posts for selected brand remix variants and routes them to mandatory Review.',
        inputValues: {
          contentRunId: run.id,
          recipeRevision: config.revision,
          selectedVariantIds: selected.map((variant) => variant.id),
        },
        label: 'Brand Remix Review Handoff',
        organizationId,
        source: 'BrandRemixRunsService.submitForReview',
        trigger: WorkflowExecutionTrigger.MANUAL,
        userId,
      },
      async (provenance) => {
        const items = selected.flatMap((variant) => {
          const ingredientIds =
            config.draft.output.kind === 'copy'
              ? [undefined]
              : variant.assetIds;
          return ingredientIds.map((ingredientId) => ({
            caption: variant.content ?? config.draft.intent.objective,
            contentRunId: run.id,
            creativeVersion: `recipe-${config.revision}`,
            format,
            ...(ingredientId ? { ingredientId } : {}),
            label: `${brandContext.brand.label} remix ${variant.id}`,
            platform,
            prompt: config.execution?.generationBrief.intent.objective,
            publishIntent:
              config.draft.target.kind === 'paid' ? 'campaign' : 'test',
            sourceActionId: config.sourceSnapshot.sourceId,
            sourceWorkflowId: provenance.workflowId,
            sourceWorkflowName: provenance.workflowLabel,
            targetIdempotencyKey: `brand-remix:${run.id}:${config.revision}:${variant.id}:${ingredientId ?? 'copy'}`,
            variantId: variant.id,
            workflowExecutionId: provenance.executionId,
          }));
        });
        const batch = await this.batchGenerationService.createManualReviewBatch(
          { brandId, items },
          userId,
          organizationId,
          `brand-remix:${run.id}:review:${config.revision}:${selectedKey}`,
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

    const completedReviewClaim = claimedConfig.reviewClaim;
    if (!completedReviewClaim) {
      throw new ConflictException('The durable Review claim is missing.');
    }

    const selector = config.sourceSnapshot.selector;
    if (selector.kind === 'trend_reference') {
      await Promise.all(
        postIds.map((postId) =>
          this.trendReferenceCorpusService.recordPostRemixLineage({
            brandId,
            generatedBy: BRAND_REMIX_RUN_CONTRACT,
            metadata: {
              sourceReferenceId: selector.sourceReferenceId,
              trendId: selector.trendId,
            },
            organizationId,
            platforms: [platform],
            postId,
            prompt: config.execution?.generationBrief.intent.objective,
          }),
        ),
      );
    }

    const nextConfig = brandRemixRunConfigSchema.parse({
      ...claimedConfig,
      phase: 'in_review',
      review: {
        approvedPostIds: [],
        batchId: batch.id,
        postIds,
        workflowExecutionId: workflow.provenance.executionId,
        workflowId: workflow.provenance.workflowId,
      },
      reviewClaim: {
        ...completedReviewClaim,
        status: 'completed',
      },
    });
    const updated = await this.compareAndSwapExactConfig({
      expectedConfig: claimedConfig,
      nextConfig,
      organizationId,
      runId,
      status: ContentRunStatus.COMPLETED,
    });
    if (!updated) {
      throw new ConflictException({
        detail:
          'A concurrent review submission already claimed this remix. Reload it and retry.',
        title: 'Concurrent review submission',
      });
    }
    return this.project(updated, brandContext, nextConfig);
  }

  async preparePausedMetaDraft(
    organizationId: string,
    runId: string,
    _userId: string,
    body: unknown,
  ): Promise<BrandRemixRunView> {
    const input = this.parse(
      preparePausedMetaCampaignDraftSchema,
      body,
      'paid draft',
    );
    const initial = await this.requireRun(organizationId, runId);
    const reconciled = await this.reconcile(initial);
    const run = reconciled.run;
    let config = reconciled.config;
    const brandId = this.requireBrandId(run);
    const brandContext = await this.resolveBrandContext(
      organizationId,
      brandId,
    );

    if (
      config.draft.target.kind !== 'paid' ||
      config.draft.target.platform !== 'meta'
    ) {
      throw new BadRequestException({
        detail:
          'Paused campaign draft handoff currently requires a paid Meta target.',
        title: 'Unsupported campaign target',
      });
    }
    if (config.paidDraft) {
      if (
        config.paidDraft.credentialId !== input.destination.credentialId ||
        config.paidDraft.adAccountId !== input.destination.adAccountId ||
        (input.variantId !== undefined &&
          config.paidDraft.variantId !== input.variantId)
      ) {
        throw new ConflictException(
          'A paused Meta draft already exists for another destination or variant.',
        );
      }
      return this.project(run, brandContext, {
        ...config,
        paidDraft: { ...config.paidDraft, replayed: true },
      });
    }
    if (
      (config.phase !== 'approved' && config.phase !== 'paid_draft_creating') ||
      !config.review?.approvedPostIds.length
    ) {
      throw new ConflictException({
        detail:
          'Approve at least one Review draft before preparing a campaign.',
        title: 'Campaign review is incomplete',
      });
    }
    const credential = await this.assertConnectedCredential(
      organizationId,
      brandId,
      input.destination.credentialId,
      'meta',
    );
    const hasMetaAdsCapability = Boolean(
      credential.grantedScopesCapturedAt &&
        credential.grantedScopes.includes('ads_management'),
    );
    const capabilityIssue = {
      code: 'missing_ads_management' as const,
      field: 'target' as const,
      message:
        'Reconnect Meta and grant ads_management before preparing a paused campaign draft.',
      severity: 'blocked' as const,
    };
    if (!hasMetaAdsCapability) {
      const blockedConfig = brandRemixRunConfigSchema.parse({
        ...config,
        readiness: {
          issues: [
            ...config.readiness.issues.filter(
              (issue) => issue.code !== capabilityIssue.code,
            ),
            capabilityIssue,
          ],
          state: 'blocked',
        },
      });
      const updated = await this.compareAndSwapExactConfig({
        expectedConfig: config,
        nextConfig: blockedConfig,
        organizationId,
        runId,
        status: run.status as ContentRunStatus,
      });
      if (!updated) {
        throw new ConflictException(
          'The Meta capability readiness changed concurrently.',
        );
      }
      return this.project(updated, brandContext, blockedConfig);
    }
    if (
      config.readiness.issues.some(
        (issue) => issue.code === capabilityIssue.code,
      )
    ) {
      const issues = config.readiness.issues.filter(
        (issue) => issue.code !== capabilityIssue.code,
      );
      const readyConfig = brandRemixRunConfigSchema.parse({
        ...config,
        readiness: {
          issues,
          state: issues.some((issue) => issue.severity === 'blocked')
            ? 'blocked'
            : issues.length
              ? 'degraded'
              : 'ready',
        },
      });
      const updated = await this.compareAndSwapExactConfig({
        expectedConfig: config,
        nextConfig: readyConfig,
        organizationId,
        runId,
        status: run.status as ContentRunStatus,
      });
      if (!updated) {
        throw new ConflictException(
          'The Meta capability readiness changed concurrently.',
        );
      }
      config = readyConfig;
    }
    const requestedVariant = config.execution?.variants.find(
      (variant) => variant.id === input.variantId,
    );
    if (input.variantId !== undefined && !requestedVariant) {
      throw new ConflictException(
        'The requested remix variant does not exist on this run.',
      );
    }
    const selectedVariant =
      requestedVariant ??
      config.execution?.variants.find((variant) => variant.status === 'ready');
    if (selectedVariant?.status !== 'ready') {
      throw new ConflictException(
        'Select a ready approved remix variant for the Meta draft.',
      );
    }
    const operation = {
      adAccountId: input.destination.adAccountId,
      claimedAt: this.runtime.now().toISOString(),
      credentialId: input.destination.credentialId,
      id: `${run.id}:meta:${config.revision}:${selectedVariant.id}`,
      linkUrl:
        config.sourceSnapshot.destinationUrl ??
        config.sourceSnapshot.canonicalUrl,
      variantId: selectedVariant.id,
    };
    if (!operation.linkUrl) {
      throw new ConflictException(
        'The authorized source has no HTTPS campaign destination.',
      );
    }
    let claimedConfig = config;
    if (!config.paidDraftOperation) {
      claimedConfig = brandRemixRunConfigSchema.parse({
        ...config,
        paidDraftOperation: operation,
        phase: 'paid_draft_creating',
      });
      const claimed = await this.compareAndSwapExactConfig({
        expectedConfig: config,
        nextConfig: claimedConfig,
        organizationId,
        runId,
        status: ContentRunStatus.RUNNING,
      });
      if (!claimed) {
        throw new ConflictException(
          'A concurrent Meta draft action won the claim.',
        );
      }
    } else {
      const matchesClaim =
        config.paidDraftOperation.credentialId ===
          input.destination.credentialId &&
        config.paidDraftOperation.adAccountId ===
          input.destination.adAccountId &&
        config.paidDraftOperation.variantId === selectedVariant.id;
      const claimAge =
        this.runtime.now().getTime() -
        new Date(config.paidDraftOperation.claimedAt).getTime();
      if (claimAge < PAID_DRAFT_CLAIM_LEASE_MS) {
        if (matchesClaim) {
          return this.project(run, brandContext, config);
        }
        throw new ConflictException(
          'Resume the existing Meta draft destination and variant until its recovery lease expires.',
        );
      }
      claimedConfig = brandRemixRunConfigSchema.parse({
        ...config,
        paidDraftOperation: operation,
        phase: 'paid_draft_creating',
      });
      const reclaimed = await this.compareAndSwapExactConfig({
        expectedConfig: config,
        nextConfig: claimedConfig,
        organizationId,
        runId,
        status: ContentRunStatus.RUNNING,
      });
      if (!reclaimed) {
        throw new ConflictException(
          'A concurrent Meta draft recovery won the claim.',
        );
      }
    }
    let paidDraft: PausedMetaCampaignDraftResult;
    try {
      paidDraft = await this.pausedMetaCampaignDraftService.prepare({
        adAccountId: input.destination.adAccountId,
        brandId,
        config: claimedConfig,
        credentialId: input.destination.credentialId,
        linkUrl: operation.linkUrl,
        organizationId,
        runId,
        userId: _userId,
        variant: selectedVariant,
      });
    } catch (error: unknown) {
      const releasedConfig = brandRemixRunConfigSchema.parse({
        ...claimedConfig,
        paidDraftOperation: undefined,
        phase: 'approved',
      });
      await this.compareAndSwapExactConfig({
        expectedConfig: claimedConfig,
        nextConfig: releasedConfig,
        organizationId,
        runId,
        status: ContentRunStatus.COMPLETED,
      });
      throw error;
    }
    const nextConfig = brandRemixRunConfigSchema.parse({
      ...claimedConfig,
      paidDraft,
      paidDraftOperation: undefined,
      phase: 'paid_draft_ready',
    });
    const updated = await this.compareAndSwapExactConfig({
      expectedConfig: claimedConfig,
      nextConfig,
      organizationId,
      runId,
      status: ContentRunStatus.COMPLETED,
    });
    if (updated) {
      return this.project(updated, brandContext, nextConfig);
    }

    for (let attempt = 0; attempt < MAX_SERIALIZATION_RETRIES; attempt += 1) {
      const latest = await this.requireRun(organizationId, runId);
      const latestConfig = this.parseConfig(latest.config, runId);
      if (latestConfig.paidDraft) {
        if (
          latestConfig.paidDraft.credentialId === paidDraft.credentialId &&
          latestConfig.paidDraft.adAccountId === paidDraft.adAccountId &&
          latestConfig.paidDraft.variantId === paidDraft.variantId
        ) {
          return this.project(latest, brandContext, latestConfig);
        }
        break;
      }
      const latestOperation = latestConfig.paidDraftOperation;
      if (
        !latestOperation ||
        latestOperation.id !== claimedConfig.paidDraftOperation?.id ||
        latestOperation.credentialId !== paidDraft.credentialId ||
        latestOperation.adAccountId !== paidDraft.adAccountId ||
        latestOperation.variantId !== paidDraft.variantId
      ) {
        break;
      }
      const recoveredConfig = brandRemixRunConfigSchema.parse({
        ...latestConfig,
        paidDraft,
        paidDraftOperation: undefined,
        phase: 'paid_draft_ready',
      });
      const recovered = await this.compareAndSwapExactConfig({
        expectedConfig: latestConfig,
        nextConfig: recoveredConfig,
        organizationId,
        runId,
        status: ContentRunStatus.COMPLETED,
      });
      if (recovered) {
        return this.project(recovered, brandContext, recoveredConfig);
      }
    }

    throw new ConflictException('The Meta draft result changed concurrently.');
  }

  private async resolveBrandContext(
    organizationId: string,
    brandId: string,
  ): Promise<ResolvedBrandContext> {
    const brand = await this.brandsService.findOne(
      scopedWhere(organizationId, { id: brandId, isActive: true }),
      'none',
    );
    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }
    const [organizationSettings, brandKit] = await Promise.all([
      this.organizationSettingsService.findOne({
        organizationId,
      }),
      this.brandsService.resolveBrandKitAssets(brandId, organizationId),
    ]);
    const effective = resolveEffectiveBrandAgentConfig({
      brand,
      organizationSettings,
    });
    const identity = effective.identityDefaults.effective;
    const defaultIdentity: BrandRemixDraft['identity'] =
      identity.defaultAvatarIngredientId && identity.defaultVoiceId
        ? {
            avatarAssetId: identity.defaultAvatarIngredientId,
            speechVoiceId: identity.defaultVoiceId,
          }
        : {};
    const contextMode = this.hasBrandContext(brand, brandKit)
      ? 'brand'
      : 'organization_defaults';

    return {
      brand,
      brandKit,
      contextMode,
      defaultIdentity,
    };
  }

  private async resolveSource(
    organizationId: string,
    brandId: string,
    selector: BrandRemixSourceSelector,
  ): Promise<ResolvedSource> {
    switch (selector.kind) {
      case 'source_post':
        return this.resolveSourcePost(organizationId, brandId, selector);
      case 'owned_post':
        return this.resolveOwnedPost(organizationId, brandId, selector);
      case 'trend_reference':
        return this.resolveTrendReference(organizationId, brandId, selector);
      case 'public_ad':
        return this.resolvePublicAd(organizationId, selector);
      case 'connected_ad':
        return this.resolveConnectedAd(organizationId, brandId, selector);
    }
  }

  private async resolveSourcePost(
    organizationId: string,
    brandId: string,
    selector: Extract<BrandRemixSourceSelector, { kind: 'source_post' }>,
  ): Promise<ResolvedSource> {
    const post = await this.prisma.sourcePost.findFirst({
      select: {
        authorHandle: true,
        collectedAt: true,
        contentType: true,
        id: true,
        mediaUrls: true,
        metrics: true,
        platform: true,
        sourceUrl: true,
        text: true,
        thumbnailUrl: true,
      },
      where: scopedWhere(organizationId, {
        brandId,
        id: selector.sourcePostId,
      }),
    });
    if (!post || !this.text(post.text)) {
      throw new NotFoundException('Source post', selector.sourcePostId);
    }
    const platform = this.sourcePlatform(post.platform);
    const title = this.truncate(this.text(post.text) ?? 'Source post');
    const hasVideo = this.isVideoMedia(post.contentType, post.mediaUrls);
    return {
      recommendedOutputKind: hasVideo ? 'video' : 'image',
      snapshot: {
        authorHandle: this.text(post.authorHandle),
        canonicalUrl: this.publicUrl(post.sourceUrl),
        capturedAt: this.runtime.now().toISOString(),
        evidence: [title],
        metrics: this.numericRecord(post.metrics),
        pattern: this.patternFromText(title, hasVideo ? 'video' : 'image'),
        platform,
        selector,
        sourceId: post.id,
        title,
      },
    };
  }

  private async resolveOwnedPost(
    organizationId: string,
    brandId: string,
    selector: Extract<BrandRemixSourceSelector, { kind: 'owned_post' }>,
  ): Promise<ResolvedSource> {
    const post = await this.prisma.post.findFirst({
      select: {
        createdAt: true,
        description: true,
        id: true,
        ingredients: {
          select: { category: true },
          where: { isDeleted: false },
        },
        platform: true,
        url: true,
      },
      where: scopedWhere(organizationId, { brandId, id: selector.postId }),
    });
    if (!post || !this.text(post.description)) {
      throw new NotFoundException('Post', selector.postId);
    }
    const title = this.truncate(this.text(post.description) ?? 'Owned post');
    const hasVideo = post.ingredients.some(
      (ingredient) =>
        ingredient.category === IngredientCategory.VIDEO ||
        ingredient.category === IngredientCategory.AVATAR,
    );
    return {
      recommendedOutputKind: hasVideo ? 'video' : 'image',
      snapshot: {
        canonicalUrl: this.publicUrl(post.url),
        capturedAt: this.runtime.now().toISOString(),
        evidence: [title],
        metrics: {},
        pattern: this.patternFromText(title, hasVideo ? 'video' : 'image'),
        platform: this.sourcePlatform(post.platform),
        selector,
        sourceId: post.id,
        title,
      },
    };
  }

  private async resolveTrendReference(
    organizationId: string,
    brandId: string,
    selector: Extract<BrandRemixSourceSelector, { kind: 'trend_reference' }>,
  ): Promise<ResolvedSource> {
    const reference = await this.prisma.trendSourceReference.findFirst({
      select: {
        authorHandle: true,
        canonicalUrl: true,
        currentEngagementTotal: true,
        data: true,
        id: true,
        latestTrendViralityScore: true,
        platform: true,
      },
      where: {
        id: selector.sourceReferenceId,
        isDeleted: false,
        links: {
          some: {
            isDeleted: false,
            trendId: selector.trendId,
            trend: scopedWhere(organizationId, {
              OR: [{ brandId }, { brandId: null }],
              id: selector.trendId,
            }),
          },
        },
      },
    });
    if (!reference) {
      throw new NotFoundException(
        'Trend reference',
        selector.sourceReferenceId,
      );
    }
    const data = this.record(reference.data);
    const title = this.truncate(
      this.text(data.title) ??
        this.text(data.text) ??
        this.text(data.caption) ??
        'Trend reference',
    );
    const contentType = this.text(data.contentType);
    const hasVideo = this.isVideoMedia(contentType, [
      ...this.stringArray(data.videoUrls),
      ...this.stringArray(data.mediaUrls),
    ]);
    const sourcePatternText = [
      title,
      this.text(data.hook),
      this.text(data.structure),
      this.text(data.pacing),
    ]
      .filter((value): value is string => Boolean(value))
      .join(' ');
    const metrics = {
      ...this.numericRecord(data.currentMetrics ?? data.metrics),
      engagementTotal: reference.currentEngagementTotal,
      viralityScore: reference.latestTrendViralityScore,
    };
    return {
      recommendedOutputKind: hasVideo ? 'video' : 'image',
      snapshot: {
        authorHandle: this.text(reference.authorHandle),
        canonicalUrl: this.publicUrl(reference.canonicalUrl),
        capturedAt: this.runtime.now().toISOString(),
        evidence: this.stringArray(data.matchedTrends).length
          ? this.stringArray(data.matchedTrends)
          : [title],
        metrics,
        pattern: this.patternFromText(
          sourcePatternText,
          hasVideo ? 'video' : 'image',
        ),
        platform: this.sourcePlatform(reference.platform),
        selector,
        sourceId: reference.id,
        title,
      },
    };
  }

  private async resolvePublicAd(
    organizationId: string,
    selector: Extract<BrandRemixSourceSelector, { kind: 'public_ad' }>,
  ): Promise<ResolvedSource> {
    const detail = await this.adsResearchService.getAdDetail(organizationId, {
      id: selector.adPerformanceId,
      source: 'public',
    });
    return this.resolvedAd(selector, detail);
  }

  private async resolveConnectedAd(
    organizationId: string,
    brandId: string,
    selector: Extract<BrandRemixSourceSelector, { kind: 'connected_ad' }>,
  ): Promise<ResolvedSource> {
    await this.assertConnectedCredential(
      organizationId,
      brandId,
      selector.credentialId,
      selector.platform,
    );
    const detail = await this.adsResearchService.getAdDetail(organizationId, {
      adAccountId: selector.adAccountId,
      channel: selector.channel,
      credentialId: selector.credentialId,
      id: selector.adId,
      loginCustomerId: selector.loginCustomerId,
      platform: selector.platform,
      source: 'my_accounts',
    });
    return this.resolvedAd(selector, detail);
  }

  private resolvedAd(
    selector: Extract<
      BrandRemixSourceSelector,
      { kind: 'connected_ad' | 'public_ad' }
    >,
    detail: AdsResearchDetail,
  ): ResolvedSource {
    const platform = this.sourcePlatform(detail.platform);
    const title = this.truncate(
      this.text(detail.title) ?? `Performance ${platform} ad`,
    );
    const sourceId =
      this.text(detail.sourceId) ??
      (selector.kind === 'public_ad'
        ? selector.adPerformanceId
        : selector.adId);
    const patternLabels =
      detail.patternSummary?.flatMap((pattern) =>
        this.text(pattern.label) ? [this.truncate(pattern.label)] : [],
      ) ?? [];
    const explanation =
      this.text(detail.explanation) ??
      'Performance evidence is available for this ad.';
    const evidence = [
      explanation,
      ...patternLabels.map((label) => `Pattern: ${label}`),
    ]
      .map((value) => this.truncate(value))
      .slice(0, 50);
    const hasVideo = Boolean(
      detail.videoUrls?.length || detail.creative?.videoUrls?.length,
    );
    const sourcePattern = [
      this.text(detail.headline ?? detail.creative?.headline),
      this.text(detail.body ?? detail.creative?.body),
      title,
      ...patternLabels,
    ]
      .filter((value): value is string => Boolean(value))
      .join(' ');
    return {
      recommendedOutputKind: hasVideo ? 'video' : 'image',
      snapshot: {
        canonicalUrl: this.publicUrl(
          detail.previewUrl ?? detail.landingPageUrl,
        ),
        capturedAt: this.runtime.now().toISOString(),
        ...(this.publicUrl(detail.landingPageUrl)
          ? { destinationUrl: this.publicUrl(detail.landingPageUrl) }
          : {}),
        evidence,
        metrics: this.numericRecord(detail.metrics),
        pattern: {
          ...this.patternFromText(sourcePattern, hasVideo ? 'video' : 'image'),
          callToAction: this.text(detail.cta ?? detail.creative?.cta)
            ? 'Close with a clear brand-specific action.'
            : undefined,
          offer: detail.campaignObjective
            ? 'Present a clear brand-specific offer.'
            : undefined,
        },
        platform,
        selector,
        sourceId,
        title,
      },
    };
  }

  private async assertConnectedCredential(
    organizationId: string,
    brandId: string,
    credentialId: string,
    platform: 'google' | 'meta' | 'tiktok',
  ) {
    const credential = await this.prisma.credential.findFirst({
      select: {
        grantedScopes: true,
        grantedScopesCapturedAt: true,
        id: true,
      },
      where: {
        brandId,
        id: credentialId,
        isConnected: true,
        isDeleted: false,
        organizationId,
        platform: this.credentialPlatform(platform),
      },
    });
    if (!credential) {
      throw new BadRequestException({
        detail:
          'The selected ads credential is disconnected or does not belong to this brand.',
        title: 'Ads credential is unavailable',
      });
    }
    return credential;
  }

  private defaultDraft(
    context: ResolvedBrandContext,
    source: ResolvedSource,
  ): BrandRemixDraft {
    const isPaidSource =
      source.snapshot.selector.kind === 'connected_ad' ||
      source.snapshot.selector.kind === 'public_ad';
    const target = isPaidSource
      ? ({ kind: 'paid', platform: source.snapshot.platform } as const)
      : ({
          kind: 'organic',
          platform: this.organicPlatform(source.snapshot.platform),
        } as const);
    const aspectRatio =
      source.snapshot.platform === 'youtube'
        ? '16:9'
        : target.kind === 'paid'
          ? '1:1'
          : '9:16';
    const outputKind =
      source.recommendedOutputKind === 'video' &&
      aspectRatio === '9:16' &&
      'avatarAssetId' in context.defaultIdentity
        ? 'avatar'
        : source.recommendedOutputKind;
    const hookPattern =
      source.snapshot.pattern.hook?.replace(/[.!?]+$/, '') ??
      'performance-led hook';
    const defaultReferences = this.mergeDefaultReferences([], context.brandKit);
    const objective =
      outputKind === 'avatar'
        ? this.defaultAvatarSpeech(context)
        : `Create an original ${source.snapshot.platform} execution for ${context.brand.label} using an evidence-backed ${hookPattern} and wholly original brand expression.`;
    return brandRemixDraftSchema.parse({
      fidelityMode: 'guided',
      identity: context.defaultIdentity,
      intent: {
        callToAction: source.snapshot.pattern.callToAction,
        hook: source.snapshot.pattern.hook,
        objective,
        offer: source.snapshot.pattern.offer,
        pacing: source.snapshot.pattern.pacing,
        structure: source.snapshot.pattern.structure,
        visualDirection: source.snapshot.pattern.visualDirection,
      },
      output: {
        aspectRatio,
        count: 3,
        kind: outputKind,
        ...(outputKind === 'video' ? { durationSeconds: 8 } : {}),
      },
      references: defaultReferences,
      reviewRequired: true,
      target,
    });
  }

  private async resolveDraft(
    organizationId: string,
    brandId: string,
    context: ResolvedBrandContext,
    current: BrandRemixDraft,
    edits?: BrandRemixDraftEdits,
  ): Promise<BrandRemixDraft> {
    if (!edits) {
      await this.assertDraftAssetsAuthorized(organizationId, brandId, current);
      return current;
    }
    const references = edits.references
      ? this.mergeDefaultReferences(edits.references, context.brandKit)
      : current.references;
    const output = this.mergeOutput(current.output, edits.output);
    const intent = { ...current.intent, ...(edits.intent ?? {}) };
    if (
      current.output.kind !== 'avatar' &&
      output.kind === 'avatar' &&
      (!edits.intent?.objective ||
        edits.intent.objective.trim() === current.intent.objective.trim())
    ) {
      intent.objective = this.defaultAvatarSpeech(context);
    }
    const draft = brandRemixDraftSchema.parse({
      ...current,
      ...(edits.fidelityMode ? { fidelityMode: edits.fidelityMode } : {}),
      ...(edits.identity
        ? {
            identity:
              'avatarAssetId' in edits.identity &&
              edits.identity.avatarAssetId === null
                ? {}
                : edits.identity,
          }
        : {}),
      intent,
      output,
      references,
      ...(edits.target ? { target: edits.target } : {}),
    });
    await this.assertDraftAssetsAuthorized(organizationId, brandId, draft);
    return draft;
  }

  private mergeOutput(
    current: BrandRemixDraft['output'],
    patch: BrandRemixDraftEdits['output'],
  ): BrandRemixDraft['output'] {
    if (!patch) return current;
    const kind = patch.kind ?? current.kind;
    const duration =
      patch.durationSeconds === null
        ? undefined
        : (patch.durationSeconds ??
          ('durationSeconds' in current ? current.durationSeconds : undefined));
    if (kind === 'copy') {
      return { count: patch.count ?? current.count, kind };
    }
    const currentAspectRatio =
      'aspectRatio' in current ? current.aspectRatio : '9:16';
    const base = {
      aspectRatio: patch.aspectRatio ?? currentAspectRatio,
      count: patch.count ?? current.count,
    };
    if (kind === 'image') return { ...base, kind };
    return {
      ...base,
      ...(duration !== undefined ? { durationSeconds: duration } : {}),
      kind,
    };
  }

  private mergeDefaultReferences(
    explicit: BrandRemixReferenceEdit[],
    brandKit: IBrandKitResolvedAssets,
  ): BrandRemixDraft['references'] {
    const explicitReferences = explicit.map((reference) => ({
      ...reference,
      source: 'explicit' as const,
    }));
    const explicitRoles = new Set(
      explicitReferences.map((reference) => reference.role),
    );
    const explicitAssetIds = new Set(
      explicitReferences.map((reference) => reference.assetId),
    );
    const defaults = brandKit.references
      .map((asset) => ({
        assetId: asset.id,
        description: asset.label,
        role: this.brandAssetRole(asset.label),
        source: 'brand_default' as const,
      }))
      .filter(
        (reference) =>
          !explicitRoles.has(reference.role) &&
          !explicitAssetIds.has(reference.assetId),
      )
      .slice(0, 3);
    return [...explicitReferences, ...defaults];
  }

  private buildReadiness(
    context: ResolvedBrandContext,
    draft: BrandRemixDraft,
  ): BrandRemixReadiness {
    const issues: BrandRemixReadiness['issues'] = [];
    if (draft.fidelityMode === 'strict') {
      issues.push({
        code: 'unsupported_fidelity',
        field: 'fidelityMode',
        message:
          'Strict fidelity is not supported by the current remix providers. Switch to Guided to generate an original brand execution.',
        severity: 'blocked',
      });
    }
    if (context.contextMode === 'organization_defaults') {
      issues.push({
        code: 'organization_defaults',
        field: 'intent',
        message:
          'This brand has limited creative context, so organization defaults will fill the recipe.',
        severity: 'degraded',
      });
    }
    if (
      'aspectRatio' in draft.output &&
      !SUPPORTED_ASPECT_RATIOS.has(draft.output.aspectRatio)
    ) {
      issues.push({
        code: 'unsupported_aspect_ratio',
        field: 'output',
        message: `Aspect ratio ${draft.output.aspectRatio} is not supported by the remix generation path.`,
        severity: 'blocked',
      });
    }
    if (
      draft.output.kind === 'video' &&
      'durationSeconds' in draft.output &&
      draft.output.durationSeconds !== undefined &&
      (draft.output.durationSeconds < 4 || draft.output.durationSeconds > 60)
    ) {
      issues.push({
        code: 'unsupported_duration',
        field: 'output',
        message: 'Generated video duration must be between 4 and 60 seconds.',
        severity: 'blocked',
      });
    }
    if (
      draft.output.kind === 'avatar' &&
      'durationSeconds' in draft.output &&
      draft.output.durationSeconds !== undefined
    ) {
      issues.push({
        code: 'unsupported_duration',
        field: 'output',
        message:
          'Avatar duration is determined by speech and cannot be fixed in advance.',
        severity: 'degraded',
      });
    }
    if (draft.output.kind === 'avatar') {
      if (!('avatarAssetId' in draft.identity)) {
        issues.push({
          code: 'missing_avatar',
          field: 'avatarAssetId',
          message: 'Choose a brand avatar before generating an avatar remix.',
          severity: 'blocked',
        });
      }
      if (!('speechVoiceId' in draft.identity)) {
        issues.push({
          code: 'missing_voice',
          field: 'speechVoiceId',
          message:
            'Choose a saved brand voice before generating an avatar remix.',
          severity: 'blocked',
        });
      }
    }
    if (
      draft.output.kind === 'image' &&
      draft.references.some(
        (reference) =>
          reference.role === 'first_frame' || reference.role === 'last_frame',
      )
    ) {
      issues.push({
        code: 'unsupported_reference_role',
        field: 'references',
        message: 'First-frame and last-frame references require video output.',
        severity: draft.fidelityMode === 'guided' ? 'degraded' : 'blocked',
      });
    }

    return {
      issues,
      state: issues.some((issue) => issue.severity === 'blocked')
        ? 'blocked'
        : issues.length
          ? 'degraded'
          : 'ready',
    };
  }

  private async assertDraftAssetsAuthorized(
    organizationId: string,
    brandId: string,
    draft: BrandRemixDraft,
  ): Promise<void> {
    const referenceIds = [
      ...new Set(draft.references.map((reference) => reference.assetId)),
    ];
    const identityIds =
      'avatarAssetId' in draft.identity
        ? [draft.identity.avatarAssetId, draft.identity.speechVoiceId]
        : [];
    const ingredientIds = [...new Set([...referenceIds, ...identityIds])];
    const [ingredients, assets] = await Promise.all([
      ingredientIds.length
        ? this.prisma.ingredient.findMany({
            select: {
              brandId: true,
              category: true,
              externalVoiceId: true,
              id: true,
              isCloned: true,
              sampleAudioUrl: true,
              status: true,
            },
            where: scopedWhere(organizationId, {
              id: { in: ingredientIds },
              OR: [{ brandId }, { brandId: null }],
              status: {
                in: [...GENERATION_READY_STATUSES] as IngredientStatus[],
              },
            }),
          })
        : Promise.resolve([]),
      referenceIds.length
        ? this.prisma.asset.findMany({
            select: { id: true },
            where: {
              category: AssetCategory.REFERENCE,
              id: { in: referenceIds },
              isDeleted: false,
              OR: [
                { parentBrandId: brandId, parentOrgId: organizationId },
                { parentBrandId: null, parentOrgId: organizationId },
              ],
            },
          })
        : Promise.resolve([]),
    ]);
    const ingredientById = new Map(
      ingredients.map((ingredient) => [ingredient.id, ingredient]),
    );
    const authorizedIds = new Set([
      ...ingredients.map((ingredient) => ingredient.id),
      ...assets.map((asset) => asset.id),
    ]);
    const missingReferences = referenceIds.filter(
      (referenceId) => !authorizedIds.has(referenceId),
    );
    if (missingReferences.length) {
      throw new BadRequestException({
        detail:
          'One or more remix references are unavailable to this brand or are not generation-ready.',
        title: 'Invalid remix references',
      });
    }

    if ('avatarAssetId' in draft.identity) {
      const avatar = ingredientById.get(draft.identity.avatarAssetId);
      const voice = ingredientById.get(draft.identity.speechVoiceId);
      if (avatar?.category !== IngredientCategory.AVATAR) {
        throw new BadRequestException({
          detail:
            'The selected avatar must be a generation-ready brand avatar.',
          title: 'Invalid remix avatar',
        });
      }
      if (
        voice?.category !== IngredientCategory.VOICE ||
        (!voice.isCloned && !voice.externalVoiceId && !voice.sampleAudioUrl)
      ) {
        throw new BadRequestException({
          detail: 'The selected voice must be a usable saved brand voice.',
          title: 'Invalid remix voice',
        });
      }
    }
  }

  private async assertGeneratedAssetsAuthorized(
    organizationId: string,
    brandId: string,
    ingredientIds: string[],
  ): Promise<void> {
    const uniqueIds = [...new Set(ingredientIds)];
    const ingredients = await this.prisma.ingredient.findMany({
      select: { id: true },
      where: scopedWhere(organizationId, {
        brandId,
        id: { in: uniqueIds },
        status: { in: [...GENERATION_READY_STATUSES] as IngredientStatus[] },
      }),
    });
    if (ingredients.length !== uniqueIds.length) {
      throw new BadRequestException({
        detail:
          'One or more generated assets are unavailable, not ready, or belong to another brand.',
        title: 'Invalid generated remix assets',
      });
    }
  }

  private buildGenerationBrief(
    context: ResolvedBrandContext,
    config: BrandRemixRunConfig,
  ): GenerationBrief {
    const draft = config.draft;
    const references =
      draft.output.kind === 'image' && draft.fidelityMode === 'guided'
        ? draft.references.filter(
            (reference) =>
              reference.role !== 'first_frame' &&
              reference.role !== 'last_frame',
          )
        : draft.references;
    const common = {
      constraints: [
        ...(draft.intent.offer
          ? [
              {
                kind: 'desired_outcome' as const,
                required: false,
                value: `Communicate the offer: ${draft.intent.offer}`,
              },
            ]
          : []),
        {
          kind: 'avoid' as const,
          required: true,
          value:
            'Do not copy, closely paraphrase, quote, or identify the source creative.',
        },
      ],
      fidelityMode: draft.fidelityMode,
      provenance: [
        { field: 'intent.objective', source: 'user' as const },
        { field: 'intent.subjects', source: 'brand' as const },
        { field: 'intent.visualDirection', source: 'performance' as const },
        ...references.map((reference) => ({
          field: `references.${reference.assetId}`,
          source: 'reference' as const,
        })),
      ],
      references: references.map(({ assetId, description, role }) => ({
        assetId,
        ...(description ? { description } : {}),
        role,
      })),
      version: 1 as const,
    };
    const intent = {
      composition: draft.intent.structure,
      objective: draft.intent.objective,
      requestedText: [draft.intent.callToAction, draft.intent.offer].filter(
        (value): value is string => Boolean(value),
      ),
      subjects: [context.brand.label],
      visualDirection: draft.intent.visualDirection,
    };
    if (draft.output.kind === 'copy') {
      return generationBriefSchema.parse({
        ...common,
        intent,
        mediaKind: 'text',
        output: {},
      });
    }
    const output = {
      aspectRatio: draft.output.aspectRatio,
      ...('durationSeconds' in draft.output &&
      draft.output.durationSeconds !== undefined
        ? { durationSeconds: draft.output.durationSeconds }
        : {}),
    };
    if (draft.output.kind === 'image') {
      return generationBriefSchema.parse({
        ...common,
        intent,
        mediaKind: 'image',
        output,
      });
    }
    return generationBriefSchema.parse({
      ...common,
      intent: {
        ...intent,
        audioDirection:
          draft.output.kind === 'avatar'
            ? 'Use the selected saved brand voice.'
            : undefined,
        cinematography: draft.intent.visualDirection,
        motion: draft.intent.pacing,
      },
      mediaKind: 'video',
      output,
    });
  }

  private async dispatchVariant(params: {
    brandId: string;
    config: BrandRemixRunConfig;
    onPlaceholderCreated: GenerationPlaceholderCreatedCallback;
    onCreditsPrepared: () => Promise<void>;
    placeholderScope: GenerationPlaceholderScope;
    request: Request;
    user: User;
  }): Promise<string> {
    const draft = params.config.draft;
    if (draft.output.kind === 'copy') {
      throw new ConflictException(
        'Copy variants use the text generation path.',
      );
    }
    const references = draft.references.map((reference) => reference.assetId);
    const dimensions = this.dimensions(draft.output.aspectRatio);
    const prompt = this.compileProviderPrompt(params.config);

    if (draft.output.kind === 'image') {
      const response = await this.imageGenerationService.generateImage(
        params.user,
        {
          brandId: params.brandId,
          brandingMode: 'brand',
          height: dimensions.height,
          isBrandingEnabled: true,
          outputs: 1,
          references,
          style: draft.intent.visualDirection,
          text: prompt,
          waitForCompletion: false,
          width: dimensions.width,
        } as CreateImageDto,
        params.request,
        params.onPlaceholderCreated,
        params.placeholderScope,
        params.onCreditsPrepared,
      );
      return this.generatedAssetId(response);
    }

    if (draft.output.kind === 'video') {
      const response = await this.videoGenerationService.generateVideo(
        params.user,
        {
          brandId: params.brandId,
          brandingMode: 'brand',
          duration:
            ('durationSeconds' in draft.output &&
              draft.output.durationSeconds) ||
            8,
          height: dimensions.height,
          isBrandingEnabled: true,
          outputs: 1,
          references,
          style: draft.intent.visualDirection,
          text: prompt,
          width: dimensions.width,
        } as CreateVideoDto,
        params.request,
        params.onPlaceholderCreated,
        params.placeholderScope,
        params.onCreditsPrepared,
      );
      return this.generatedAssetId(response);
    }

    if (!('avatarAssetId' in draft.identity)) {
      throw new ConflictException('Avatar identity is not configured.');
    }
    const result = await this.avatarVideoGenerationService.generateAvatarVideo(
      {
        aspectRatio: this.avatarAspectRatio(draft.output.aspectRatio),
        clonedVoiceId: draft.identity.speechVoiceId,
        photoIngredientId: draft.identity.avatarAssetId,
        text: this.compileAvatarSpeech(params.config),
      },
      {
        brandId: params.brandId,
        organizationId: params.user.organizationId,
        userId: params.user.userId ?? params.user.id,
      },
      params.onPlaceholderCreated,
      params.placeholderScope,
      params.onCreditsPrepared,
    );
    return result.ingredientId;
  }

  private compileAvatarSpeech(config: BrandRemixRunConfig): string {
    const speech = config.draft.intent.objective.trim();
    if (!speech) {
      throw new ConflictException('Avatar spoken script is missing.');
    }
    return speech;
  }

  private defaultAvatarSpeech(context: ResolvedBrandContext): string {
    const brandName = context.brand.label.trim();
    return `Meet ${brandName}. Put the outcome first, make the next step clear, and discover what ${brandName} can do for you.`;
  }

  private compileProviderPrompt(config: BrandRemixRunConfig): string {
    const brief = config.execution?.generationBrief;
    if (!brief) {
      throw new ConflictException('Canonical generation brief is missing.');
    }

    const lines = [
      `Objective: ${brief.intent.objective}`,
      brief.intent.subjects.length
        ? `Brand subjects: ${brief.intent.subjects.join(', ')}`
        : undefined,
      brief.intent.composition
        ? `Composition: ${brief.intent.composition}`
        : undefined,
      brief.intent.scene ? `Scene: ${brief.intent.scene}` : undefined,
      brief.intent.lighting ? `Lighting: ${brief.intent.lighting}` : undefined,
      brief.intent.visualDirection
        ? `Visual direction: ${brief.intent.visualDirection}`
        : undefined,
      brief.intent.requestedText.length
        ? `Requested on-creative text: ${brief.intent.requestedText.join(' | ')}`
        : undefined,
      ...brief.references.map(
        (reference, index) =>
          `Reference ${index + 1} role: ${reference.role}${reference.description ? `. Purpose: ${reference.description}` : ''}`,
      ),
      ...brief.constraints.map(
        (constraint) =>
          `${constraint.required ? 'Required' : 'Optional'} ${constraint.kind.replaceAll('_', ' ')} constraint: ${constraint.value}`,
      ),
      brief.output.aspectRatio
        ? `Output aspect ratio: ${brief.output.aspectRatio}`
        : undefined,
      brief.output.width && brief.output.height
        ? `Output dimensions: ${brief.output.width}x${brief.output.height}`
        : undefined,
      brief.mediaKind === 'video' && brief.output.durationSeconds
        ? `Maximum duration: ${brief.output.durationSeconds} seconds`
        : undefined,
      brief.mediaKind === 'video' && brief.intent.motion
        ? `Motion: ${brief.intent.motion}`
        : undefined,
      brief.mediaKind === 'video' && brief.intent.cinematography
        ? `Cinematography: ${brief.intent.cinematography}`
        : undefined,
      brief.mediaKind === 'video' && brief.intent.audioDirection
        ? `Audio direction: ${brief.intent.audioDirection}`
        : undefined,
      config.draft.output.kind === 'avatar'
        ? 'Identity: use the selected saved brand avatar and saved brand voice.'
        : undefined,
    ].filter((line): line is string => Boolean(line));

    return lines.join('\n');
  }

  private generatedAssetId(response: JsonApiSingleResponse): string {
    const id = response.data?.id;
    if (!id) {
      throw new ConflictException(
        'Generation did not return a durable Ingredient ID.',
      );
    }
    return id;
  }

  /**
   * A crash between provider placeholder persistence and config linkage leaves
   * a durable Ingredient that no variant references. Adopt those orphans
   * before re-dispatching so an interrupted run never pays for the same
   * variant twice. The provider prompt is deterministic per recipe revision,
   * so brand-scoped unlinked ingredients compiled for this exact prompt are
   * this run's orphans.
   */
  private async adoptOrphanedPlaceholders(params: {
    brandId: string;
    config: BrandRemixRunConfig;
    organizationId: string;
    runId: string;
    variants: BrandRemixExecution['variants'];
  }): Promise<BrandRemixRunConfig> {
    let config = params.config;
    if (!config.execution) return config;
    if (config.draft.output.kind === 'copy') return config;
    const execution = config.execution;
    const linkedAssetIds = execution.variants.flatMap(
      (variant) => variant.assetIds,
    );
    const category =
      config.draft.output.kind === 'image'
        ? IngredientCategory.IMAGE
        : config.draft.output.kind === 'avatar'
          ? IngredientCategory.AVATAR
          : IngredientCategory.VIDEO;
    const orphans = await this.prisma.ingredient.findMany({
      select: { groupIndex: true, id: true },
      where: scopedWhere(params.organizationId, {
        brandId: params.brandId,
        category,
        groupId: params.runId,
        id: linkedAssetIds.length ? { notIn: linkedAssetIds } : undefined,
        isDeleted: false,
        status: { not: IngredientStatus.FAILED },
      }),
      orderBy: { groupIndex: 'asc' },
      take: params.variants.length,
    });
    for (const orphan of orphans) {
      const variant =
        (orphan.groupIndex == null
          ? undefined
          : execution.variants[orphan.groupIndex]) ??
        execution.variants.find(
          (candidate) =>
            params.variants.some((variant) => variant.id === candidate.id) &&
            candidate.assetIds.length === 0,
        );
      if (!variant) break;
      config = await this.patchGeneratingVariant({
        organizationId: params.organizationId,
        patch: { assetIds: [orphan.id.toString()], status: 'processing' },
        recipeRevision: variant.recipeRevision,
        runId: params.runId,
        status: ContentRunStatus.RUNNING,
        variantId: variant.id,
      });
    }
    return config;
  }

  private async generateCopyVariants(params: {
    brandId: string;
    config: BrandRemixRunConfig;
    organizationId: string;
    request: Request;
    runId: string;
    variants: BrandRemixExecution['variants'];
  }): Promise<BrandRemixRunConfig> {
    const requestedCredits = sourcePostVariationCredits(params.variants.length);
    if (
      !(await this.creditsUtilsService.checkOrganizationCreditsAvailable(
        params.organizationId,
        requestedCredits,
      ))
    ) {
      const balance =
        await this.creditsUtilsService.getOrganizationCreditsBalance(
          params.organizationId,
        );
      throw createInsufficientCreditsException(requestedCredits, balance);
    }
    let config = params.config;
    const seen = new Set(
      config.execution?.variants.flatMap((variant) =>
        variant.status === 'ready' && variant.content
          ? [variant.content.trim()]
          : [],
      ) ?? [],
    );
    let successfulCount = 0;
    for (const variant of params.variants) {
      config = await this.patchGeneratingVariant({
        organizationId: params.organizationId,
        patch: { error: undefined, status: 'processing' },
        recipeRevision: variant.recipeRevision,
        runId: params.runId,
        status: ContentRunStatus.RUNNING,
        variantId: variant.id,
      });
      try {
        const generated = await this.contentGeneratorService.generateContent(
          params.organizationId,
          {
            additionalContext: [
              `Source pattern: ${JSON.stringify(params.config.sourceSnapshot.pattern)}`,
              `Target platform: ${params.config.draft.target.platform}`,
              'Create original brand-owned copy. Never quote, name, or closely paraphrase the source.',
            ],
            brandId: params.brandId,
            platform: this.contentIntelligencePlatform(
              params.config.draft.target.platform,
            ),
            topic: this.compileProviderPrompt(params.config),
            variationsCount: 1,
          },
        );
        const content = generated[0]?.content.trim();
        if (!content || seen.has(content)) {
          throw new ConflictException(
            'The content engine returned no distinct usable copy.',
          );
        }
        seen.add(content);
        successfulCount += 1;
        config = await this.patchGeneratingVariant({
          organizationId: params.organizationId,
          patch: { content, error: undefined, status: 'ready' },
          recipeRevision: variant.recipeRevision,
          runId: params.runId,
          status: ContentRunStatus.RUNNING,
          variantId: variant.id,
        });
      } catch (error: unknown) {
        config = await this.patchGeneratingVariant({
          organizationId: params.organizationId,
          patch: {
            content: undefined,
            error: this.errorMessage(error),
            status: 'failed',
          },
          recipeRevision: variant.recipeRevision,
          runId: params.runId,
          status: ContentRunStatus.RUNNING,
          variantId: variant.id,
        });
      }
    }
    const actualCount =
      config.execution?.variants.filter((variant) => variant.status === 'ready')
        .length ?? 0;
    finalizeOutputCredits(
      params.request,
      sourcePostVariationCredits(successfulCount),
    );
    const execution = config.execution;
    if (!execution) return config;
    const nextConfig = brandRemixRunConfigSchema.parse({
      ...config,
      execution: {
        ...execution,
        actualCount,
        ...(actualCount < execution.requestedCount
          ? {
              partialReason: `${execution.requestedCount - actualCount} requested copy outputs were not distinct and usable.`,
            }
          : { partialReason: undefined }),
      },
      phase:
        actualCount === execution.requestedCount
          ? 'ready_for_review'
          : actualCount > 0
            ? 'partially_ready'
            : 'failed',
    });
    const updated = await this.compareAndSwapExactConfig({
      expectedConfig: config,
      nextConfig,
      organizationId: params.organizationId,
      runId: params.runId,
      status:
        actualCount > 0 ? ContentRunStatus.COMPLETED : ContentRunStatus.FAILED,
    });
    if (!updated) {
      throw new ConflictException(
        'The copy generation result changed concurrently.',
      );
    }
    return nextConfig;
  }

  private async recoverStalledReservations(params: {
    brandId: string;
    config: BrandRemixRunConfig;
    organizationId: string;
    runId: string;
  }): Promise<BrandRemixRunConfig> {
    const processing =
      params.config.execution?.variants.filter(
        (variant) =>
          variant.status === 'processing' && variant.assetIds.length > 0,
      ) ?? [];
    if (processing.length === 0) return params.config;
    const ingredients = await this.prisma.ingredient.findMany({
      select: {
        id: true,
        metadata: { select: { externalId: true } },
        status: true,
      },
      where: scopedWhere(params.organizationId, {
        brandId: params.brandId,
        groupId: params.runId,
        id: { in: processing.flatMap((variant) => variant.assetIds) },
      }),
    });
    const byId = new Map(
      ingredients.map((ingredient) => [ingredient.id, ingredient]),
    );
    let config = params.config;
    for (const variant of processing) {
      const reservations = variant.assetIds
        .map((assetId) => byId.get(assetId))
        .filter((ingredient) => ingredient !== undefined);
      const undispatched =
        reservations.length === variant.assetIds.length &&
        reservations.every(
          (ingredient) =>
            ingredient.status === IngredientStatus.PROCESSING &&
            !ingredient.metadata?.externalId,
        );
      if (!undispatched) continue;
      await this.prisma.ingredient.updateMany({
        data: { status: IngredientStatus.FAILED },
        where: scopedWhere(params.organizationId, {
          brandId: params.brandId,
          id: { in: variant.assetIds },
        }),
      });
      config = await this.patchGeneratingVariant({
        organizationId: params.organizationId,
        patch: {
          assetIds: [],
          error:
            'Recovered a run-scoped reservation that never reached its provider.',
          status: 'queued',
        },
        recipeRevision: variant.recipeRevision,
        runId: params.runId,
        status: ContentRunStatus.RUNNING,
        variantId: variant.id,
      });
    }
    return config;
  }

  private contentIntelligencePlatform(
    platform: BrandRemixDraft['target']['platform'],
  ): ContentIntelligencePlatform {
    return platform === 'tiktok'
      ? ContentIntelligencePlatform.TIKTOK
      : ContentIntelligencePlatform.INSTAGRAM;
  }

  private async clearGenerationClaimAndProject(params: {
    brandContext: ResolvedBrandContext;
    config: BrandRemixRunConfig;
    organizationId: string;
    run: BrandRemixRunRecord;
    runId: string;
  }): Promise<BrandRemixRunView> {
    if (!params.config.generationClaim) {
      return this.project(params.run, params.brandContext, params.config);
    }
    const nextConfig = brandRemixRunConfigSchema.parse({
      ...params.config,
      generationClaim: undefined,
    });
    const updated = await this.compareAndSwapExactConfig({
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
      const latest = await this.requireRun(params.organizationId, params.runId);
      return this.project(
        latest,
        params.brandContext,
        this.parseConfig(latest.config, latest.id),
      );
    }
    return this.project(updated, params.brandContext, nextConfig);
  }

  private async reconcile(
    run: BrandRemixRunRecord,
    attempt = 0,
  ): Promise<{ config: BrandRemixRunConfig; run: BrandRemixRunRecord }> {
    const originalConfig = this.parseConfig(run.config, run.id);
    let config = originalConfig;
    let status =
      (run.status as ContentRunStatus | null) ?? ContentRunStatus.PENDING;
    let changed = false;

    if (config.execution) {
      const assetIds = [
        ...new Set(
          config.execution.variants.flatMap((variant) => variant.assetIds),
        ),
      ];
      const ingredients = assetIds.length
        ? await this.prisma.ingredient.findMany({
            select: { id: true, status: true },
            where: scopedWhere(run.organizationId, {
              brandId: this.requireBrandId(run),
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
      changed ||=
        actualCount !== config.execution.actualCount || phase !== config.phase;
      config = brandRemixRunConfigSchema.parse({
        ...config,
        execution: {
          ...config.execution,
          actualCount,
          variants,
        },
        phase,
      });
    }

    if (config.review?.postIds.length) {
      const posts = await this.prisma.post.findMany({
        select: { id: true, reviewDecision: true },
        where: scopedWhere(run.organizationId, {
          brandId: this.requireBrandId(run),
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
      changed ||=
        approvedPostIds.length !== config.review.approvedPostIds.length ||
        phase !== config.phase;
      config = brandRemixRunConfigSchema.parse({
        ...config,
        phase,
        review: { ...config.review, approvedPostIds },
      });
      if (approved && phase !== 'paid_draft_creating') {
        status = ContentRunStatus.COMPLETED;
      }
    }

    if (!changed && run.status === status) return { config, run };
    const updated = await this.compareAndSwapExactConfig({
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
      await this.requireRun(run.organizationId, run.id),
      attempt + 1,
    );
  }

  private updateVariant(
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

  private async patchGeneratingVariant(params: {
    organizationId: string;
    patch: Partial<BrandRemixExecution['variants'][number]>;
    recipeRevision: number;
    runId: string;
    status: ContentRunStatus;
    variantId: string;
  }): Promise<BrandRemixRunConfig> {
    for (let attempt = 0; attempt < MAX_VARIANT_PATCH_RETRIES; attempt += 1) {
      const run = await this.requireRun(params.organizationId, params.runId);
      const current = this.parseConfig(run.config, run.id);
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
      const updated = await this.compareAndSwapExactConfig({
        expectedConfig: current,
        nextConfig: next,
        organizationId: params.organizationId,
        runId: params.runId,
        status: params.status,
      });
      if (updated) return this.parseConfig(updated.config, updated.id);
    }

    throw new ConflictException({
      detail:
        'The remix changed repeatedly while its generation placeholder was being linked.',
      title: 'Remix placeholder linkage conflict',
    });
  }

  private async compareAndSwapExactConfig(params: {
    expectedConfig: BrandRemixRunConfig;
    nextConfig: BrandRemixRunConfig;
    organizationId: string;
    runId: string;
    status: ContentRunStatus;
  }): Promise<BrandRemixRunRecord | null> {
    const result = await this.prisma.contentRun.updateMany({
      data: {
        config: this.toJson(params.nextConfig),
        status: params.status,
      },
      where: scopedWhere(params.organizationId, {
        config: { equals: this.toJson(params.expectedConfig) },
        id: params.runId,
      }),
    });
    return result.count === 1
      ? this.requireRun(params.organizationId, params.runId)
      : null;
  }

  private async compareAndSwapConfig(params: {
    expectedPhase: BrandRemixRunConfig['phase'];
    expectedRevision: number;
    nextConfig: BrandRemixRunConfig;
    organizationId: string;
    runId: string;
    status: ContentRunStatus;
  }): Promise<BrandRemixRunRecord> {
    const result = await this.prisma.contentRun.updateMany({
      data: {
        config: this.toJson(params.nextConfig),
        status: params.status,
      },
      where: scopedWhere(params.organizationId, {
        AND: [
          {
            config: {
              equals: params.expectedRevision,
              path: ['revision'],
            },
          },
          {
            config: {
              equals: params.expectedPhase,
              path: ['phase'],
            },
          },
        ],
        id: params.runId,
      }),
    });
    if (result.count !== 1) {
      throw new ConflictException({
        detail:
          'The remix changed while this request was in progress. Reload it and retry.',
        title: 'Stale remix revision',
      });
    }
    return this.requireRun(params.organizationId, params.runId);
  }

  private async requireRun(
    organizationId: string,
    runId: string,
  ): Promise<BrandRemixRunRecord> {
    const run = await this.prisma.contentRun.findFirst({
      select: RUN_SELECT,
      where: scopedWhere(organizationId, { id: runId }),
    });
    if (!run) throw new NotFoundException('Brand remix run', runId);
    this.parseConfig(run.config, runId);
    return run;
  }

  private project(
    run: BrandRemixRunRecord,
    brandContext: ResolvedBrandContext,
    config: BrandRemixRunConfig,
  ): BrandRemixRunView {
    return brandRemixRunViewSchema.parse({
      ...config,
      brand: {
        contextMode: brandContext.contextMode,
        id: brandContext.brand.id,
        name: brandContext.brand.label,
      },
      brandId: this.requireBrandId(run),
      contract: BRAND_REMIX_RUN_CONTRACT,
      createdAt: this.iso(run.createdAt),
      id: run.id,
      status:
        (run.status as ContentRunStatus | null) ?? ContentRunStatus.PENDING,
      updatedAt: this.iso(run.updatedAt),
      version: BRAND_REMIX_RUN_VERSION,
    });
  }

  private parseConfig(
    value: Prisma.JsonValue,
    runId: string,
  ): BrandRemixRunConfig {
    const parsed = brandRemixRunConfigSchema.safeParse(value);
    if (!parsed.success) {
      throw new NotFoundException('Brand remix run', runId);
    }
    return parsed.data;
  }

  private async createOrReusePrefilledRun(params: {
    brandId: string;
    config: BrandRemixRunConfig;
    organizationId: string;
    selector: BrandRemixSourceSelector;
  }): Promise<BrandRemixRunRecord> {
    for (let attempt = 0; attempt < MAX_SERIALIZATION_RETRIES; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (transaction) => {
            const client =
              transaction as unknown as ContentRunPersistenceClient;
            const reusable = await this.findReusablePrefilledRun(
              params.organizationId,
              params.brandId,
              params.selector,
              client,
            );
            if (reusable) return reusable;

            return client.contentRun.create({
              data: {
                brandId: params.brandId,
                config: this.toJson(params.config),
                isDeleted: false,
                organizationId: params.organizationId,
                status: ContentRunStatus.PENDING,
              },
              select: RUN_SELECT,
            });
          },
          { isolationLevel: 'Serializable' },
        );
      } catch (error: unknown) {
        if (
          (error as { code?: string }).code === PRISMA_SERIALIZATION_FAILURE &&
          attempt < MAX_SERIALIZATION_RETRIES - 1
        ) {
          continue;
        }
        throw error;
      }
    }

    throw new ConflictException({
      detail: 'Concurrent remix preparation did not settle. Retry the request.',
      title: 'Remix preparation conflict',
    });
  }

  private findReusablePrefilledRun(
    organizationId: string,
    brandId: string,
    selector: BrandRemixSourceSelector,
    client: ContentRunPersistenceClient = this.prisma,
  ): Promise<BrandRemixRunRecord | null> {
    return client.contentRun.findFirst({
      orderBy: { createdAt: 'desc' },
      select: RUN_SELECT,
      where: scopedWhere(organizationId, {
        AND: [
          {
            config: {
              equals: this.toJson(selector),
              path: ['sourceSnapshot', 'selector'],
            },
          },
          { config: { equals: 'prefilled', path: ['phase'] } },
        ],
        brandId,
        status: ContentRunStatus.PENDING,
      }),
    });
  }

  private parse<T>(schema: ZodType<T>, body: unknown, action: string): T {
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw this.invalidPayload(action, parsed.error);
    return parsed.data;
  }

  private invalidPayload(action: string, error: ZodError): BadRequestException {
    return new BadRequestException({
      detail: error.issues
        .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
        .join('; '),
      title: `Invalid brand remix ${action} payload`,
    });
  }

  private staleRevision(expected: number, actual: number): ConflictException {
    return new ConflictException({
      detail: `Expected remix revision ${expected}, but the current revision is ${actual}.`,
      title: 'Stale remix revision',
    });
  }

  private requireBrandId(run: BrandRemixRunRecord): string {
    if (!run.brandId) {
      throw new ConflictException('Brand remix run has no owning brand.');
    }
    return run.brandId;
  }

  private hasBrandContext(
    brand: BrandDocument,
    brandKit: IBrandKitResolvedAssets,
  ): boolean {
    return Boolean(
      this.text(brand.description) ||
        this.text(brand.text) ||
        Object.keys(this.record(brand.agentConfig)).length ||
        brandKit.references.length,
    );
  }

  private brandAssetRole(
    label?: string,
  ): BrandRemixDraft['references'][number]['role'] {
    const normalized = label?.toLowerCase() ?? '';
    if (normalized.includes('product')) return 'product';
    if (normalized.includes('character') || normalized.includes('person')) {
      return 'character';
    }
    if (normalized.includes('composition') || normalized.includes('layout')) {
      return 'composition';
    }
    return 'style';
  }

  private sourcePlatform(value: unknown): BrandRemixSourceSnapshot['platform'] {
    const normalized = this.text(value)?.toLowerCase();
    if (
      normalized === 'tiktok' ||
      normalized === 'instagram' ||
      normalized === 'youtube' ||
      normalized === 'meta' ||
      normalized === 'google'
    ) {
      return normalized;
    }
    if (normalized === 'facebook' || normalized === 'facebook_ads')
      return 'meta';
    if (normalized === 'google_ads') return 'google';
    throw new BadRequestException({
      detail: `Source platform ${normalized ?? 'unknown'} is not supported for a brand remix.`,
      title: 'Unsupported remix source platform',
    });
  }

  private organicPlatform(
    platform: BrandRemixSourceSnapshot['platform'],
  ): 'instagram' | 'tiktok' | 'youtube' {
    if (
      platform === 'instagram' ||
      platform === 'tiktok' ||
      platform === 'youtube'
    ) {
      return platform;
    }
    throw new BadRequestException({
      detail: `Organic remix output is not supported for ${platform}. Choose Instagram, TikTok, or YouTube.`,
      title: 'Unsupported organic remix target',
    });
  }

  private credentialPlatform(
    platform: 'google' | 'meta' | 'tiktok',
  ): CredentialPlatform {
    if (platform === 'meta') return CredentialPlatform.FACEBOOK;
    if (platform === 'google') return CredentialPlatform.GOOGLE_ADS;
    return CredentialPlatform.TIKTOK;
  }

  private isVideoMedia(kind: unknown, urls: string[] = []): boolean {
    const normalizedKind = this.text(kind)?.toLowerCase() ?? '';
    if (
      normalizedKind.includes('video') ||
      normalizedKind.includes('reel') ||
      normalizedKind.includes('short')
    ) {
      return true;
    }
    return urls.some((value) => {
      try {
        return /\.(?:m4v|mov|mp4|webm)$/i.test(new URL(value).pathname);
      } catch {
        return /\.(?:m4v|mov|mp4|webm)(?:$|[?#])/i.test(value);
      }
    });
  }

  private patternFromText(
    text: string,
    mediaKind?: string,
  ): BrandRemixSourceSnapshot['pattern'] {
    const normalized = text.toLowerCase();
    const usesTransformation =
      /\b(after|before|but|instead|new|old|then|transform)\b/.test(normalized);
    const usesInstruction = /\b(how|step|steps|tip|tips|way|ways)\b/.test(
      normalized,
    );
    const usesSpecificResult = /\b\d+(?:[.,]\d+)?%?\b/.test(normalized);
    const usesQuestion = text.includes('?');
    const hook = usesQuestion
      ? 'Question-led curiosity hook.'
      : usesSpecificResult
        ? 'Specific-result-led hook.'
        : usesInstruction
          ? 'Instruction-led value hook.'
          : usesTransformation
            ? 'Problem-to-transformation hook.'
            : 'Outcome-led relevance hook.';
    const structure = usesInstruction
      ? 'State the useful outcome, demonstrate concise steps, provide proof, then close with a brand-specific action.'
      : usesTransformation
        ? 'Establish the friction, reveal the transformation, provide proof, then close with a brand-specific action.'
        : 'Lead with a clear outcome, support it with proof, then close with a brand-specific action.';
    const isVideo = mediaKind?.toLowerCase().includes('video') === true;
    return {
      hook,
      pacing: isVideo
        ? 'Fast opening, one clear proof beat, and a decisive close.'
        : undefined,
      structure,
      visualDirection: isVideo
        ? 'Use an original motion-led execution centered on the brand identity and product.'
        : 'Use an original brand-owned composition centered on the product and intended outcome.',
    };
  }

  private numericRecord(value: unknown): Record<string, number> {
    return Object.fromEntries(
      Object.entries(this.record(value)).flatMap(([key, entry]) =>
        typeof entry === 'number' && Number.isFinite(entry)
          ? [[key.slice(0, 100), entry]]
          : [],
      ),
    );
  }

  private record(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private stringArray(value: unknown): string[] {
    return Array.isArray(value)
      ? value.flatMap((entry) =>
          typeof entry === 'string' && entry.trim()
            ? [this.truncate(entry)]
            : [],
        )
      : [];
  }

  private text(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private truncate(value: string, max = 1_000): string {
    return Array.from(value.trim()).slice(0, max).join('');
  }

  private publicUrl(value: unknown): string | undefined {
    const text = this.text(value);
    if (!text) return undefined;
    try {
      const url = new URL(text);
      return url.protocol === 'https:' || url.protocol === 'http:'
        ? `${url.origin}${url.pathname}`
        : undefined;
    } catch {
      return undefined;
    }
  }

  private dimensions(aspectRatio: string): GenerationDimensions {
    switch (aspectRatio) {
      case '9:16':
        return { height: 1920, width: 1080 };
      case '16:9':
        return { height: 1080, width: 1920 };
      case '4:5':
        return { height: 1350, width: 1080 };
      default:
        return { height: 1024, width: 1024 };
    }
  }

  private avatarAspectRatio(value: string): '1:1' | '9:16' | '16:9' {
    return value === '16:9' || value === '1:1' ? value : '9:16';
  }

  private errorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return this.truncate(message || 'Generation failed', MAX_ERROR_LENGTH);
  }

  private iso(value: Date | string): string {
    return value instanceof Date
      ? value.toISOString()
      : new Date(value).toISOString();
  }

  private toJson(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
  }
}
