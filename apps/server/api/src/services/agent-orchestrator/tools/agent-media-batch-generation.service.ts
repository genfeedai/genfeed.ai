import { CredentialsService } from '@api/collections/credentials/services/credentials.service';
import { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import { BatchGenerationCreditsService } from '@api/services/batch-generation/batch-generation-credits.service';
import { BatchGenerationWorkflowService } from '@api/services/batch-generation/batch-generation-workflow.service';
import {
  ActivitySource,
  ContentFormat,
  formatPlatformLabel,
} from '@genfeedai/contracts';
import { estimateBatchGenerationCredits } from '@genfeedai/contracts/constants';
import type { AgentToolResult } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable, Optional } from '@nestjs/common';

interface AgentBrandsServiceLike {
  findOne: (
    params: Record<string, unknown>,
    context?: string,
  ) => Promise<Record<string, unknown> | null>;
}

// DTO *Percent keys differ from estimator ContentFormat keys; this explicit
// shape prevents media-heavy requests from silently using the default mix.
interface ContentMixPercents {
  imagePercent: number;
  videoPercent: number;
  carouselPercent: number;
  reelPercent: number;
  storyPercent: number;
}

type BatchRecord = Awaited<ReturnType<BatchGenerationService['createBatch']>>;

type BatchExecution = {
  batch: BatchRecord;
  batchId: string;
  estimatedCredits: number;
  platformLabel: string;
  platforms: string[];
  pricingOptions: { includeMedia: boolean; qualityTier?: string | null };
};

const BATCH_RESERVATION_TTL_MS = 8 * 24 * 60 * 60 * 1000;

const CONTENT_MIX_PERCENT_KEYS: Readonly<
  Record<ContentFormat, keyof ContentMixPercents>
> = {
  [ContentFormat.IMAGE]: 'imagePercent',
  [ContentFormat.VIDEO]: 'videoPercent',
  [ContentFormat.CAROUSEL]: 'carouselPercent',
  [ContentFormat.REEL]: 'reelPercent',
  [ContentFormat.STORY]: 'storyPercent',
};

// The estimator keys by ContentFormat, while the tool DTO exposes *Percent
// fields. Re-key explicitly so media-heavy mixes are not priced as defaults.

function parseContentMixPercents(
  input: unknown,
): ContentMixPercents | undefined {
  if (!input || typeof input !== 'object') {
    return undefined;
  }
  const raw = input as Record<string, unknown>;
  const readPercent = (key: keyof ContentMixPercents): number => {
    const value = raw[key];
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? value
      : 0;
  };
  const percents: ContentMixPercents = {
    carouselPercent: readPercent('carouselPercent'),
    imagePercent: readPercent('imagePercent'),
    reelPercent: readPercent('reelPercent'),
    storyPercent: readPercent('storyPercent'),
    videoPercent: readPercent('videoPercent'),
  };
  return Object.values(percents).some((percent) => percent > 0)
    ? percents
    : undefined;
}

function toContentFormatMix(
  percents: ContentMixPercents | undefined,
): Partial<Record<ContentFormat, number>> | undefined {
  if (!percents) return undefined;
  const mix: Partial<Record<ContentFormat, number>> = {};
  for (const format of Object.values(ContentFormat)) {
    mix[format] = percents[CONTENT_MIX_PERCENT_KEYS[format]];
  }
  return mix;
}

@Injectable()
export class AgentMediaBatchGenerationService {
  // Preserve the legacy log category so operational searches and alerts keep
  // matching after ownership moved out of the public facade.
  private readonly logContext = 'AgentMediaGenerationToolHandler';

  constructor(
    private readonly loggerService: LoggerService,
    @Inject('AGENT_BRANDS_SERVICE')
    private readonly brandsService: AgentBrandsServiceLike,
    private readonly batchGenerationWorkflowService: BatchGenerationWorkflowService,
    @Optional()
    private readonly batchGenerationService?: BatchGenerationService,
    @Optional()
    private readonly credentialsService?: CredentialsService,
    @Optional()
    private readonly creditsUtilsService?: CreditsUtilsService,
    @Optional()
    private readonly batchCreditsService?: BatchGenerationCreditsService,
  ) {}

  async generateContentBatch(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.batchGenerationService) {
      return {
        creditsUsed: 0,
        error: 'Batch generation service not available',
        success: false,
      };
    }

    const brandId = await this.resolveBrandId(params, ctx);
    if ('error' in brandId) return brandId.error;

    const prepared = this.prepareBatch(params, ctx);
    const execution = await this.createAndReserveBatch(
      params,
      ctx,
      brandId.value,
      prepared,
    );
    if ('error' in execution) return execution.error;

    return this.queueOrRunBatch(execution.value, ctx);
  }

  private async resolveBrandId(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): Promise<{ value: string } | { error: AgentToolResult }> {
    let brandId =
      (params.brandId as string | undefined) ?? ctx.brandId ?? undefined;
    const handle = params.handle as string | undefined;

    if (handle && !brandId && this.credentialsService) {
      const credential =
        typeof this.credentialsService.findByHandle === 'function'
          ? await this.credentialsService.findByHandle(
              handle,
              ctx.organizationId,
            )
          : null;
      if (!credential) {
        return {
          error: {
            creditsUsed: 0,
            error: `No connected credential found for handle "${handle}"`,
            success: false,
          },
        };
      }
      brandId = credential.brandId ?? undefined;
    }

    if (!brandId) {
      const selectedBrand = await this.brandsService.findOne({
        isDeleted: false,
        isSelected: true,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      });
      if (selectedBrand?.id) brandId = String(selectedBrand.id);
    }

    return brandId
      ? { value: brandId }
      : {
          error: {
            creditsUsed: 0,
            error: 'brandId or handle is required',
            success: false,
          },
        };
  }

  private prepareBatch(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
  ): {
    contentMix?: ContentMixPercents;
    count: number;
    dateRange: Record<string, string>;
    estimatedCredits: number;
    platforms: string[];
    pricingOptions: BatchExecution['pricingOptions'];
  } {
    const count = (params.count as number) || 10;
    const platforms = (params.platforms as string[]) || ['instagram'];
    const pricingOptions = {
      // Caption-first pricing: drafts do not own generated media yet.
      includeMedia: false,
      qualityTier: ctx.qualityTier,
    };
    const contentMix = parseContentMixPercents(params.contentMix);
    const estimatedCredits = estimateBatchGenerationCredits(
      { contentMix: toContentFormatMix(contentMix), count, platforms },
      pricingOptions,
    );
    const dateRange = (params.dateRange as Record<string, string>) || {
      end: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      start: new Date().toISOString(),
    };
    return {
      contentMix,
      count,
      dateRange,
      estimatedCredits,
      platforms,
      pricingOptions,
    };
  }

  private async createAndReserveBatch(
    params: Record<string, unknown>,
    ctx: ToolExecutionContext,
    brandId: string,
    prepared: ReturnType<AgentMediaBatchGenerationService['prepareBatch']>,
  ): Promise<{ value: BatchExecution } | { error: AgentToolResult }> {
    if (!this.batchGenerationService) {
      return {
        error: {
          creditsUsed: 0,
          error: 'Batch generation service not available',
          success: false,
        },
      };
    }
    let batch: BatchRecord;
    // createBatch persists items before credits move; if reserve fails, the
    // compensation below must cancel them or #2696 leaves an orphan batch.
    // createBatch validates platforms before generation or credit movement.
    try {
      batch = await this.batchGenerationService.createBatch(
        {
          brandId,
          contentMix: prepared.contentMix,
          count: prepared.count,
          dateRange: {
            end: prepared.dateRange.end,
            start: prepared.dateRange.start,
          },
          platforms: prepared.platforms,
          style: params.style as string | undefined,
          topics: params.topics as string[] | undefined,
        },
        ctx.userId,
        ctx.organizationId,
      );
    } catch (error) {
      return {
        error: {
          creditsUsed: 0,
          error:
            error instanceof Error ? error.message : 'Failed to create batch',
          success: false,
        },
      };
    }

    const batchId = String(batch.id);
    // Atomic reserve plus the batch reference claim prevents concurrent spend.
    const reservation = await this.reserveCreditsOrCancel({
      amount: prepared.estimatedCredits,
      batchId,
      ctx,
    });
    if ('error' in reservation) return reservation;

    // Pin pricing before work so settlement moves only the eventual delta.
    // Only a held reservation needs pinning: deployments without managed credits
    // take no hold, so there is nothing to record and nothing to compensate.
    let recorded = true;
    if (reservation.reservationId) {
      try {
        recorded =
          (await this.batchCreditsService?.recordUpfrontCharge({
            batchId,
            credits: prepared.estimatedCredits,
            organizationId: ctx.organizationId,
            pricingOptions: prepared.pricingOptions,
            reservationId: reservation.reservationId,
          })) === true;
      } catch (recordError) {
        this.loggerService.warn(
          `${this.logContext} failed to record a batch reservation`,
          { batchId, organizationId: ctx.organizationId, recordError },
        );
        recorded = false;
      }
    }
    if (!recorded) {
      await this.compensateUnrecordedReservation({
        batchId,
        organizationId: ctx.organizationId,
        reservationId: reservation.reservationId,
      });
      return {
        error: {
          creditsUsed: 0,
          error: 'Batch credit reservation could not be recorded',
          success: false,
        },
      };
    }

    return {
      value: {
        batch,
        batchId,
        estimatedCredits: prepared.estimatedCredits,
        platformLabel: this.formatBatchPlatformsLabel(prepared.platforms),
        platforms: prepared.platforms,
        pricingOptions: prepared.pricingOptions,
      },
    };
  }

  private async compensateUnqueuedBatch(
    execution: BatchExecution,
    ctx: ToolExecutionContext,
    queueError: unknown,
  ): Promise<AgentToolResult> {
    try {
      await this.batchGenerationService?.cancelBatch(
        execution.batchId,
        ctx.organizationId,
      );
    } catch (cancelError) {
      this.loggerService.warn(
        `${this.logContext} failed to cancel a batch that was never queued`,
        {
          batchId: execution.batchId,
          cancelError,
          organizationId: ctx.organizationId,
        },
      );
    }

    try {
      // The charge is already pinned, so settlement — not release — returns the
      // unspent credits for a batch that produced nothing.
      await this.batchCreditsService?.settleBatchCredits({
        batchId: execution.batchId,
        organizationId: ctx.organizationId,
        userId: ctx.userId,
      });
    } catch (settleError) {
      this.loggerService.warn(
        `${this.logContext} failed to settle a batch that was never queued`,
        {
          batchId: execution.batchId,
          organizationId: ctx.organizationId,
          settleError,
        },
      );
    }

    return {
      creditsUsed: 0,
      error:
        queueError instanceof Error
          ? queueError.message
          : 'Batch could not be queued',
      success: false,
    };
  }

  private async compensateUnrecordedReservation(params: {
    batchId: string;
    organizationId: string;
    reservationId?: string;
  }): Promise<void> {
    if (params.reservationId) {
      try {
        await this.creditsUtilsService?.releaseReservation({
          organizationId: params.organizationId,
          reservationId: params.reservationId,
        });
      } catch (releaseError) {
        this.loggerService.warn(
          `${this.logContext} failed to release an unrecorded batch reservation`,
          { ...params, releaseError },
        );
      }
    }

    try {
      await this.batchGenerationService?.cancelBatch(
        params.batchId,
        params.organizationId,
      );
    } catch (cancelError) {
      this.loggerService.warn(
        `${this.logContext} failed to cancel a batch with an unrecorded reservation`,
        { ...params, cancelError },
      );
    }
  }

  private async reserveCreditsOrCancel(params: {
    amount: number;
    batchId: string;
    ctx: ToolExecutionContext;
  }): Promise<{ reservationId?: string } | { error: AgentToolResult }> {
    try {
      if (this.creditsUtilsService && params.amount > 0) {
        const reservation = await this.creditsUtilsService.reserveCredits({
          actorUserId: params.ctx.userId,
          amount: params.amount,
          expiresAt: new Date(Date.now() + BATCH_RESERVATION_TTL_MS),
          idempotencyKey: `batch-generation:${params.batchId}`,
          organizationId: params.ctx.organizationId,
          workloadId: params.batchId,
          workloadType: 'batch-generation',
        });
        return { reservationId: reservation.id };
      }
      return {};
    } catch (error) {
      try {
        await this.batchGenerationService?.cancelBatch(
          params.batchId,
          params.ctx.organizationId,
        );
      } catch (cancelError) {
        this.loggerService.warn(
          `${this.logContext} failed to cancel batch after credit reserve failure`,
          {
            batchId: params.batchId,
            cancelError,
            organizationId: params.ctx.organizationId,
          },
        );
      }
      return {
        error: {
          creditsUsed: 0,
          error:
            error instanceof Error
              ? error.message
              : `Insufficient credits. This batch needs about ${params.amount} credits.`,
          success: false,
        },
      };
    }
  }

  private async queueOrRunBatch(
    execution: BatchExecution,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    try {
      await this.batchGenerationWorkflowService.queueBatch({
        batchId: execution.batchId,
        organizationId: ctx.organizationId,
        runId: ctx.runId,
        threadId: ctx.threadId,
        userId: ctx.userId,
      });
    } catch (queueError) {
      // The queue owns durable execution: without ownership nothing will ever
      // process the batch, so unwind the items and the pinned charge here.
      return this.compensateUnqueuedBatch(execution, ctx, queueError);
    }
    return {
      creditsUsed: execution.estimatedCredits,
      data: {
        batchId: execution.batchId,
        estimatedCredits: execution.estimatedCredits,
        message: `Batch created with ${execution.batch.totalCount} items. Processing started.`,
        status: execution.batch.status,
        totalCount: execution.batch.totalCount,
      },
      isBillingDelegated: true,
      success: true,
    };
  }

  private formatBatchPlatformsLabel(platforms: string[]): string {
    if (platforms.length === 0) return 'content';
    if (platforms.length === 1) {
      return formatPlatformLabel(platforms[0]) ?? platforms[0];
    }
    return platforms
      .map((platform) => formatPlatformLabel(platform) ?? platform)
      .join(', ');
  }
}
