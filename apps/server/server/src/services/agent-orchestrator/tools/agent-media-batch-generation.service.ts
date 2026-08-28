import {
  chargeBatchGenerationCredits,
  estimateBatchGenerationCredits,
} from '@genfeedai/constants';
import { ContentFormat, formatPlatformLabel } from '@genfeedai/enums';
import type { AgentToolResult } from '@genfeedai/interfaces';
import { AgentToolName } from '@genfeedai/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { Inject, Injectable, Optional } from '@nestjs/common';
import { CredentialsService } from '@server/collections/credentials/services/credentials.service';
import { CreditsUtilsService } from '@server/collections/credits/services/credits.utils.service';
import { runEffectPromise } from '@server/helpers/utils/effect/effect.util';
import { BatchGenerationQueueService } from '@server/queues/batch-generation/batch-generation-queue.service';
import { AgentStreamPublisherService } from '@server/services/agent-orchestrator/agent-stream-publisher.service';
import type { ToolExecutionContext } from '@server/services/agent-orchestrator/tools/agent-tool-executor.service';
import {
  BATCH_POST_PREVIEW_LIMIT,
  takeBatchPostPreviews,
} from '@server/services/agent-orchestrator/tools/batch-post-preview.util';
import { BatchGenerationService } from '@server/services/batch-generation/batch-generation.service';
import { BatchGenerationCreditsService } from '@server/services/batch-generation/batch-generation-credits.service';
import { BatchGenerationStreamService } from '@server/services/batch-generation/batch-generation-stream.service';
import { Effect } from 'effect';

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

type StreamedBatchItem = {
  error?: string;
  format?: string;
  hasMedia?: boolean;
  index: number;
  platform?: string;
  postId?: string;
  previewText?: string;
  status: 'completed' | 'failed';
  topic: string;
};

type BatchRecord = Awaited<ReturnType<BatchGenerationService['createBatch']>>;

type StreamToolExecutionContext = ToolExecutionContext & { threadId: string };

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
    @Optional()
    private readonly batchGenerationService?: BatchGenerationService,
    @Optional()
    private readonly credentialsService?: CredentialsService,
    @Optional()
    private readonly streamPublisher?: AgentStreamPublisherService,
    @Optional()
    private readonly creditsUtilsService?: CreditsUtilsService,
    @Optional()
    private readonly batchCreditsService?: BatchGenerationCreditsService,
    @Optional()
    private readonly batchStreamService?: BatchGenerationStreamService,
    @Optional()
    private readonly batchGenerationQueueService?: BatchGenerationQueueService,
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

    if (ctx.streamBatchToUser && ctx.threadId && ctx.userId) {
      return this.processStreamedBatch(execution.value, ctx);
    }

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

    let recorded: boolean | undefined;
    try {
      recorded = await this.batchCreditsService?.recordUpfrontCharge({
        batchId,
        credits: prepared.estimatedCredits,
        organizationId: ctx.organizationId,
        pricingOptions: prepared.pricingOptions,
        reservationId: reservation.reservationId,
      });
    } catch (recordError) {
      this.loggerService.warn(
        `${this.logContext} failed to record a batch reservation`,
        { batchId, organizationId: ctx.organizationId, recordError },
      );
      recorded = false;
    }
    if (this.batchCreditsService && recorded !== true) {
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

  private async processStreamedBatch(
    execution: BatchExecution,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    if (!this.batchGenerationService || !ctx.threadId || !ctx.userId) {
      return this.queueOrRunBatch(execution, ctx);
    }
    const streamContext: StreamToolExecutionContext = {
      ...ctx,
      threadId: ctx.threadId,
    };
    const streamedItems: StreamedBatchItem[] = [];
    const streamedBlocks: string[] = [];
    let streamedTranscript =
      `Creating ${execution.batch.totalCount} ${execution.platformLabel} post${execution.batch.totalCount === 1 ? '' : 's'}. ` +
      'I will stream each draft as soon as it is ready.';
    await this.publishBatchStarted(
      streamedTranscript,
      execution.batch.totalCount,
      streamContext,
    );

    const summary = await this.batchGenerationService.processBatch(
      execution.batchId,
      ctx.organizationId,
      this.buildStreamingCallbacks(
        execution.batchId,
        streamedItems,
        streamedBlocks,
        streamContext,
      ),
    );
    const summaryText =
      `\n\nBatch complete. ${summary.completedCount} of ${summary.totalCount} ` +
      `post${summary.totalCount === 1 ? '' : 's'} ready` +
      `${summary.failedCount > 0 ? `, ${summary.failedCount} failed.` : '.'}`;
    streamedTranscript += streamedBlocks.join('');
    streamedTranscript += summaryText;
    await runEffectPromise(
      this.publishTokenEffect({
        runId: streamContext.runId,
        threadId: streamContext.threadId,
        token: summaryText,
        userId: streamContext.userId,
      }),
    );

    return this.buildStreamedResult({
      ctx: streamContext,
      execution,
      streamedItems,
      streamedTranscript,
      summary,
    });
  }

  private buildStreamingCallbacks(
    batchId: string,
    streamedItems: StreamedBatchItem[],
    streamedBlocks: string[],
    ctx: StreamToolExecutionContext,
  ): Parameters<BatchGenerationService['processBatch']>[2] {
    return {
      onItemCompleted: async (event) => {
        const item: StreamedBatchItem = {
          format: event.item.format,
          hasMedia: Boolean(event.item.mediaUrl),
          index: event.index,
          platform: event.item.platform,
          postId: event.postId,
          previewText: event.previewText,
          status: 'completed',
          topic: event.topic,
        };
        streamedItems.push(item);
        streamedBlocks.push(
          this.formatStreamedItemBlock(item, event.totalCount),
        );
        await this.publishStreamedItem(item, event.totalCount, batchId, ctx, {
          detail: `Draft ${event.completedCount}/${event.totalCount} is ready.`,
          progress: Math.round((event.completedCount / event.totalCount) * 100),
          status: 'completed',
        });
      },
      onItemFailed: async (event) => {
        const item: StreamedBatchItem = {
          error: event.error,
          format: event.item.format,
          hasMedia: Boolean(event.item.mediaUrl),
          index: event.index,
          platform: event.item.platform,
          status: 'failed',
          topic: event.topic,
        };
        streamedItems.push(item);
        const completedCount = streamedItems.filter(
          (entry) => entry.status === 'completed',
        ).length;
        streamedBlocks.push(
          this.formatStreamedItemBlock(item, event.totalCount),
        );
        await this.publishStreamedItem(item, event.totalCount, batchId, ctx, {
          detail: event.error || 'Draft generation failed.',
          progress: Math.round(
            ((event.failedCount + completedCount) / event.totalCount) * 100,
          ),
          status: 'failed',
        });
      },
      onItemStarted: async (event) => {
        await runEffectPromise(
          this.publishWorkEventEffect({
            detail: `Generating draft ${event.index + 1}/${event.totalCount}.`,
            event: 'tool_started',
            label: `Generating post ${event.index + 1}`,
            parameters: {
              batchId,
              format: event.item.format,
              platform: event.item.platform,
            },
            progress: Math.round(
              ((event.completedCount + event.failedCount) /
                Math.max(event.totalCount, 1)) *
                100,
            ),
            runId: ctx.runId,
            status: 'running',
            threadId: ctx.threadId,
            toolName: AgentToolName.GENERATE_CONTENT_BATCH,
            userId: ctx.userId,
          }),
        );
      },
    };
  }

  private async publishBatchStarted(
    transcript: string,
    totalCount: number,
    ctx: StreamToolExecutionContext,
  ): Promise<void> {
    await runEffectPromise(
      this.publishTokenEffect({
        runId: ctx.runId,
        threadId: ctx.threadId,
        token: transcript,
        userId: ctx.userId,
      }),
    );
    await runEffectPromise(
      this.publishWorkEventEffect({
        detail: `Queued ${totalCount} post${totalCount === 1 ? '' : 's'} for generation.`,
        event: 'started',
        label: 'Batch generation started',
        progress: 0,
        runId: ctx.runId,
        startedAt: new Date().toISOString(),
        status: 'running',
        threadId: ctx.threadId,
        userId: ctx.userId,
      }),
    );
  }

  private async publishStreamedItem(
    item: StreamedBatchItem,
    totalCount: number,
    batchId: string,
    ctx: StreamToolExecutionContext,
    outcome: {
      detail: string;
      progress: number;
      status: 'completed' | 'failed';
    },
  ): Promise<void> {
    const block = this.formatStreamedItemBlock(item, totalCount);
    await runEffectPromise(
      this.publishWorkEventEffect({
        detail: outcome.detail,
        event: 'tool_completed',
        label: `${outcome.status === 'failed' ? 'Failed' : 'Generated'} post ${item.index + 1}`,
        parameters:
          item.status === 'completed'
            ? {
                batchId,
                platform: item.platform,
                postId: item.postId,
                previewText: item.previewText,
                topic: item.topic,
              }
            : { batchId, platform: item.platform, topic: item.topic },
        progress: outcome.progress,
        resultSummary:
          item.status === 'completed'
            ? item.previewText || item.topic
            : item.error || 'Unknown error',
        runId: ctx.runId,
        status: outcome.status,
        threadId: ctx.threadId,
        toolName: AgentToolName.GENERATE_CONTENT_BATCH,
        userId: ctx.userId,
      }),
    );
    await runEffectPromise(
      this.publishTokenEffect({
        runId: ctx.runId,
        threadId: ctx.threadId,
        token: block,
        userId: ctx.userId,
      }),
    );
  }

  private async buildStreamedResult(params: {
    ctx: ToolExecutionContext;
    execution: BatchExecution;
    streamedItems: StreamedBatchItem[];
    streamedTranscript: string;
    summary: Awaited<ReturnType<BatchGenerationService['processBatch']>>;
  }): Promise<AgentToolResult> {
    const settlement = await this.batchCreditsService?.settleBatchCredits({
      batchId: params.execution.batchId,
      organizationId: params.ctx.organizationId,
      userId: params.ctx.userId,
    });
    // Streamed settlement refunds partial failures against the reservation.
    const creditsUsed =
      settlement?.settledCredits ??
      chargeBatchGenerationCredits(
        params.streamedItems
          .filter((entry) => entry.status === 'completed' && entry.postId)
          .map((entry) => ({
            format: entry.format ?? 'image',
            hasMedia: Boolean(entry.hasMedia),
          })),
        params.execution.pricingOptions,
      );
    const { previews, remainingCount } = takeBatchPostPreviews(
      params.streamedItems,
      { limit: BATCH_POST_PREVIEW_LIMIT },
    );
    // Previews are already limited server-side; the card links to the full set.
    const readyCount = params.summary.completedCount;
    const viewAllLabel =
      readyCount > BATCH_POST_PREVIEW_LIMIT
        ? `View all ${readyCount} posts`
        : readyCount > 0
          ? 'Open reviews'
          : 'Open Review Queue';

    return {
      creditsUsed,
      data: {
        batchId: params.execution.batchId,
        completedCount: params.summary.completedCount,
        creditsUsed,
        estimatedCredits: params.execution.estimatedCredits,
        failedCount: params.summary.failedCount,
        message:
          params.summary.failedCount > 0
            ? `Batch finished with ${params.summary.completedCount} ready and ${params.summary.failedCount} failed.`
            : `Batch finished with ${params.summary.completedCount} generated post${params.summary.completedCount === 1 ? '' : 's'}.`,
        previewLimit: BATCH_POST_PREVIEW_LIMIT,
        remainingCount,
        status: params.summary.status,
        streamedItems: params.streamedItems,
        streamedTranscript: params.streamedTranscript,
        totalCount: params.summary.totalCount,
      },
      isBillingDelegated: true,
      nextActions: [
        {
          batchCount: params.execution.batch.totalCount,
          completedCount: params.summary.completedCount,
          creditEstimate: creditsUsed,
          creditsUsed,
          ctas: [
            {
              href: `/publish/review?batch=${params.execution.batchId}&filter=ready`,
              label: viewAllLabel,
            },
            { href: '/calendar/posts', label: 'Open Calendar' },
          ],
          description:
            params.summary.completedCount > 0
              ? `Generated ${params.summary.completedCount} ${params.execution.platformLabel} draft${params.summary.completedCount === 1 ? '' : 's'}${params.summary.failedCount > 0 ? ` (${params.summary.failedCount} failed)` : ''} · ${creditsUsed} credits.`
              : `Batch finished with 0 ready drafts${params.summary.failedCount > 0 ? `; ${params.summary.failedCount} failed` : ''}.`,
          failedCount: params.summary.failedCount,
          id: `batch-generation-${params.execution.batchId}`,
          items: previews,
          platforms: params.execution.platforms,
          remainingCount,
          title: 'Batch generation complete',
          type: 'batch_generation_result_card',
          // Result card with previews/review link, not the generation form.
        },
      ],
      success: true,
    };
  }

  private async queueOrRunBatch(
    execution: BatchExecution,
    ctx: ToolExecutionContext,
  ): Promise<AgentToolResult> {
    const queuedJobId = await this.batchGenerationQueueService?.queueBatch({
      batchId: execution.batchId,
      organizationId: ctx.organizationId,
      runId: ctx.runId,
      threadId: ctx.threadId,
      userId: ctx.userId,
    });
    if (!queuedJobId) {
      // #2501: the queue owns durable execution. Only self-hosted deployments
      // without a queue fall back to the legacy in-process path.
      this.runBatchInProcess({
        batchId: execution.batchId,
        organizationId: ctx.organizationId,
        runId: ctx.runId,
        threadId: ctx.threadId,
        userId: ctx.userId,
      });
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

  private runBatchInProcess(context: {
    batchId: string;
    organizationId: string;
    runId?: string;
    threadId?: string;
    userId: string;
  }): void {
    // Deliberately not awaited: the public tool returns once ownership starts.
    if (!this.batchGenerationService) return;
    const streamOptions =
      context.threadId && this.batchStreamService
        ? this.batchStreamService.buildProcessOptions({
            batchId: context.batchId,
            runId: context.runId,
            threadId: context.threadId,
            userId: context.userId,
          })
        : undefined;
    this.batchGenerationService
      .processBatch(context.batchId, context.organizationId, streamOptions)
      .catch((error: Error) => {
        this.loggerService.error(
          `Batch processing failed: ${error.message}`,
          this.logContext,
        );
      })
      .then(async () => {
        // Settle on failure too; only completed work should remain charged.
        await this.batchCreditsService?.settleBatchCredits({
          batchId: context.batchId,
          organizationId: context.organizationId,
          userId: context.userId,
        });
      })
      .catch((error: Error) => {
        this.loggerService.error(
          `Batch settlement failed: ${error.message}`,
          this.logContext,
        );
      });
  }

  private formatStreamedItemBlock(
    item: StreamedBatchItem,
    totalCount: number,
  ): string {
    const state = item.status === 'completed' ? 'ready' : 'failed';
    const detail =
      item.status === 'completed'
        ? (item.previewText || item.topic).trim()
        : item.error || 'Unknown error';
    return (
      `\n\nPost ${item.index + 1}/${totalCount} ${state}` +
      `${item.platform ? ` (${item.platform})` : ''}` +
      `\n${detail}`
    );
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

  private publishTokenEffect(data: {
    runId?: string;
    threadId: string;
    token: string;
    userId: string;
  }) {
    return this.streamPublisher
      ? this.streamPublisher.publishTokenEffect(data)
      : Effect.void;
  }

  private publishWorkEventEffect(
    data: Parameters<AgentStreamPublisherService['publishWorkEvent']>[0],
  ) {
    return this.streamPublisher
      ? this.streamPublisher.publishWorkEventEffect(data)
      : Effect.void;
  }
}
