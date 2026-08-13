import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import type { CreateBatchDto } from '@api/services/batch-generation/dto/create-batch.dto';
import { BatchItemStatus, type Platform } from '@genfeedai/enums';
import type { LoggerService } from '@libs/logger/logger.service';

export type EngagementBatchItemPayload = {
  caption: string;
  engagementAction?: string;
  platform: Platform;
  status: BatchItemStatus;
  targetAuthor?: string;
  targetPostContent?: string;
  targetPostId: string;
  targetPostUrl?: string;
  type: 'engagement';
};

export type CreateBatchThenAddItemDeps = {
  batchGenerationService: Pick<
    BatchGenerationService,
    'cancelBatch' | 'createBatch'
  >;
  internalApi: {
    callInternalApi: (
      method: 'DELETE' | 'GET' | 'POST',
      path: string,
      body: Record<string, unknown> | undefined,
      ctx: ToolExecutionContext,
    ) => Promise<Record<string, unknown>>;
  };
  logger?: Pick<LoggerService, 'error'>;
};

export type CreateBatchThenAddItemResult =
  | { batchId: string; success: true }
  | { error: string; success: false };

export function buildSingleDayBatchDto(
  brandId: string,
  platform: Platform,
): CreateBatchDto {
  const day = new Date().toISOString().slice(0, 10);
  return {
    brandId,
    count: 1,
    dateRange: { end: day, start: day },
    platforms: [platform],
  };
}

export async function createBatchThenAddItem(
  deps: CreateBatchThenAddItemDeps,
  input: {
    batchDto: CreateBatchDto;
    ctx: ToolExecutionContext;
    item: EngagementBatchItemPayload;
  },
): Promise<CreateBatchThenAddItemResult> {
  let batchId: string | undefined;
  try {
    const batch = await deps.batchGenerationService.createBatch(
      input.batchDto,
      input.ctx.userId,
      input.ctx.organizationId,
    );
    batchId = String(batch.id);
    await deps.internalApi.callInternalApi(
      'POST',
      `/v1/batches/${batchId}/items`,
      {
        caption: input.item.caption,
        engagementAction: input.item.engagementAction,
        platform: input.item.platform,
        status: input.item.status,
        targetAuthor: input.item.targetAuthor,
        targetPostContent: input.item.targetPostContent,
        targetPostId: input.item.targetPostId,
        targetPostUrl: input.item.targetPostUrl,
        type: input.item.type,
      },
      input.ctx,
    );
    return { batchId, success: true };
  } catch (error: unknown) {
    const message =
      error instanceof Error && error.message.length > 0
        ? error.message
        : 'Could not add the engagement draft to a review batch.';
    deps.logger?.error(
      `Could not create batch then add engagement item${batchId ? ` ${batchId}` : ''}`,
      error,
      'createBatchThenAddItem',
    );
    if (batchId) {
      try {
        await deps.batchGenerationService.cancelBatch(
          batchId,
          input.ctx.organizationId,
        );
      } catch (cancelError: unknown) {
        deps.logger?.error(
          `Could not cancel batch ${batchId} after add-item failure`,
          cancelError,
          'createBatchThenAddItem',
        );
      }
    }
    return { error: message, success: false };
  }
}
