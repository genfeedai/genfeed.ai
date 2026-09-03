import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import {
  BRAND_REMIX_EXECUTE_ACTION_IDS,
  BRAND_REMIX_EXECUTE_WORKFLOW_IDS,
  buildBrandRemixExecuteWorkflowDefinition,
} from '@api/collections/content-runs/services/brand-remix-execute-workflow-definition';
import { remixErrorMessage } from '@api/collections/content-runs/services/brand-remix-run-helpers';
import { BrandRemixRunPersistenceService } from '@api/collections/content-runs/services/brand-remix-run-persistence.service';
import { BrandRemixRunPlanningService } from '@api/collections/content-runs/services/brand-remix-run-planning.service';
import { projectBrandRemixRun } from '@api/collections/content-runs/services/brand-remix-run-projection';
import { BrandRemixRunProviderDispatchService } from '@api/collections/content-runs/services/brand-remix-run-provider-dispatch.service';
import { BrandRemixRunStateService } from '@api/collections/content-runs/services/brand-remix-run-state.service';
import {
  type BrandRemixRunRecord,
  GENERATION_CLAIM_LEASE_MS,
  type RemixCreditsRequest,
  type ResolvedBrandContext,
} from '@api/collections/content-runs/services/brand-remix-runs.types';
import {
  BRAND_REMIX_RUNTIME,
  type BrandRemixRuntime,
} from '@api/collections/content-runs/services/brand-remix-runtime';
import { GenerationReservationBarrier } from '@api/collections/content-runs/services/generation-reservation-barrier';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { SystemWorkflowActionRequest } from '@api/collections/workflows/system-workflow-runner.service';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import type { RequestWithContext as Request } from '@api/common/middleware/request-context.middleware';
import { finalizeOutputCredits } from '@api/helpers/utils/credits/finalize-deferred-credits.util';
import { createInsufficientCreditsException } from '@api/helpers/utils/credits/insufficient-credits.util';
import { scopedWhere } from '@api/index';
import { ByokService } from '@api/services/byok/byok.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ByokProvider,
  ContentRunStatus,
  IngredientCategory,
  IngredientStatus,
} from '@genfeedai/contracts';
import {
  type BrandRemixExecution,
  type BrandRemixRunConfig,
  type BrandRemixRunView,
  brandRemixRunConfigSchema,
  type StartBrandRemixRun,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import {
  AVATAR_GENERATION_CREDIT_COST,
  MODEL_KEYS,
} from '@genfeedai/contracts/constants';
import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  type OnModuleInit,
} from '@nestjs/common';

type BrandRemixExecuteRuntime = {
  request: Request;
  user: User;
};

type BrandRemixExecuteState = {
  avatarByokBypass: boolean;
  brandContext: ResolvedBrandContext;
  brandId: string;
  config: BrandRemixRunConfig;
  hasWork: boolean;
  isCopy: boolean;
  items: BrandRemixVariantItem[];
  organizationId: string;
  recipeRevision: number;
  run: BrandRemixRunRecord;
  runId: string;
  view?: BrandRemixRunView;
};

type BrandRemixVariantItem = {
  avatarByokBypass: boolean;
  brandId: string;
  config: BrandRemixRunConfig;
  organizationId: string;
  recipeRevision: number;
  runId: string;
  variant: BrandRemixExecution['variants'][number];
};

@Injectable()
export class BrandRemixRunExecutionService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly planning: BrandRemixRunPlanningService,
    private readonly persistence: BrandRemixRunPersistenceService,
    private readonly state: BrandRemixRunStateService,
    private readonly dispatch: BrandRemixRunProviderDispatchService,
    private readonly creditsUtilsService: CreditsUtilsService,
    private readonly byokService: ByokService,
    private readonly systemWorkflowRunner: SystemWorkflowRunnerService,
    @Inject(BRAND_REMIX_RUNTIME)
    private readonly runtime: BrandRemixRuntime,
  ) {}

  onModuleInit(): void {
    this.systemWorkflowRunner.registerAction(
      BRAND_REMIX_EXECUTE_ACTION_IDS.PREPARE,
      (request) => this.prepareAction(request),
    );
    this.systemWorkflowRunner.registerAction(
      BRAND_REMIX_EXECUTE_ACTION_IDS.CLAIM,
      (request) => this.claimAction(request),
    );
    this.systemWorkflowRunner.registerAction(
      BRAND_REMIX_EXECUTE_ACTION_IDS.ADOPT_ORPHANS,
      (request) => this.adoptOrphansAction(request),
    );
    this.systemWorkflowRunner.registerAction(
      BRAND_REMIX_EXECUTE_ACTION_IDS.GENERATE_COPY,
      (request) => this.generateCopyAction(request),
    );
    this.systemWorkflowRunner.registerAction(
      BRAND_REMIX_EXECUTE_ACTION_IDS.DISPATCH_MEDIA,
      (request) => this.dispatchMediaAction(request),
    );
    this.systemWorkflowRunner.registerAction(
      BRAND_REMIX_EXECUTE_ACTION_IDS.RECONCILE,
      (request) => this.reconcileAction(request),
    );
    this.systemWorkflowRunner.registerAction(
      BRAND_REMIX_EXECUTE_ACTION_IDS.PROJECT,
      (request) => this.projectAction(request),
    );
    this.systemWorkflowRunner.registerWorkflow(
      buildBrandRemixExecuteWorkflowDefinition(),
    );
  }

  async start(
    organizationId: string,
    runId: string,
    user: User,
    request: Request,
    input: StartBrandRemixRun,
  ): Promise<BrandRemixRunView> {
    const { result } =
      await this.systemWorkflowRunner.runWorkflow<BrandRemixRunView>({
        actionType: BRAND_REMIX_EXECUTE_WORKFLOW_IDS.EXECUTE,
        canonicalId: BRAND_REMIX_EXECUTE_WORKFLOW_IDS.EXECUTE,
        inputValues: {
          request: {
            expectedRevision: input.expectedRevision,
            organizationId,
            runId,
          },
        },
        organizationId,
        runtimeContext: { request, user } satisfies BrandRemixExecuteRuntime,
        source: 'BrandRemixRunsService.start',
        userId: user.userId ?? user.id,
      });
    return result;
  }

  private unwrapState(value: unknown): BrandRemixExecuteState {
    if (value && typeof value === 'object' && 'data' in value) {
      return (value as { data: BrandRemixExecuteState }).data;
    }
    return value as BrandRemixExecuteState;
  }

  private runtimeOf(
    request: SystemWorkflowActionRequest,
  ): BrandRemixExecuteRuntime {
    const runtime = request.runtimeContext as
      | BrandRemixExecuteRuntime
      | undefined;
    if (!runtime?.request || !runtime.user) {
      throw new ConflictException(
        'Brand remix generation requires the originating request context.',
      );
    }
    return runtime;
  }

  private async prepareAction(
    request: SystemWorkflowActionRequest,
  ): Promise<BrandRemixExecuteState> {
    const payload = this.readRecord(request.input.request);
    const organizationId = this.requiredString(
      payload.organizationId,
      'organizationId',
    );
    const runId = this.requiredString(payload.runId, 'runId');
    const expectedRevision = this.requiredNumber(
      payload.expectedRevision,
      'expectedRevision',
    );
    const { request: httpRequest } = this.runtimeOf(request);
    const prepared = await this.prepareStart(
      organizationId,
      runId,
      httpRequest,
      { expectedRevision },
    );
    return {
      avatarByokBypass: prepared.avatarByokBypass,
      brandContext: prepared.brandContext,
      brandId: prepared.brandId,
      config: prepared.config,
      hasWork: false,
      isCopy: prepared.config.draft.output.kind === 'copy',
      items: [],
      organizationId,
      recipeRevision: prepared.config.revision,
      run: prepared.run,
      runId,
    };
  }

  private async claimAction(
    request: SystemWorkflowActionRequest,
  ): Promise<BrandRemixExecuteState> {
    const state = this.unwrapState(request.input.state);
    const claimed = await this.claimGeneration({
      avatarByokBypass: state.avatarByokBypass,
      brandContext: state.brandContext,
      brandId: state.brandId,
      config: state.config,
      run: state.run,
    });
    if (claimed.view) {
      return {
        ...state,
        config: claimed.config,
        hasWork: false,
        items: [],
        run: claimed.run,
        view: claimed.view,
      };
    }
    return {
      ...state,
      config: claimed.config,
      hasWork: claimed.resumable.length > 0,
      items: claimed.resumable.map((variant) => ({
        avatarByokBypass: state.avatarByokBypass,
        brandId: state.brandId,
        config: claimed.config,
        organizationId: state.organizationId,
        recipeRevision: state.recipeRevision,
        runId: state.runId,
        variant,
      })),
      run: claimed.run,
    };
  }

  private async adoptOrphansAction(
    request: SystemWorkflowActionRequest,
  ): Promise<BrandRemixExecuteState> {
    const state = this.unwrapState(request.input.state);
    if (state.view || !state.hasWork) return state;
    const stuck = state.items
      .map((item) => item.variant)
      .filter((variant) => variant.status === 'processing');
    if (!stuck.length) return state;
    const config = await this.adoptOrphanedPlaceholders({
      brandId: state.brandId,
      config: state.config,
      organizationId: state.organizationId,
      runId: state.runId,
      variants: stuck,
    });
    const items = state.items.flatMap((item) => {
      const current = config.execution?.variants.find(
        (candidate) => candidate.id === item.variant.id,
      );
      if (current?.assetIds.length) return [];
      return [{ ...item, config, variant: current ?? item.variant }];
    });
    return {
      ...state,
      config,
      hasWork: items.length > 0,
      items,
    };
  }

  private async generateCopyAction(
    request: SystemWorkflowActionRequest,
  ): Promise<BrandRemixExecuteState> {
    const state = this.unwrapState(request.input.state);
    if (state.view || !state.hasWork || !state.isCopy) return state;
    const { request: httpRequest } = this.runtimeOf(request);
    const config = await this.dispatch.generateCopyVariants({
      brandId: state.brandId,
      config: state.config,
      organizationId: state.organizationId,
      request: httpRequest,
      runId: state.runId,
      variants: state.items.map((item) => item.variant),
    });
    return { ...state, config, hasWork: false, items: [] };
  }

  private async dispatchMediaAction(
    request: SystemWorkflowActionRequest,
  ): Promise<BrandRemixExecuteState> {
    const state = this.unwrapState(request.input.state);
    if (state.view || !state.hasWork || state.isCopy) return state;
    const { request: httpRequest, user } = this.runtimeOf(request);
    await this.dispatchMediaVariants({
      avatarByokBypass: state.avatarByokBypass,
      brandId: state.brandId,
      config: state.config,
      generationUser: { ...user, brandId: state.brandId },
      organizationId: state.organizationId,
      recipeRevision: state.recipeRevision,
      request: httpRequest,
      runId: state.runId,
      variants: state.items.map((item) => item.variant),
    });
    return state;
  }

  private async reconcileAction(
    request: SystemWorkflowActionRequest,
  ): Promise<BrandRemixExecuteState> {
    const state = this.unwrapState(request.input.state);
    if (state.view) return state;
    const reconciled = await this.state.reconcile(
      await this.persistence.requireRun(state.organizationId, state.runId),
    );
    return {
      ...state,
      config: reconciled.config,
      run: reconciled.run,
    };
  }

  private async projectAction(
    request: SystemWorkflowActionRequest,
  ): Promise<BrandRemixRunView> {
    const state = this.unwrapState(request.input.state);
    if (state.view) return state.view;
    return this.state.clearGenerationClaimAndProject({
      brandContext: state.brandContext,
      config: state.config,
      organizationId: state.organizationId,
      run: state.run,
      runId: state.runId,
    });
  }

  private readRecord(value: unknown): Record<string, unknown> {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new ConflictException('Brand remix workflow requires an object.');
    }
    return value as Record<string, unknown>;
  }

  private requiredString(value: unknown, field: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new ConflictException(`Brand remix workflow requires ${field}.`);
    }
    return value.trim();
  }

  private requiredNumber(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new ConflictException(
        `Brand remix workflow requires numeric ${field}.`,
      );
    }
    return value;
  }

  private async prepareStart(
    organizationId: string,
    runId: string,
    request: Request,
    input: StartBrandRemixRun,
  ): Promise<{
    avatarByokBypass: boolean;
    brandContext: ResolvedBrandContext;
    brandId: string;
    config: BrandRemixRunConfig;
    run: BrandRemixRunRecord;
  }> {
    let run = await this.persistence.requireRun(organizationId, runId);
    let config = this.persistence.parseConfig(run.config, runId);
    if (config.revision !== input.expectedRevision) {
      throw new ConflictException({
        detail: `Expected remix revision ${input.expectedRevision}, but the current revision is ${config.revision}.`,
        title: 'Stale remix revision',
      });
    }
    const brandId = this.persistence.requireBrandId(run);
    const brandContext = await this.planning.resolveBrandContext(
      organizationId,
      brandId,
    );

    if (config.execution) {
      const reconciled = await this.state.reconcile(run);
      run = reconciled.run;
      config = reconciled.config;
    } else if (config.phase !== 'prefilled' && config.phase !== 'failed') {
      throw new ConflictException({
        detail: `A remix cannot start generation from phase ${config.phase}.`,
        title: 'Remix generation unavailable',
      });
    }

    await this.planning.assertDraftAssetsAuthorized(
      organizationId,
      brandId,
      config.draft,
    );
    const readiness = this.planning.buildReadiness(brandContext, config.draft);
    if (readiness.state === 'blocked') {
      throw new ConflictException({
        detail: readiness.issues.map((issue) => issue.message).join('; '),
        title: 'Remix generation is blocked',
      });
    }

    await this.planning.resolveSource(
      organizationId,
      brandId,
      config.sourceSnapshot.selector,
    );
    const avatarByokBypass = await this.applyAvatarCreditPolicy(
      organizationId,
      config,
      request,
    );
    const ensured = await this.ensureExecutionRecord({
      brandContext,
      config,
      organizationId,
      readiness,
      run,
      runId,
    });
    return {
      avatarByokBypass,
      brandContext,
      brandId,
      config: ensured.config,
      run: ensured.run,
    };
  }

  private async applyAvatarCreditPolicy(
    organizationId: string,
    config: BrandRemixRunConfig,
    request: Request,
  ): Promise<boolean> {
    if (
      config.draft.output.kind === 'avatar' &&
      !(request as RemixCreditsRequest).creditsConfig
    ) {
      throw new ConflictException(
        'Avatar remix generation requires a deferred credit reservation.',
      );
    }
    const avatarByokBypass =
      config.draft.output.kind === 'avatar' &&
      (await this.byokService.isByokActiveForProvider(
        organizationId,
        ByokProvider.HEYGEN,
      ));
    if (
      avatarByokBypass &&
      !(await this.byokService.isByokBillingInGoodStanding(organizationId))
    ) {
      throw new HttpException(
        {
          detail:
            'BYOK access is suspended due to an unpaid platform fee invoice. Please update your payment method or purchase a credit pack.',
          title: 'BYOK billing past due',
        },
        HttpStatus.FORBIDDEN,
      );
    }
    if (avatarByokBypass) {
      const creditsRequest = request as RemixCreditsRequest;
      creditsRequest.creditsConfig = {
        ...creditsRequest.creditsConfig,
        isByokBypass: true,
        modelKey: MODEL_KEYS.HEYGEN_AVATAR,
        provider: ByokProvider.HEYGEN,
      };
    }
    return avatarByokBypass;
  }

  private async ensureExecutionRecord(params: {
    brandContext: ResolvedBrandContext;
    config: BrandRemixRunConfig;
    organizationId: string;
    readiness: BrandRemixRunConfig['readiness'];
    run: BrandRemixRunRecord;
    runId: string;
  }): Promise<{ config: BrandRemixRunConfig; run: BrandRemixRunRecord }> {
    if (params.config.execution) {
      return { config: params.config, run: params.run };
    }
    const variants: BrandRemixExecution['variants'] = Array.from(
      { length: params.config.draft.output.count },
      () => ({
        assetIds: [],
        id: this.runtime.randomId(),
        recipeRevision: params.config.revision,
        status: 'queued' as const,
      }),
    );
    const nextConfig = brandRemixRunConfigSchema.parse({
      ...params.config,
      execution: {
        actualCount: 0,
        generationBrief: this.planning.buildGenerationBrief(
          params.brandContext,
          params.config,
        ),
        requestedCount: params.config.draft.output.count,
        variants,
      },
      phase: 'generating',
      readiness: params.readiness,
    });
    const run = await this.persistence.compareAndSwapConfig({
      expectedPhase: params.config.phase,
      expectedRevision: params.config.revision,
      nextConfig,
      organizationId: params.organizationId,
      runId: params.runId,
      status: ContentRunStatus.RUNNING,
    });
    return {
      config: this.persistence.parseConfig(run.config, run.id),
      run,
    };
  }

  private async claimGeneration(params: {
    avatarByokBypass: boolean;
    brandContext: ResolvedBrandContext;
    brandId: string;
    config: BrandRemixRunConfig;
    run: BrandRemixRunRecord;
  }): Promise<{
    config: BrandRemixRunConfig;
    resumable: BrandRemixExecution['variants'];
    run: BrandRemixRunRecord;
    view?: BrandRemixRunView;
  }> {
    const organizationId = params.run.organizationId;
    const runId = params.run.id;
    let activeConfig = params.config;
    let run = params.run;
    if (activeConfig.generationClaim) {
      const claimAge =
        this.runtime.now().getTime() -
        new Date(activeConfig.generationClaim.claimedAt).getTime();
      if (claimAge < GENERATION_CLAIM_LEASE_MS) {
        return {
          config: activeConfig,
          resumable: [],
          run,
          view: projectBrandRemixRun(run, params.brandContext, activeConfig),
        };
      }
      activeConfig = await this.recoverStalledReservations({
        brandId: params.brandId,
        config: activeConfig,
        organizationId,
        runId,
      });
      run = await this.persistence.requireRun(organizationId, runId);
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
      return {
        config: activeConfig,
        resumable,
        run,
        view: projectBrandRemixRun(run, params.brandContext, activeConfig),
      };
    }

    const claimedConfig = brandRemixRunConfigSchema.parse({
      ...activeConfig,
      generationClaim: {
        claimedAt: this.runtime.now().toISOString(),
        id: `${runId}:generate:${activeConfig.revision}`,
        variantIds: resumable.map((variant) => variant.id),
      },
    });
    const generationClaim = await this.persistence.compareAndSwapExactConfig({
      expectedConfig: activeConfig,
      nextConfig: claimedConfig,
      organizationId,
      runId,
      status: ContentRunStatus.RUNNING,
    });
    if (!generationClaim) {
      const latest = await this.persistence.requireRun(organizationId, runId);
      return {
        config: claimedConfig,
        resumable,
        run: latest,
        view: projectBrandRemixRun(
          latest,
          params.brandContext,
          this.persistence.parseConfig(latest.config, runId),
        ),
      };
    }
    return { config: claimedConfig, resumable, run: generationClaim };
  }

  private async dispatchMediaVariants(params: {
    avatarByokBypass: boolean;
    brandId: string;
    config: BrandRemixRunConfig;
    generationUser: User;
    organizationId: string;
    recipeRevision: number;
    request: Request;
    runId: string;
    variants: BrandRemixExecution['variants'];
  }): Promise<void> {
    for (const variant of params.variants) {
      await this.state.patchGeneratingVariant({
        organizationId: params.organizationId,
        patch: { status: 'processing' },
        recipeRevision: params.recipeRevision,
        runId: params.runId,
        status: ContentRunStatus.RUNNING,
        variantId: variant.id,
      });
    }

    const creditAmounts = new Map<string, number>();
    const byokCredits = new Map<
      string,
      NonNullable<RemixCreditsRequest['creditsConfig']>
    >();
    const successfulVariants = new Set<string>();
    const barrier = new GenerationReservationBarrier(params.variants.length);
    const creditBarrier = new GenerationReservationBarrier(
      params.variants.length,
      async () => {
        if (byokCredits.size > 0 && byokCredits.size !== creditAmounts.size) {
          throw new ConflictException(
            'Remix variants resolved mixed BYOK billing modes; no provider work was started.',
          );
        }
        const total = [...creditAmounts.entries()].reduce(
          (sum, [variantId, amount]) =>
            sum + (byokCredits.has(variantId) ? 0 : amount),
          0,
        );
        if (
          total > 0 &&
          !(await this.creditsUtilsService.checkOrganizationCreditsAvailable(
            params.organizationId,
            total,
          ))
        ) {
          const balance =
            await this.creditsUtilsService.getOrganizationCreditsBalance(
              params.organizationId,
            );
          throw createInsufficientCreditsException(total, balance);
        }
      },
    );
    await Promise.all(
      params.variants.map((variant) =>
        this.dispatchOneMediaVariant({
          ...params,
          barrier,
          byokCredits,
          creditAmounts,
          creditBarrier,
          successfulVariants,
          variant,
        }),
      ),
    );
    const successfulByokCredits = [...successfulVariants]
      .map((variantId) => byokCredits.get(variantId))
      .find((creditsConfig) => creditsConfig !== undefined);
    if (successfulByokCredits) {
      (params.request as RemixCreditsRequest).creditsConfig = {
        ...(params.request as RemixCreditsRequest).creditsConfig,
        ...successfulByokCredits,
        deferred: true,
      };
    }
    finalizeOutputCredits(
      params.request,
      [...successfulVariants].reduce(
        (sum, variantId) => sum + (creditAmounts.get(variantId) ?? 0),
        0,
      ),
    );
  }

  private async dispatchOneMediaVariant(params: {
    avatarByokBypass: boolean;
    barrier: GenerationReservationBarrier;
    brandId: string;
    byokCredits: Map<string, NonNullable<RemixCreditsRequest['creditsConfig']>>;
    config: BrandRemixRunConfig;
    creditAmounts: Map<string, number>;
    creditBarrier: GenerationReservationBarrier;
    generationUser: User;
    organizationId: string;
    recipeRevision: number;
    request: Request;
    runId: string;
    successfulVariants: Set<string>;
    variant: BrandRemixExecution['variants'][number];
  }): Promise<void> {
    let linkedAssetId: string | undefined;
    const groupIndex =
      params.config.execution?.variants.findIndex(
        (candidate) => candidate.id === params.variant.id,
      ) ?? -1;
    try {
      const variantRequest = Object.assign(
        Object.create(Object.getPrototypeOf(params.request)),
        params.request,
      ) as RemixCreditsRequest;
      const originalCredits = (params.request as RemixCreditsRequest)
        .creditsConfig;
      if (params.config.draft.output.kind === 'avatar') {
        const requestedAmount = originalCredits?.amount;
        variantRequest.creditsConfig = {
          ...originalCredits,
          amount:
            typeof requestedAmount === 'number' &&
            Number.isFinite(requestedAmount) &&
            requestedAmount > 0
              ? requestedAmount
              : AVATAR_GENERATION_CREDIT_COST,
          deferred: true,
        };
      } else {
        variantRequest.creditsConfig = originalCredits
          ? { ...originalCredits, deferred: true }
          : undefined;
      }
      const assetId = await this.dispatch.dispatchVariant({
        brandId: params.brandId,
        config: params.config,
        onPlaceholderCreated: async (ingredientId) => {
          const tagged = await this.prisma.ingredient.updateMany({
            data: { templateVersion: params.recipeRevision },
            where: scopedWhere(params.organizationId, {
              brandId: params.brandId,
              groupId: params.runId,
              groupIndex,
              id: ingredientId,
            }),
          });
          if (tagged.count !== 1) {
            throw new ConflictException(
              'The generated placeholder could not be bound to this remix revision.',
            );
          }
          await this.state.patchGeneratingVariant({
            organizationId: params.organizationId,
            patch: {
              assetIds: [ingredientId],
              status: 'processing',
            },
            recipeRevision: params.recipeRevision,
            runId: params.runId,
            status: ContentRunStatus.RUNNING,
            variantId: params.variant.id,
          });
          linkedAssetId = ingredientId;
          await params.barrier.arrive();
        },
        onCreditsPrepared: async () => {
          if (variantRequest.creditsConfig?.isByokBypass === true) {
            params.byokCredits.set(
              params.variant.id,
              variantRequest.creditsConfig,
            );
          }
          params.creditAmounts.set(
            params.variant.id,
            variantRequest.creditsConfig?.amount ?? 0,
          );
          await params.creditBarrier.arrive();
        },
        placeholderScope: {
          groupId: params.runId,
          groupIndex,
          isByokBypass: params.avatarByokBypass,
          settleCreditsExternally: true,
        },
        request: variantRequest,
        user: params.generationUser,
      });
      if (linkedAssetId && linkedAssetId !== assetId) {
        throw new ConflictException(
          'Generation returned a different Ingredient than its durable placeholder.',
        );
      }
      if (!linkedAssetId) {
        await this.state.patchGeneratingVariant({
          organizationId: params.organizationId,
          patch: { assetIds: [assetId], status: 'processing' },
          recipeRevision: params.recipeRevision,
          runId: params.runId,
          status: ContentRunStatus.RUNNING,
          variantId: params.variant.id,
        });
      }
      params.successfulVariants.add(params.variant.id);
    } catch (error: unknown) {
      params.barrier.fail(error);
      params.creditBarrier.fail(error);
      await this.state.patchGeneratingVariant({
        organizationId: params.organizationId,
        patch: {
          error: remixErrorMessage(error),
          status: 'failed',
        },
        recipeRevision: params.recipeRevision,
        runId: params.runId,
        status: ContentRunStatus.RUNNING,
        variantId: params.variant.id,
      });
    }
  }

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
        templateVersion: config.revision,
      }),
      orderBy: { groupIndex: 'asc' },
    });
    const resumableVariantIds = new Set(
      params.variants.map((variant) => variant.id),
    );
    const adoptedVariantIds = new Set<string>();
    const unadoptedOrphanIds = new Set(
      orphans.map((orphan) => orphan.id.toString()),
    );
    for (const orphan of orphans) {
      const variant = this.matchOrphanVariant(
        orphan,
        execution.variants,
        resumableVariantIds,
        adoptedVariantIds,
      );
      if (!variant) continue;
      config = await this.state.patchGeneratingVariant({
        organizationId: params.organizationId,
        patch: { assetIds: [orphan.id.toString()], status: 'processing' },
        recipeRevision: variant.recipeRevision,
        runId: params.runId,
        status: ContentRunStatus.RUNNING,
        variantId: variant.id,
      });
      adoptedVariantIds.add(variant.id);
      unadoptedOrphanIds.delete(orphan.id.toString());
    }
    if (unadoptedOrphanIds.size > 0) {
      await this.prisma.ingredient.updateMany({
        data: { status: IngredientStatus.FAILED },
        where: scopedWhere(params.organizationId, {
          brandId: params.brandId,
          groupId: params.runId,
          id: { in: [...unadoptedOrphanIds] },
          status: { not: IngredientStatus.FAILED },
          templateVersion: config.revision,
        }),
      });
    }
    return config;
  }

  private matchOrphanVariant(
    orphan: { groupIndex: number | null; id: string },
    variants: BrandRemixExecution['variants'],
    resumableVariantIds: Set<string>,
    adoptedVariantIds: Set<string>,
  ): BrandRemixExecution['variants'][number] | undefined {
    const indexedVariant =
      orphan.groupIndex == null ? undefined : variants[orphan.groupIndex];
    if (
      indexedVariant &&
      resumableVariantIds.has(indexedVariant.id) &&
      indexedVariant.assetIds.length === 0 &&
      !adoptedVariantIds.has(indexedVariant.id)
    ) {
      return indexedVariant;
    }
    if (orphan.groupIndex != null) return undefined;
    return variants.find(
      (candidate) =>
        resumableVariantIds.has(candidate.id) &&
        candidate.assetIds.length === 0 &&
        !adoptedVariantIds.has(candidate.id),
    );
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
        metadata: { select: { externalId: true, externalProvider: true } },
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
            !ingredient.metadata?.externalId &&
            !ingredient.metadata?.externalProvider,
        );
      if (!undispatched) continue;
      await this.prisma.ingredient.updateMany({
        data: { status: IngredientStatus.FAILED },
        where: scopedWhere(params.organizationId, {
          brandId: params.brandId,
          id: { in: variant.assetIds },
        }),
      });
      config = await this.state.patchGeneratingVariant({
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
}
