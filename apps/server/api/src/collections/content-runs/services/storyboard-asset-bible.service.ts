import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import {
  ASSET_ABANDONED_MS,
  type AssetOperation,
  type AssetRequestPlan,
  addAssetVariant,
  appendAssetOperations,
  isLiveAssetOperation,
  planAssetRequest,
} from '@api/collections/content-runs/services/storyboard-asset-bible-state';
import { storyboardConfigHash } from '@api/collections/content-runs/services/storyboard-config-hash';
import {
  type StoryboardStoredRunConfig,
  storyboardStoredRunConfigSchema,
} from '@api/collections/content-runs/services/storyboard-imported-run-state.schema';
import { assertStoryboardEditable } from '@api/collections/content-runs/services/storyboard-plan-state';
import {
  projectStoryboardRun,
  StoryboardRunStoreService,
} from '@api/collections/content-runs/services/storyboard-run-store.service';
import { StoryboardSourceService } from '@api/collections/content-runs/services/storyboard-source.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import type { EditImageDto } from '@api/collections/images/dto/edit-image.dto';
import { ImageGenerationService } from '@api/collections/images/services/image-generation.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { UnsettleableReservationException } from '@api/exceptions/business-logic.exception';
import type { DeferredCreditsRequest } from '@api/helpers/utils/credits/generation-credit-cost.util';
import { scopedWhere } from '@api/index';
import { ByokService } from '@api/services/byok/byok.service';
import { resolveModelByokProvider } from '@api/services/byok/byok-provider-map.util';
import { AgentGenerationEstimateService } from '@api/services/router/agent-generation-estimate.service';
import { VideoRecipeRoutingService } from '@api/services/video-recipes/video-recipe-routing.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelCategory } from '@genfeedai/contracts';
import {
  type QuoteStoryboardAssets,
  quoteStoryboardAssetsSchema,
  STORYBOARD_ASSET_SOURCE_ACTION_PREFIX,
  type StoryboardAssetQuote,
  startStoryboardAssetsSchema,
  storyboardAssetQuoteSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-asset-bible.contract';
import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import {
  GENERATION_POOL_WORKLOAD_TYPE,
  MEDIA_GENERATION_GROUP_WORKLOAD_TYPE,
  REALISTIC_VIDEO_RECIPE,
  resolveAgentGenerationDimensions,
} from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import { Traced } from '@libs/tracing/traced';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { ZodType } from 'zod';

const MUTATION_ATTEMPTS = 5;
type AssetOutcome = Pick<
  AssetOperation,
  'state' | 'billing' | 'assetId' | 'errorCode'
>;

/** The model a recipe step routed to, and how it is billed. */
interface RoutedModel {
  stepId: string;
  modelKey: string;
  provider: string;
  isEdit: boolean;
}

/** The identity the image pipeline keys an asset's credit hold by. */
function assetSourceActionId(runId: string, operation: AssetOperation) {
  return `${STORYBOARD_ASSET_SOURCE_ACTION_PREFIX}${runId}-${operation.operationId}`;
}

function parseInput<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new BadRequestException(
      parsed.error.issues
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
        .join('; '),
    );
  return parsed.data;
}

/**
 * Generates the images of a storyboard's asset bible (#9616): character
 * sheets, real-person costume swaps, prop designs and angles, environments
 * and their edits. Each call runs on the model the realistic-video recipe
 * routes its step to. It is quoted, its credits held by the image pipeline,
 * and settled here only for an image that renders.
 */
@Traced()
@Injectable()
export class StoryboardAssetBibleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: StoryboardRunStoreService,
    private readonly source: StoryboardSourceService,
    private readonly routing: VideoRecipeRoutingService,
    private readonly models: ModelsService,
    private readonly estimate: AgentGenerationEstimateService,
    private readonly byok: ByokService,
    private readonly images: ImageGenerationService,
    private readonly credits: CreditsUtilsService,
    private readonly logger: LoggerService,
  ) {}

  async quote(
    organizationId: string,
    brandId: string,
    runId: string,
    body: unknown,
  ): Promise<StoryboardAssetQuote> {
    const input = parseInput(quoteStoryboardAssetsSchema, body);
    const { config } = await this.store.read(
      organizationId,
      brandId,
      runId,
      input.expectedRevision,
    );
    const { quote } = await this.buildQuote(
      organizationId,
      brandId,
      config,
      input,
    );
    return quote;
  }

  async start(
    organizationId: string,
    brandId: string,
    runId: string,
    userId: string,
    body: unknown,
  ): Promise<StoryboardRun> {
    const { inputHash, ...input } = parseInput(
      startStoryboardAssetsSchema,
      body,
    );
    const { config } = await this.store.read(
      organizationId,
      brandId,
      runId,
      input.expectedRevision,
    );
    const { quote, request, model } = await this.buildQuote(
      organizationId,
      brandId,
      config,
      input,
    );
    if (quote.inputHash !== inputHash)
      throw new ConflictException(
        'The asset bible or the image price changed. Review the new quote.',
      );
    await this.source.validatePlanAssets(organizationId, brandId, config.plan);
    const now = new Date().toISOString();
    const operations: AssetOperation[] = quote.items.map((item) => ({
      version: 1,
      operationId: randomUUID(),
      entryId: quote.entryId,
      action: quote.action,
      actorUserId: userId,
      modelKey: model.modelKey,
      credits: item.credits,
      billingMode: quote.billingMode,
      prompt: item.prompt,
      referenceAssetIds: item.referenceAssetIds,
      aspectRatio: request.aspectRatio,
      createdAt: now,
      updatedAt: now,
      state: 'pending',
      billing: 'none',
    }));
    await this.mutate(organizationId, brandId, runId, (current) => {
      // The quote was bound to this exact revision and these inputs.
      if (current.revision !== quote.revision)
        throw new ConflictException(
          'The storyboard changed. Review the new quote.',
        );
      if (
        (current.assetOperations ?? []).some(
          (op) => op.entryId === quote.entryId && isLiveAssetOperation(op),
        )
      )
        throw new ConflictException(
          'Images for this entry are already generating.',
        );
      return storyboardStoredRunConfigSchema.parse({
        ...current,
        assetOperations: appendAssetOperations(
          current.assetOperations ?? [],
          operations,
        ),
      });
    });
    // One at a time: each dispatch records its placeholder and hold in the
    // same run document, so parallel writers would only contend.
    for (const operation of operations)
      await this.dispatch(organizationId, brandId, runId, operation, model);
    return this.reconcile(organizationId, brandId, runId);
  }

  /**
   * Records finished images: a rendered one is charged once and added to its
   * entry, a failed or abandoned one is refunded. Safe to call repeatedly;
   * clients poll it while any entry is generating.
   */
  async reconcile(
    organizationId: string,
    brandId: string,
    runId: string,
  ): Promise<StoryboardRun> {
    const { config, record } = await this.store.read(
      organizationId,
      brandId,
      runId,
    );
    const live = (config.assetOperations ?? []).filter(isLiveAssetOperation);
    const outcomes = new Map<string, AssetOutcome>();
    for (const operation of live) {
      const outcome = await this.observe(
        organizationId,
        brandId,
        runId,
        operation,
      );
      if (outcome) outcomes.set(operation.operationId, outcome);
    }
    if (!outcomes.size) return projectStoryboardRun(record);
    return this.mutate(organizationId, brandId, runId, (current) =>
      this.applyOutcomes(current, outcomes),
    );
  }

  private async buildQuote(
    organizationId: string,
    brandId: string,
    config: StoryboardStoredRunConfig,
    input: Omit<QuoteStoryboardAssets, 'expectedRevision'>,
  ): Promise<{
    quote: StoryboardAssetQuote;
    request: AssetRequestPlan;
    model: RoutedModel;
  }> {
    assertStoryboardEditable(config);
    const entry = config.plan.assetBible?.find(
      (candidate) => candidate.id === input.entryId,
    );
    if (!entry)
      throw new BadRequestException(
        `Asset bible entry ${input.entryId} not found.`,
      );
    const request = planAssetRequest(config.plan, entry, input);
    const model = await this.routeStep(organizationId, brandId, request.stepId);
    const billingMode = await this.billingMode(organizationId, model);
    const credits =
      billingMode === 'byok'
        ? 0
        : await this.price(organizationId, model, request);
    const items = request.items.map((item) => ({ ...item, credits }));
    return {
      request,
      model,
      quote: storyboardAssetQuoteSchema.parse({
        revision: config.revision,
        entryId: entry.id,
        action: input.action,
        stepId: model.stepId,
        modelKey: model.modelKey,
        billingMode,
        inputHash: storyboardConfigHash({
          revision: config.revision,
          entryId: entry.id,
          action: input.action,
          modelKey: model.modelKey,
          billingMode,
          aspectRatio: request.aspectRatio,
          items,
        }),
        items,
        total: items.reduce((sum, item) => sum + item.credits, 0),
      }),
    };
  }

  /** The model the realistic-video recipe runs a step on for this brand. */
  private async routeStep(
    organizationId: string,
    brandId: string,
    stepId: string,
  ): Promise<RoutedModel> {
    const routing = await this.routing.resolve(
      organizationId,
      brandId,
      REALISTIC_VIDEO_RECIPE.key,
    );
    const step = routing.steps.find((candidate) => candidate.stepId === stepId);
    if (!step?.modelKey)
      throw new ConflictException(
        `No model can run the ${step?.label ?? stepId} step: ${step?.unavailableReason ?? 'not in the recipe'}.`,
      );
    const row = await this.models.findOne({
      key: step.modelKey,
      organizationId,
      isDeleted: false,
    });
    if (!row)
      throw new ConflictException(
        `The ${step.label} model is not in the catalog.`,
      );
    return {
      stepId,
      modelKey: step.modelKey,
      provider: String(row.provider),
      isEdit: step.category === ModelCategory.IMAGE_EDIT,
    };
  }

  private async billingMode(
    organizationId: string,
    model: RoutedModel,
  ): Promise<'platform' | 'byok'> {
    const provider = resolveModelByokProvider(model.modelKey, model.provider);
    const isByok = provider
      ? await this.byok.isByokActiveForProvider(organizationId, provider)
      : false;
    return isByok ? 'byok' : 'platform';
  }

  /** Every image of a call costs the same: one model, one size. */
  private async price(
    organizationId: string,
    model: RoutedModel,
    request: AssetRequestPlan,
  ): Promise<number> {
    const estimate = await this.estimate.estimate({
      organizationId,
      category: model.isEdit ? 'image-edit' : 'image',
      modelKey: model.modelKey,
      prompt: request.items[0]?.prompt,
      aspectRatio: request.aspectRatio,
      dimensions: resolveAgentGenerationDimensions(request.aspectRatio),
      outputs: 1,
    });
    if (
      !estimate.isAvailable ||
      estimate.credits === null ||
      estimate.modelKey !== model.modelKey
    )
      throw new ConflictException(
        'The asset model is unavailable or has no valid price.',
      );
    return estimate.credits;
  }

  private async dispatch(
    organizationId: string,
    brandId: string,
    runId: string,
    operation: AssetOperation,
    model: RoutedModel,
  ): Promise<void> {
    const sourceActionId = assetSourceActionId(runId, operation);
    const user: AuthenticatedUser = {
      id: operation.actorUserId,
      userId: operation.actorUserId,
      organizationId,
      brandId,
    };
    const request = {
      user,
      body: { sourceActionId },
      creditsConfig: { deferred: true },
    } as RequestWithContext & DeferredCreditsRequest;
    let placeholderId: string | undefined;
    const onPlaceholderCreated = async (assetId: string) => {
      placeholderId = assetId;
      await this.patch(organizationId, brandId, runId, operation, {
        assetId,
        state: 'submitted',
      });
    };
    const scope = {
      groupId: sourceActionId,
      groupIndex: 0,
      settleCreditsExternally: true,
    };
    const onCreditsPrepared = async () => {
      const credits = request.creditsConfig;
      const charged = credits?.isByokBypass ? 0 : credits?.amount;
      if (
        !credits ||
        charged !== operation.credits ||
        Boolean(credits.isByokBypass) !== (operation.billingMode === 'byok') ||
        (operation.credits > 0 && !credits.reservationId)
      ) {
        if (credits?.reservationId)
          await this.release(organizationId, credits.reservationId);
        throw new ConflictException(
          'Asset billing changed after the accepted quote.',
        );
      }
      if (credits.reservationId)
        await this.patch(organizationId, brandId, runId, operation, {
          reservationId: credits.reservationId,
          billing: 'reserved',
        });
    };
    try {
      const response = await this.send(
        user,
        operation,
        model,
        sourceActionId,
        request,
        onPlaceholderCreated,
        scope,
        onCreditsPrepared,
      );
      if (!response.data?.id)
        throw new ConflictException('The image provider returned no asset.');
    } catch (error: unknown) {
      this.logger.error('Storyboard asset dispatch failed', error, {
        organizationId,
        brandId,
        runId,
        operationId: operation.operationId,
        hasPlaceholder: Boolean(placeholderId),
      });
      this.report(error, 'STORYBOARD_ASSET_DISPATCH_FAILED', {
        organizationId,
        brandId,
        runId,
        operationId: operation.operationId,
        assetId: placeholderId,
      });
      // A throw before the provider accepted the job means nothing ran, so
      // refund now. A placeholder the provider already accepted is left to
      // reconciliation.
      const isUnsubmitted = placeholderId
        ? await this.failUnsubmittedPlaceholder(
            organizationId,
            brandId,
            placeholderId,
          )
        : true;
      if (isUnsubmitted) {
        const journaled = await this.findOperation(
          organizationId,
          brandId,
          runId,
          operation.operationId,
        );
        // The request's own hold covers a journal write that never landed.
        const reservationId =
          journaled?.reservationId ?? request.creditsConfig?.reservationId;
        if (reservationId) await this.release(organizationId, reservationId);
        await this.mutate(organizationId, brandId, runId, (current) =>
          this.applyOutcomes(
            current,
            new Map([
              [
                operation.operationId,
                {
                  state: 'failed',
                  billing: reservationId ? 'released' : 'none',
                  errorCode: 'STORYBOARD_ASSET_DISPATCH_FAILED',
                },
              ],
            ]),
          ),
        );
      }
    }
  }

  /** An edit step changes its first reference; any other step generates. */
  private send(
    user: AuthenticatedUser,
    operation: AssetOperation,
    model: RoutedModel,
    sourceActionId: string,
    request: RequestWithContext & DeferredCreditsRequest,
    onPlaceholderCreated: (assetId: string) => Promise<void>,
    scope: {
      groupId: string;
      groupIndex: number;
      settleCreditsExternally: boolean;
    },
    onCreditsPrepared: () => Promise<void>,
  ) {
    const brandId = user.brandId;
    const [base, ...references] = operation.referenceAssetIds;
    return model.isEdit && base
      ? this.images.editImage(
          user,
          base,
          {
            brandId,
            sourceActionId,
            model: operation.modelKey,
            autoSelectModel: false,
            prompt: operation.prompt,
            references,
            aspectRatio: operation.aspectRatio,
            outputs: 1,
            waitForCompletion: false,
          } as EditImageDto,
          request,
          onPlaceholderCreated,
          scope,
          onCreditsPrepared,
        )
      : this.images.generateImage(
          user,
          {
            brandId,
            sourceActionId,
            model: operation.modelKey,
            autoSelectModel: false,
            ...resolveAgentGenerationDimensions(operation.aspectRatio),
            aspectRatio: operation.aspectRatio,
            outputs: 1,
            // The asset prompt is final: no enhancement and no brand look.
            harness: false,
            brandingMode: 'off',
            isBrandingEnabled: false,
            waitForCompletion: false,
            references: operation.referenceAssetIds,
            text: operation.prompt,
          } as CreateImageDto,
          request,
          onPlaceholderCreated,
          scope,
          onCreditsPrepared,
        );
  }

  /**
   * Fails a placeholder the provider never accepted so the Library stops
   * showing it as generating. Returns false when it may still be running.
   */
  private async failUnsubmittedPlaceholder(
    organizationId: string,
    brandId: string,
    assetId: string,
  ): Promise<boolean> {
    const asset = await this.prisma.ingredient.findFirst({
      where: scopedWhere(organizationId, {
        brandId,
        id: assetId,
        category: 'IMAGE' as const,
      }),
      include: { metadata: true },
    });
    if (!asset || asset.status === 'FAILED') return true;
    if (asset.status !== 'PROCESSING' || asset.metadata?.externalId)
      return false;
    await this.failPlaceholder(organizationId, brandId, assetId);
    return true;
  }

  private async failPlaceholder(
    organizationId: string,
    brandId: string,
    assetId: string,
  ) {
    await this.prisma.ingredient.updateMany({
      where: scopedWhere(organizationId, {
        brandId,
        id: assetId,
        status: 'PROCESSING' as const,
      }),
      data: {
        generationError: 'Asset was never submitted to the image provider',
        status: 'FAILED' as const,
      },
    });
  }

  private report(
    error: unknown,
    errorCode: string,
    extra: Record<string, unknown>,
  ) {
    Sentry.captureException(error, {
      extra,
      tags: { operation: 'storyboard-asset-bible', errorCode },
    });
  }

  private async observe(
    organizationId: string,
    brandId: string,
    runId: string,
    operation: AssetOperation,
  ): Promise<AssetOutcome | undefined> {
    const isAbandoned =
      Date.now() - Date.parse(operation.updatedAt) > ASSET_ABANDONED_MS;
    if (!operation.assetId) {
      if (!isAbandoned) return undefined;
      const isReleased = await this.releaseHeld(
        organizationId,
        runId,
        operation,
      );
      this.report(
        new Error('Storyboard asset was never dispatched'),
        'STORYBOARD_ASSET_NOT_DISPATCHED',
        { operationId: operation.operationId },
      );
      return {
        state: 'failed',
        billing: isReleased ? 'released' : 'none',
        errorCode: 'STORYBOARD_ASSET_NOT_DISPATCHED',
      };
    }
    const asset = await this.prisma.ingredient.findFirst({
      where: scopedWhere(organizationId, {
        brandId,
        id: operation.assetId,
        category: 'IMAGE' as const,
      }),
      include: { metadata: true },
    });
    const status = asset?.status ?? 'FAILED';
    if (status === 'GENERATED' || status === 'VALIDATED')
      return {
        state: 'ready',
        assetId: operation.assetId,
        billing: await this.settle(organizationId, brandId, operation),
      };
    // Only a missing `externalId` proves the provider never got the job.
    const isUndispatched =
      status === 'PROCESSING' && isAbandoned && !asset?.metadata?.externalId;
    if (status !== 'FAILED' && !isUndispatched) return undefined;
    if (isUndispatched)
      await this.failPlaceholder(organizationId, brandId, operation.assetId);
    const isReleased = await this.releaseHeld(organizationId, runId, operation);
    this.report(
      new Error('Storyboard asset failed'),
      'STORYBOARD_ASSET_FAILED',
      {
        operationId: operation.operationId,
        assetId: operation.assetId,
        reason: asset?.generationError ?? undefined,
      },
    );
    return {
      state: 'failed',
      billing: isReleased ? 'released' : 'none',
      errorCode: 'STORYBOARD_ASSET_FAILED',
    };
  }

  /**
   * Records outcomes on live operations only, so a finished one never
   * changes, and adds each rendered image to its entry. An entry deleted
   * while its images rendered keeps them in the Library only.
   */
  private applyOutcomes(
    current: StoryboardStoredRunConfig,
    outcomes: ReadonlyMap<string, AssetOutcome>,
  ): StoryboardStoredRunConfig {
    const journal = current.assetOperations ?? [];
    const finished = journal.filter(
      (op) => isLiveAssetOperation(op) && outcomes.has(op.operationId),
    );
    if (!finished.length) return current;
    const updatedAt = new Date().toISOString();
    const plan = finished.reduce((value, op) => {
      const outcome = outcomes.get(op.operationId);
      return outcome?.state === 'ready' && outcome.assetId
        ? addAssetVariant(value, op.entryId, outcome.assetId)
        : value;
    }, current.plan);
    return storyboardStoredRunConfigSchema.parse({
      ...current,
      plan,
      assetOperations: journal.map((op) => {
        const outcome = outcomes.get(op.operationId);
        return outcome && isLiveAssetOperation(op)
          ? { ...op, ...outcome, updatedAt }
          : op;
      }),
    });
  }

  private async settle(
    organizationId: string,
    brandId: string,
    operation: AssetOperation,
  ): Promise<AssetOperation['billing']> {
    if (!operation.reservationId || operation.credits <= 0)
      return operation.billing;
    try {
      await this.credits.settleReservation({
        organizationId,
        actorUserId: operation.actorUserId,
        reservationId: operation.reservationId,
        actualAmount: operation.credits,
        brandId,
        description: 'Storyboard asset bible image',
      });
      return 'settled';
    } catch (error: unknown) {
      // An expired or released hold is never charged again.
      if (error instanceof UnsettleableReservationException) return 'released';
      throw error;
    }
  }

  /**
   * Releases the image's hold and says whether it had one. An image whose
   * journal write never landed is found by the identity the pipeline keyed
   * the hold by, so its credits never stay held.
   */
  private async releaseHeld(
    organizationId: string,
    runId: string,
    operation: AssetOperation,
  ): Promise<boolean> {
    const reservationId =
      operation.reservationId ??
      (await this.findUnjournaledHold(organizationId, runId, operation));
    if (!reservationId) return false;
    await this.release(organizationId, reservationId);
    return true;
  }

  private async findUnjournaledHold(
    organizationId: string,
    runId: string,
    operation: AssetOperation,
  ): Promise<string | undefined> {
    if (operation.credits <= 0 || operation.billingMode === 'byok') return;
    const workloadId = assetSourceActionId(runId, operation);
    for (const workloadType of [
      MEDIA_GENERATION_GROUP_WORKLOAD_TYPE,
      GENERATION_POOL_WORKLOAD_TYPE,
    ]) {
      const hold = await this.credits.findReservationForWorkload({
        organizationId,
        workloadId,
        workloadType,
      });
      if (hold) return hold.id;
    }
  }

  /** Release is a no-op for a hold that is no longer reserved. */
  private async release(organizationId: string, reservationId: string) {
    await this.credits.releaseReservation({ organizationId, reservationId });
  }

  private async findOperation(
    organizationId: string,
    brandId: string,
    runId: string,
    operationId: string,
  ): Promise<AssetOperation | undefined> {
    const { config } = await this.store.read(organizationId, brandId, runId);
    return config.assetOperations?.find((op) => op.operationId === operationId);
  }

  private async patch(
    organizationId: string,
    brandId: string,
    runId: string,
    operation: AssetOperation,
    patch: Partial<
      Pick<AssetOperation, 'assetId' | 'reservationId' | 'state' | 'billing'>
    >,
  ) {
    await this.mutate(organizationId, brandId, runId, (current) => ({
      ...current,
      assetOperations: (current.assetOperations ?? []).map((op) =>
        op.operationId === operation.operationId && isLiveAssetOperation(op)
          ? { ...op, ...patch, updatedAt: new Date().toISOString() }
          : op,
      ),
    }));
  }

  /** Compare-and-set on the whole run document, retried on concurrent writes. */
  private async mutate(
    organizationId: string,
    brandId: string,
    runId: string,
    change: (
      config: StoryboardStoredRunConfig,
    ) => StoryboardStoredRunConfig | Promise<StoryboardStoredRunConfig>,
  ): Promise<StoryboardRun> {
    for (let attempt = 0; attempt < MUTATION_ATTEMPTS; attempt++) {
      const { config } = await this.store.read(organizationId, brandId, runId);
      const next = await change(config);
      try {
        return await this.store.save(
          organizationId,
          brandId,
          runId,
          config,
          next,
        );
      } catch (error: unknown) {
        if (
          !(error instanceof ConflictException) ||
          attempt === MUTATION_ATTEMPTS - 1
        )
          throw error;
      }
    }
    throw new ConflictException('The storyboard is busy. Retry shortly.');
  }
}
