import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { storyboardConfigHash } from '@api/collections/content-runs/services/storyboard-config-hash';
import {
  type StoryboardStoredRunConfig,
  storyboardStoredRunConfigSchema,
} from '@api/collections/content-runs/services/storyboard-imported-run-state.schema';
import { StoryboardRunCapabilitiesService } from '@api/collections/content-runs/services/storyboard-run-capabilities.service';
import {
  projectStoryboardRun,
  StoryboardRunStoreService,
} from '@api/collections/content-runs/services/storyboard-run-store.service';
import {
  type RenderLine,
  type StageModel,
  shotRenderLine,
  shotRenderStageModel,
  videoCapability,
} from '@api/collections/content-runs/services/storyboard-shot-render-lines';
import {
  appendShotRenderOperations,
  isLiveShotRenderOperation,
  latestShotRender,
  SHOT_RENDER_ABANDONED_MS,
  type ShotRenderOperation,
  shotRenderInputFingerprint,
} from '@api/collections/content-runs/services/storyboard-shot-render-state';
import { StoryboardSourceService } from '@api/collections/content-runs/services/storyboard-source.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import { ModelsService } from '@api/collections/models/services/models.service';
import type { CreateVideoDto } from '@api/collections/videos/dto/create-video.dto';
import { VideoGenerationService } from '@api/collections/videos/services/video-generation.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { UnsettleableReservationException } from '@api/exceptions/business-logic.exception';
import type { DeferredCreditsRequest } from '@api/helpers/utils/credits/generation-credit-cost.util';
import { scopedWhere } from '@api/index';
import { ByokService } from '@api/services/byok/byok.service';
import { resolveModelByokProvider } from '@api/services/byok/byok-provider-map.util';
import { AgentGenerationEstimateService } from '@api/services/router/agent-generation-estimate.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  isStoryboardSlideshow,
  type StoryboardShot,
} from '@genfeedai/contracts/api-types/contracts/storyboard-plan.contract';
import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import {
  quoteStoryboardShotRendersSchema,
  STORYBOARD_SHOT_RENDER_SOURCE_ACTION_PREFIX,
  type StoryboardShotRenderQuote,
  type StoryboardShotRenderStage,
  startStoryboardShotRendersSchema,
  storyboardShotRenderQuoteSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-shot-render.contract';
import {
  GENERATION_POOL_WORKLOAD_TYPE,
  MEDIA_GENERATION_GROUP_WORKLOAD_TYPE,
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
type RenderOutcome = Pick<
  ShotRenderOperation,
  'state' | 'billing' | 'assetId' | 'errorCode'
>;

/** The identity the video pipeline keys a render's credit hold by. */
function renderSourceActionId(runId: string, operation: ShotRenderOperation) {
  return `${STORYBOARD_SHOT_RENDER_SOURCE_ACTION_PREFIX}${runId}-${operation.operationId}`;
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
 * Draft and final video renders for the shots of an approved storyboard
 * (#9618). A draft runs on the final model's cheaper catalog sibling, or on
 * the final model at its lowest resolution and shortest length, with no
 * audio. A final of a shot with a current draft promotes that draft: same
 * prompt, same references, full settings. Each render is quoted, its credits
 * held by the video pipeline, and settled here only once it renders.
 */
@Traced()
@Injectable()
export class StoryboardShotRendersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: StoryboardRunStoreService,
    private readonly source: StoryboardSourceService,
    private readonly capabilities: StoryboardRunCapabilitiesService,
    private readonly models: ModelsService,
    private readonly estimate: AgentGenerationEstimateService,
    private readonly byok: ByokService,
    private readonly videos: VideoGenerationService,
    private readonly credits: CreditsUtilsService,
    private readonly logger: LoggerService,
  ) {}

  async quote(
    organizationId: string,
    brandId: string,
    runId: string,
    body: unknown,
  ): Promise<StoryboardShotRenderQuote> {
    const input = parseInput(quoteStoryboardShotRendersSchema, body);
    const { config } = await this.store.read(
      organizationId,
      brandId,
      runId,
      input.expectedRevision,
    );
    const { quote } = await this.buildQuote(
      organizationId,
      brandId,
      runId,
      config,
      input.stage,
      input.shotIds,
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
    const input = parseInput(startStoryboardShotRendersSchema, body);
    const { config } = await this.store.read(
      organizationId,
      brandId,
      runId,
      input.expectedRevision,
    );
    const { quote, lines, model } = await this.buildQuote(
      organizationId,
      brandId,
      runId,
      config,
      input.stage,
      input.shotIds,
    );
    if (quote.inputHash !== input.inputHash)
      throw new ConflictException(
        'The storyboard or the render price changed. Review the new quote.',
      );
    await this.source.validatePlanAssets(organizationId, brandId, config.plan);
    const now = new Date().toISOString();
    const operations: ShotRenderOperation[] = lines.map((line) => ({
      version: 1,
      operationId: randomUUID(),
      shotId: line.shotId,
      stage: input.stage,
      actorUserId: userId,
      modelKey: model.modelKey,
      credits: line.credits,
      billingMode: quote.billingMode,
      inputFingerprint: line.inputFingerprint,
      prompt: line.prompt,
      referenceAssetIds: line.referenceAssetIds,
      aspectRatio: config.plan.format,
      durationSeconds: line.durationSeconds,
      ...(model.resolution ? { resolution: model.resolution } : {}),
      isAudioEnabled: model.audio.isEnabled,
      ...(line.promotedFromOperationId
        ? { promotedFromOperationId: line.promotedFromOperationId }
        : {}),
      createdAt: now,
      updatedAt: now,
      state: 'pending',
      billing: 'none',
    }));
    await this.mutate(organizationId, brandId, runId, (current) => {
      // The quote was bound to this exact revision and these render inputs.
      // A still can land without a new revision, so compare the inputs too.
      const shots = new Map(current.plan.shots.map((shot) => [shot.id, shot]));
      if (
        current.revision !== quote.revision ||
        lines.some((line) => {
          const shot = shots.get(line.shotId);
          return (
            !shot ||
            shotRenderInputFingerprint(current.plan, shot, input.stage) !==
              line.inputFingerprint
          );
        })
      )
        throw new ConflictException(
          'The storyboard changed. Review the new quote.',
        );
      const ids = new Set(lines.map((line) => line.shotId));
      if (
        (current.shotRenderOperations ?? []).some(
          (op) =>
            ids.has(op.shotId) &&
            op.stage === input.stage &&
            isLiveShotRenderOperation(op),
        )
      )
        throw new ConflictException(
          'A render for one of these shots is already running.',
        );
      return storyboardStoredRunConfigSchema.parse({
        ...current,
        shotRenderOperations: appendShotRenderOperations(
          current.shotRenderOperations ?? [],
          operations,
          new Set(current.plan.shots.map((shot) => shot.id)),
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
   * Records finished renders: a rendered clip is charged once, a failed or
   * abandoned one is refunded. Safe to call repeatedly; clients poll it while
   * any shot is rendering.
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
    const live = (config.shotRenderOperations ?? []).filter(
      isLiveShotRenderOperation,
    );
    const outcomes = new Map<string, RenderOutcome>();
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
    runId: string,
    config: StoryboardStoredRunConfig,
    stage: StoryboardShotRenderStage,
    shotIds?: readonly string[],
  ): Promise<{
    quote: StoryboardShotRenderQuote;
    lines: RenderLine[];
    model: StageModel;
  }> {
    const { plan } = config;
    if (plan.longForm || isStoryboardSlideshow(plan) || config.scenePipeline)
      throw new BadRequestException(
        'Only a short storyboard video renders its shots one by one.',
      );
    if (config.approvedRevision !== config.revision)
      throw new ConflictException(
        'Approve the storyboard before rendering its shots.',
      );
    const journal = config.shotRenderOperations ?? [];
    const isCurrent = (
      shot: StoryboardShot,
      op: ShotRenderOperation | undefined,
    ) =>
      Boolean(op) &&
      op?.state !== 'failed' &&
      op?.inputFingerprint === shotRenderInputFingerprint(plan, shot, stage);
    const targets = shotIds
      ? shotIds.map((id) => {
          const shot = plan.shots.find((candidate) => candidate.id === id);
          if (!shot) throw new BadRequestException(`Shot ${id} not found.`);
          return shot;
        })
      : plan.shots.filter(
          (shot) => !isCurrent(shot, latestShotRender(journal, shot.id, stage)),
        );
    if (!targets.length)
      throw new BadRequestException(
        stage === 'draft'
          ? 'Every shot already has a current draft.'
          : 'Every shot already has a current final render.',
      );
    for (const shot of targets) {
      if (!shot.action.trim() || !shot.durationSeconds)
        throw new BadRequestException(
          `Describe shot ${shot.ordinal} and set its length before rendering it.`,
        );
      const latest = latestShotRender(journal, shot.id, stage);
      if (latest && isLiveShotRenderOperation(latest))
        throw new ConflictException(
          `Shot ${shot.ordinal} is already rendering.`,
        );
    }
    const model = await this.resolveStageModel(
      organizationId,
      brandId,
      runId,
      config,
      stage,
    );
    const billingMode = await this.billingMode(organizationId, model);
    // Prices follow the clip length and the number of references.
    const priced = new Map<string, number>();
    const lines: RenderLine[] = [];
    for (const shot of targets) {
      const line = shotRenderLine(config, shot, stage, model);
      const priceKey = `${line.durationSeconds}:${line.referenceAssetIds.length}`;
      let credits = priced.get(priceKey);
      if (credits === undefined) {
        credits =
          billingMode === 'byok'
            ? 0
            : await this.price(organizationId, config, model, line);
        priced.set(priceKey, credits);
      }
      lines.push({ ...line, credits });
    }
    const quote = storyboardShotRenderQuoteSchema.parse({
      revision: config.revision,
      stage,
      modelKey: model.modelKey,
      billingMode,
      inputHash: storyboardConfigHash({
        revision: config.revision,
        stage,
        modelKey: model.modelKey,
        billingMode,
        resolution: model.resolution,
        audio: model.audio,
        lines,
      }),
      items: lines.map((line) => ({
        shotId: line.shotId,
        credits: line.credits,
        durationSeconds: line.durationSeconds,
        ...(line.promotedFromOperationId
          ? { promotedFromOperationId: line.promotedFromOperationId }
          : {}),
      })),
      total: lines.reduce((sum, line) => sum + line.credits, 0),
    });
    return { quote, lines, model };
  }

  /**
   * The prompt, references and length of one shot at one stage. A final that
   * follows a current, rendered draft reuses that draft's prompt and
   * references exactly.
   */
  /**
   * The final model is the storyboard's own video model. The draft model is
   * its first catalog sibling on offer to this organization, else the final
   * model itself.
   */
  private async resolveStageModel(
    organizationId: string,
    brandId: string,
    runId: string,
    config: StoryboardStoredRunConfig,
    stage: StoryboardShotRenderStage,
  ): Promise<StageModel> {
    const capabilities = await this.capabilities.resolve(
      organizationId,
      brandId,
      runId,
      config,
    );
    const effective = capabilities.effectiveModel;
    if (capabilities.status !== 'available' || !effective)
      throw new ConflictException(
        'The storyboard video model is unavailable. Choose another model in the plan.',
      );
    const finalRow = await this.models.findOne({
      key: effective.key,
      organizationId,
      isDeleted: false,
    });
    const finalCapability = videoCapability(finalRow);
    if (!finalRow || !finalCapability)
      throw new ConflictException(
        'The storyboard video model has no capabilities in the catalog.',
      );
    if (stage === 'final')
      return shotRenderStageModel(
        stage,
        effective.key,
        String(finalRow.provider),
        finalCapability,
        effective.supportedDurationsSeconds,
      );
    const sibling = (finalCapability.draftModelKeys ?? [])
      .map((key) =>
        capabilities.eligibleModels.find((model) => model.key === key),
      )
      .find((model) => model !== undefined);
    if (sibling) {
      const row = await this.models.findOne({
        key: sibling.key,
        organizationId,
        isDeleted: false,
      });
      const capability = videoCapability(row);
      if (row && capability)
        return shotRenderStageModel(
          stage,
          sibling.key,
          String(row.provider),
          capability,
          sibling.supportedDurationsSeconds,
        );
    }
    return shotRenderStageModel(
      stage,
      effective.key,
      String(finalRow.provider),
      finalCapability,
      effective.supportedDurationsSeconds,
    );
  }

  private async billingMode(
    organizationId: string,
    model: StageModel,
  ): Promise<'platform' | 'byok'> {
    const provider = resolveModelByokProvider(model.modelKey, model.provider);
    const isByok = provider
      ? await this.byok.isByokActiveForProvider(organizationId, provider)
      : false;
    return isByok ? 'byok' : 'platform';
  }

  private async price(
    organizationId: string,
    config: StoryboardStoredRunConfig,
    model: StageModel,
    line: Pick<RenderLine, 'prompt' | 'durationSeconds' | 'referenceAssetIds'>,
  ): Promise<number> {
    const estimate = await this.estimate.estimate({
      organizationId,
      category: 'video',
      modelKey: model.modelKey,
      prompt: line.prompt,
      aspectRatio: config.plan.format,
      dimensions: resolveAgentGenerationDimensions(config.plan.format),
      duration: line.durationSeconds,
      // Stand-ins: a price depends on how many references there are, never
      // on which ones.
      ...(line.referenceAssetIds.length
        ? {
            referenceUrls: line.referenceAssetIds.map(
              (_id, index) => `https://quote.invalid/reference-${index}.png`,
            ),
          }
        : {}),
      ...(model.resolution ? { resolution: model.resolution } : {}),
      ...(model.audio.hasToggle
        ? { isAudioEnabled: model.audio.isEnabled }
        : {}),
      outputs: 1,
    });
    if (
      !estimate.isAvailable ||
      estimate.credits === null ||
      estimate.modelKey !== model.modelKey
    )
      throw new ConflictException(
        'The render model is unavailable or has no valid price.',
      );
    return estimate.credits;
  }

  private async dispatch(
    organizationId: string,
    brandId: string,
    runId: string,
    operation: ShotRenderOperation,
    model: StageModel,
  ): Promise<void> {
    const sourceActionId = renderSourceActionId(runId, operation);
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
    try {
      const response = await this.videos.generateVideo(
        user,
        {
          brandId,
          sourceActionId,
          model: operation.modelKey,
          autoSelectModel: false,
          ...resolveAgentGenerationDimensions(operation.aspectRatio),
          duration: operation.durationSeconds,
          ...(operation.resolution ? { resolution: operation.resolution } : {}),
          ...(model.audio.hasToggle
            ? { isAudioEnabled: operation.isAudioEnabled }
            : {}),
          isDraft: operation.stage === 'draft',
          outputs: 1,
          // The compiled prompt is final: no enhancement and no brand look.
          harness: false,
          brandingMode: 'off',
          isBrandingEnabled: false,
          waitForCompletion: false,
          references: operation.referenceAssetIds,
          text: operation.prompt,
        } as CreateVideoDto,
        request,
        async (assetId) => {
          placeholderId = assetId;
          await this.patch(organizationId, brandId, runId, operation, {
            assetId,
            state: 'submitted',
          });
        },
        {
          groupId: sourceActionId,
          groupIndex: 0,
          settleCreditsExternally: true,
        },
        async () => {
          const credits = request.creditsConfig;
          const charged = credits?.isByokBypass ? 0 : credits?.amount;
          if (
            !credits ||
            charged !== operation.credits ||
            Boolean(credits.isByokBypass) !==
              (operation.billingMode === 'byok') ||
            (operation.credits > 0 && !credits.reservationId)
          ) {
            if (credits?.reservationId)
              await this.release(organizationId, credits.reservationId);
            throw new ConflictException(
              'Render billing changed after the accepted quote.',
            );
          }
          if (credits.reservationId)
            await this.patch(organizationId, brandId, runId, operation, {
              reservationId: credits.reservationId,
              billing: 'reserved',
            });
        },
      );
      if (!response.data?.id)
        throw new ConflictException('The video provider returned no asset.');
    } catch (error: unknown) {
      this.logger.error('Storyboard shot render dispatch failed', error, {
        organizationId,
        brandId,
        runId,
        operationId: operation.operationId,
        hasPlaceholder: Boolean(placeholderId),
      });
      this.report(error, 'STORYBOARD_RENDER_DISPATCH_FAILED', {
        organizationId,
        brandId,
        runId,
        operationId: operation.operationId,
        assetId: placeholderId,
      });
      // A throw out of the video pipeline before the provider accepted the
      // job means nothing ran, so refund now. A placeholder the provider
      // already accepted is left to reconciliation.
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
                  errorCode: 'STORYBOARD_RENDER_DISPATCH_FAILED',
                },
              ],
            ]),
          ),
        );
      }
    }
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
        category: 'VIDEO' as const,
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
        generationError: 'Render was never submitted to the video provider',
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
      tags: { operation: 'storyboard-shot-render', errorCode },
    });
  }

  private async observe(
    organizationId: string,
    brandId: string,
    runId: string,
    operation: ShotRenderOperation,
  ): Promise<RenderOutcome | undefined> {
    const isAbandoned =
      Date.now() - Date.parse(operation.updatedAt) > SHOT_RENDER_ABANDONED_MS;
    if (!operation.assetId) {
      if (!isAbandoned) return undefined;
      const isReleased = await this.releaseHeld(
        organizationId,
        runId,
        operation,
      );
      this.report(
        new Error('Storyboard render was never dispatched'),
        'STORYBOARD_RENDER_NOT_DISPATCHED',
        { operationId: operation.operationId },
      );
      return {
        state: 'failed',
        billing: isReleased ? 'released' : 'none',
        errorCode: 'STORYBOARD_RENDER_NOT_DISPATCHED',
      };
    }
    const asset = await this.prisma.ingredient.findFirst({
      where: scopedWhere(organizationId, {
        brandId,
        id: operation.assetId,
        category: 'VIDEO' as const,
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
      new Error('Storyboard render failed'),
      'STORYBOARD_RENDER_FAILED',
      {
        operationId: operation.operationId,
        assetId: operation.assetId,
        reason: asset?.generationError ?? undefined,
      },
    );
    return {
      state: 'failed',
      billing: isReleased ? 'released' : 'none',
      errorCode: 'STORYBOARD_RENDER_FAILED',
    };
  }

  /** Records outcomes on live operations only, so a finished one never changes. */
  private applyOutcomes(
    current: StoryboardStoredRunConfig,
    outcomes: ReadonlyMap<string, RenderOutcome>,
  ): StoryboardStoredRunConfig {
    const journal = current.shotRenderOperations ?? [];
    if (
      !journal.some(
        (op) => isLiveShotRenderOperation(op) && outcomes.has(op.operationId),
      )
    )
      return current;
    const updatedAt = new Date().toISOString();
    return storyboardStoredRunConfigSchema.parse({
      ...current,
      shotRenderOperations: journal.map((op) => {
        const outcome = outcomes.get(op.operationId);
        return outcome && isLiveShotRenderOperation(op)
          ? { ...op, ...outcome, updatedAt }
          : op;
      }),
    });
  }

  private async settle(
    organizationId: string,
    brandId: string,
    operation: ShotRenderOperation,
  ): Promise<ShotRenderOperation['billing']> {
    if (!operation.reservationId || operation.credits <= 0)
      return operation.billing;
    try {
      await this.credits.settleReservation({
        organizationId,
        actorUserId: operation.actorUserId,
        reservationId: operation.reservationId,
        actualAmount: operation.credits,
        brandId,
        description:
          operation.stage === 'draft'
            ? 'Storyboard shot draft render'
            : 'Storyboard shot final render',
      });
      return 'settled';
    } catch (error: unknown) {
      // An expired or released hold is never charged again.
      if (error instanceof UnsettleableReservationException) return 'released';
      throw error;
    }
  }

  /**
   * Releases the render's hold and says whether it had one. A render whose
   * journal write never landed is found by the identity the pipeline keyed
   * the hold by, so its credits never stay held.
   */
  private async releaseHeld(
    organizationId: string,
    runId: string,
    operation: ShotRenderOperation,
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
    operation: ShotRenderOperation,
  ): Promise<string | undefined> {
    if (operation.credits <= 0 || operation.billingMode === 'byok') return;
    const workloadId = renderSourceActionId(runId, operation);
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
  ): Promise<ShotRenderOperation | undefined> {
    const { config } = await this.store.read(organizationId, brandId, runId);
    return config.shotRenderOperations?.find(
      (op) => op.operationId === operationId,
    );
  }

  private async patch(
    organizationId: string,
    brandId: string,
    runId: string,
    operation: ShotRenderOperation,
    patch: Partial<
      Pick<
        ShotRenderOperation,
        'assetId' | 'reservationId' | 'state' | 'billing'
      >
    >,
  ) {
    await this.mutate(organizationId, brandId, runId, (current) => ({
      ...current,
      shotRenderOperations: (current.shotRenderOperations ?? []).map((op) =>
        op.operationId === operation.operationId &&
        isLiveShotRenderOperation(op)
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
