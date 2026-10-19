import { randomUUID } from 'node:crypto';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { storyboardConfigHash } from '@api/collections/content-runs/services/storyboard-config-hash';
import {
  type StoryboardStoredRunConfig,
  storyboardStoredRunConfigSchema,
} from '@api/collections/content-runs/services/storyboard-imported-run-state.schema';
import {
  assertStoryboardEditable,
  assertStoryboardPlan,
  type StoryboardEditableConfig,
} from '@api/collections/content-runs/services/storyboard-plan-state';
import {
  projectStoryboardRun,
  StoryboardRunStoreService,
} from '@api/collections/content-runs/services/storyboard-run-store.service';
import { StoryboardSourceService } from '@api/collections/content-runs/services/storyboard-source.service';
import {
  appendStillOperations,
  isLiveStillOperation,
  STILL_ABANDONED_MS,
  type StillOperation,
  storyboardStillInput,
} from '@api/collections/content-runs/services/storyboard-still-state';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { CreateImageDto } from '@api/collections/images/dto/create-image.dto';
import { ImageGenerationService } from '@api/collections/images/services/image-generation.service';
import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import { UnsettleableReservationException } from '@api/exceptions/business-logic.exception';
import type { DeferredCreditsRequest } from '@api/helpers/utils/credits/generation-credit-cost.util';
import { scopedWhere } from '@api/index';
import { ByokService } from '@api/services/byok/byok.service';
import { AgentGenerationEstimateService } from '@api/services/router/agent-generation-estimate.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ByokProvider } from '@genfeedai/contracts';
import type { StoryboardRun } from '@genfeedai/contracts/api-types/contracts/storyboard-run.contract';
import {
  generateStoryboardStillsSchema,
  quoteStoryboardStillsSchema,
  type StoryboardStillQuote,
  storyboardStillQuoteSchema,
} from '@genfeedai/contracts/api-types/contracts/storyboard-still.contract';
import {
  DRAFT_GENERATION_CONFIG,
  resolveAgentGenerationDimensions,
} from '@genfeedai/contracts/constants';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import * as Sentry from '@sentry/nestjs';
import type { ZodType } from 'zod';

const MUTATION_ATTEMPTS = 5;
type StillOutcome = Pick<
  StillOperation,
  'state' | 'billing' | 'assetId' | 'errorCode'
>;

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
 * Sketch stills for drafted storyboard shots (#6890). A creator quotes, then
 * accepts the quote; each still is an async FLUX.2 klein job whose credits
 * the image pipeline holds and this service settles only for a still that
 * renders, or releases when it fails.
 */
@Injectable()
export class StoryboardStillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: StoryboardRunStoreService,
    private readonly source: StoryboardSourceService,
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
  ): Promise<StoryboardStillQuote> {
    const input = parseInput(quoteStoryboardStillsSchema, body);
    const { config } = await this.store.read(
      organizationId,
      brandId,
      runId,
      input.expectedRevision,
    );
    return this.buildQuote(organizationId, config, input.shotIds);
  }

  async generate(
    organizationId: string,
    brandId: string,
    runId: string,
    userId: string,
    body: unknown,
  ): Promise<StoryboardRun> {
    const input = parseInput(generateStoryboardStillsSchema, body);
    const { config } = await this.store.read(
      organizationId,
      brandId,
      runId,
      input.expectedRevision,
    );
    const quote = await this.buildQuote(organizationId, config, input.shotIds);
    if (quote.inputHash !== input.inputHash)
      throw new ConflictException(
        'The storyboard or the still price changed. Review the new quote.',
      );
    assertStoryboardPlan(config);
    await this.source.validatePlanAssets(organizationId, brandId, config.plan);
    const now = new Date().toISOString();
    const operations: StillOperation[] = quote.items.map((item) => {
      const still = storyboardStillInput(config.plan, item.shotId);
      return {
        version: 1,
        operationId: randomUUID(),
        shotId: item.shotId,
        actorUserId: userId,
        modelKey: quote.modelKey,
        credits: item.credits,
        billingMode: quote.billingMode,
        fingerprint: still.fingerprint,
        prompt: still.prompt,
        referenceAssetIds: still.referenceAssetIds,
        aspectRatio: still.aspectRatio,
        createdAt: now,
        updatedAt: now,
        state: 'pending',
        billing: 'none',
      };
    });
    await this.mutate(organizationId, brandId, runId, (current) => {
      // The quote was bound to this exact revision and these still inputs.
      if (current.revision !== quote.revision)
        throw new ConflictException(
          'The storyboard changed. Review the new quote.',
        );
      const plan = this.draftPlan(current).plan;
      const ids = new Set(quote.items.map((item) => item.shotId));
      if (
        plan.shots.some(
          (shot) => ids.has(shot.id) && shot.stillFreshness === 'generating',
        )
      )
        throw new ConflictException(
          'A still for one of these shots is already generating.',
        );
      return storyboardStoredRunConfigSchema.parse({
        ...current,
        stillOperations: appendStillOperations(
          current.stillOperations ?? [],
          operations,
        ),
        plan: {
          ...plan,
          shots: plan.shots.map((shot) =>
            ids.has(shot.id)
              ? { ...shot, stillFreshness: 'generating' as const }
              : shot,
          ),
        },
      });
    });
    // One at a time: each dispatch records its placeholder and hold in the
    // same run document, so parallel writers would only contend.
    for (const operation of operations)
      await this.dispatch(organizationId, brandId, runId, operation);
    return this.reconcile(organizationId, brandId, runId);
  }

  /**
   * Records finished stills: a rendered still is charged and attached, a
   * failed or abandoned one is refunded. Safe to call repeatedly; clients
   * poll it while any shot is generating.
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
    const live = (config.stillOperations ?? []).filter(isLiveStillOperation);
    const outcomes = new Map<string, StillOutcome>();
    for (const operation of live) {
      const outcome = await this.observe(organizationId, brandId, operation);
      if (outcome) outcomes.set(operation.operationId, outcome);
    }
    if (!outcomes.size) return projectStoryboardRun(record);
    const next = await this.mutate(organizationId, brandId, runId, (current) =>
      this.applyOutcomes(current, outcomes),
    );
    return next;
  }

  private draftPlan(
    config: StoryboardStoredRunConfig,
  ): StoryboardEditableConfig {
    assertStoryboardPlan(config);
    return config;
  }

  private async buildQuote(
    organizationId: string,
    config: StoryboardStoredRunConfig,
    shotIds?: readonly string[],
  ): Promise<StoryboardStillQuote> {
    const { plan } = this.draftPlan(config);
    if (config.state !== 'storyboard')
      throw new ConflictException(
        'Stills can be generated only while the storyboard is a draft. Edit the plan first.',
      );
    assertStoryboardEditable(config);
    const targets = shotIds
      ? shotIds.map((id) => {
          const shot = plan.shots.find((candidate) => candidate.id === id);
          if (!shot) throw new BadRequestException(`Shot ${id} not found.`);
          return shot;
        })
      : // Shots without an action are left for the creator to describe.
        plan.shots.filter(
          (shot) =>
            Boolean(shot.action.trim()) &&
            ['missing', 'stale', 'failed'].includes(shot.stillFreshness),
        );
    if (!targets.length)
      throw new BadRequestException('No described shot needs a new still.');
    for (const shot of targets) {
      if (!shot.action.trim())
        throw new BadRequestException(
          `Describe the action of shot ${shot.ordinal} before generating its still.`,
        );
      if (shot.stillFreshness === 'generating')
        throw new ConflictException(
          `The still for shot ${shot.ordinal} is already generating.`,
        );
    }
    const modelKey = DRAFT_GENERATION_CONFIG.draftModelKey;
    const stills = targets.map((shot) => ({
      shotId: shot.id,
      ...storyboardStillInput(plan, shot.id),
    }));
    const estimate = await this.estimate.estimate({
      organizationId,
      category: 'image',
      modelKey,
      prompt: stills[0]?.prompt,
      aspectRatio: plan.format,
      dimensions: resolveAgentGenerationDimensions(plan.format),
      resolution: DRAFT_GENERATION_CONFIG.outputMegapixels,
      outputs: 1,
    });
    if (
      !estimate.isAvailable ||
      estimate.credits === null ||
      estimate.modelKey !== modelKey
    )
      throw new ConflictException(
        'The sketch model is unavailable or has no valid price.',
      );
    const isByok = await this.byok.isByokActiveForProvider(
      organizationId,
      ByokProvider.REPLICATE,
    );
    const credits = isByok ? 0 : estimate.credits;
    const billingMode = isByok ? ('byok' as const) : ('platform' as const);
    const items = stills.map(({ shotId }) => ({ shotId, credits }));
    return storyboardStillQuoteSchema.parse({
      revision: config.revision,
      modelKey,
      billingMode,
      inputHash: storyboardConfigHash({
        revision: config.revision,
        modelKey,
        billingMode,
        stills: stills.map(({ shotId, fingerprint }) => ({
          shotId,
          credits,
          fingerprint,
        })),
      }),
      items,
      total: items.reduce((sum, item) => sum + item.credits, 0),
    });
  }

  private async dispatch(
    organizationId: string,
    brandId: string,
    runId: string,
    operation: StillOperation,
  ): Promise<void> {
    const sourceActionId = `storyboard-still-${runId}-${operation.operationId}`;
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
      const response = await this.images.generateImage(
        user,
        {
          brandId,
          sourceActionId,
          model: operation.modelKey,
          autoSelectModel: false,
          ...resolveAgentGenerationDimensions(operation.aspectRatio),
          aspectRatio: operation.aspectRatio,
          resolution: DRAFT_GENERATION_CONFIG.outputMegapixels,
          outputs: 1,
          // The sketch prompt is final: no enhancement and no brand look.
          harness: false,
          brandingMode: 'off',
          isBrandingEnabled: false,
          waitForCompletion: false,
          references: operation.referenceAssetIds,
          text: operation.prompt,
        } as CreateImageDto,
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
              'Still billing changed after the accepted quote.',
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
        throw new ConflictException('The image provider returned no asset.');
    } catch (error: unknown) {
      this.logger.error('Storyboard still dispatch failed', error, {
        organizationId,
        brandId,
        runId,
        operationId: operation.operationId,
        hasPlaceholder: Boolean(placeholderId),
      });
      this.report(error, 'STORYBOARD_STILL_DISPATCH_FAILED', {
        organizationId,
        brandId,
        runId,
        operationId: operation.operationId,
        assetId: placeholderId,
      });
      // A throw out of the image pipeline means no provider call was made, so
      // refund now rather than waiting for the abandoned-still sweep. A
      // placeholder the provider already accepted is left to reconciliation.
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
                  errorCode: 'STORYBOARD_STILL_DISPATCH_FAILED',
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
        generationError: 'Still was never submitted to the image provider',
        status: 'FAILED' as const,
      },
    });
  }

  private reportFailedStill(
    operation: StillOperation,
    errorCode: string,
    reason?: string,
  ) {
    this.report(new Error(`Storyboard still failed: ${errorCode}`), errorCode, {
      operationId: operation.operationId,
      assetId: operation.assetId,
      reservationId: operation.reservationId,
      reason,
    });
  }

  private report(
    error: unknown,
    errorCode: string,
    extra: Record<string, unknown>,
  ) {
    Sentry.captureException(error, {
      extra,
      tags: { operation: 'storyboard-still', errorCode },
    });
  }

  private async observe(
    organizationId: string,
    brandId: string,
    operation: StillOperation,
  ): Promise<StillOutcome | undefined> {
    const isAbandoned =
      Date.now() - Date.parse(operation.updatedAt) > STILL_ABANDONED_MS;
    if (!operation.assetId) {
      if (!isAbandoned) return undefined;
      await this.releaseHeld(organizationId, operation);
      this.reportFailedStill(operation, 'STORYBOARD_STILL_NOT_DISPATCHED');
      return {
        state: 'failed',
        billing: operation.reservationId ? 'released' : 'none',
        errorCode: 'STORYBOARD_STILL_NOT_DISPATCHED',
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
    // The image pipeline records `externalProvider` before it calls the
    // provider, so only a missing `externalId` proves nothing was submitted.
    const isUndispatched =
      status === 'PROCESSING' && isAbandoned && !asset?.metadata?.externalId;
    if (status !== 'FAILED' && !isUndispatched) return undefined;
    if (isUndispatched)
      await this.failPlaceholder(organizationId, brandId, operation.assetId);
    await this.releaseHeld(organizationId, operation);
    this.reportFailedStill(
      operation,
      'STORYBOARD_STILL_GENERATION_FAILED',
      asset?.generationError ?? undefined,
    );
    return {
      state: 'failed',
      billing: operation.reservationId ? 'released' : 'none',
      errorCode: 'STORYBOARD_STILL_GENERATION_FAILED',
    };
  }

  /** Attaches rendered stills to their shots; failures leave the shot `failed`. */
  private applyOutcomes(
    current: StoryboardStoredRunConfig,
    outcomes: ReadonlyMap<string, StillOutcome>,
  ): StoryboardStoredRunConfig {
    const journal = current.stillOperations ?? [];
    const finished = journal.filter(
      (op) => isLiveStillOperation(op) && outcomes.has(op.operationId),
    );
    if (!finished.length || !current.plan) return current;
    const updatedAt = new Date().toISOString();
    const plan = current.plan;
    const byShot = new Map(finished.map((op) => [op.shotId, op]));
    return storyboardStoredRunConfigSchema.parse({
      ...current,
      stillOperations: journal.map((op) => {
        const outcome = outcomes.get(op.operationId);
        return outcome && isLiveStillOperation(op)
          ? { ...op, ...outcome, updatedAt }
          : op;
      }),
      plan: {
        ...plan,
        shots: plan.shots.map((shot) => {
          const op = byShot.get(shot.id);
          const outcome = op ? outcomes.get(op.operationId) : undefined;
          if (!op || !outcome) return shot;
          const isCurrent = shot.stillFreshness === 'generating';
          if (outcome.state === 'failed')
            return isCurrent ? { ...shot, stillFreshness: 'failed' } : shot;
          // An edit or source change while generating makes the result stale.
          const isFresh =
            isCurrent &&
            storyboardStillInput(plan, shot.id).fingerprint === op.fingerprint;
          return {
            ...shot,
            stillAssetId: outcome.assetId,
            stillFreshness: isFresh ? 'fresh' : 'stale',
          };
        }),
      },
    });
  }

  private async settle(
    organizationId: string,
    brandId: string,
    operation: StillOperation,
  ): Promise<StillOperation['billing']> {
    if (!operation.reservationId || operation.credits <= 0)
      return operation.billing;
    try {
      await this.credits.settleReservation({
        organizationId,
        actorUserId: operation.actorUserId,
        reservationId: operation.reservationId,
        actualAmount: operation.credits,
        brandId,
        description: 'Storyboard sketch still',
      });
      return 'settled';
    } catch (error: unknown) {
      // An expired or released hold is never charged again.
      if (error instanceof UnsettleableReservationException) return 'released';
      throw error;
    }
  }

  private async releaseHeld(organizationId: string, operation: StillOperation) {
    if (operation.reservationId)
      await this.release(organizationId, operation.reservationId);
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
  ): Promise<StillOperation | undefined> {
    const { config } = await this.store.read(organizationId, brandId, runId);
    return config.stillOperations?.find((op) => op.operationId === operationId);
  }

  private async patch(
    organizationId: string,
    brandId: string,
    runId: string,
    operation: StillOperation,
    patch: Partial<
      Pick<StillOperation, 'assetId' | 'reservationId' | 'state' | 'billing'>
    >,
  ) {
    await this.mutate(organizationId, brandId, runId, (current) => ({
      ...current,
      stillOperations: (current.stillOperations ?? []).map((op) =>
        op.operationId === operation.operationId && isLiveStillOperation(op)
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
