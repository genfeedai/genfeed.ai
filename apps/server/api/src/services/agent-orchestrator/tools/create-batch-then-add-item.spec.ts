import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import { createBatchThenAddItem } from '@api/services/agent-orchestrator/tools/create-batch-then-add-item';
import { CreateBatchDto } from '@api/services/batch-generation/dto/create-batch.dto';
import { BatchItemStatus, Platform } from '@genfeedai/enums';
import { describe, expect, it, vi } from 'vitest';

const ctx: ToolExecutionContext = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

function buildDto(): CreateBatchDto {
  return {
    brandId: 'brand-1',
    count: 1,
    dateRange: { end: '2026-08-13', start: '2026-08-13' },
    platforms: [Platform.TWITTER],
  };
}

describe('createBatchThenAddItem', () => {
  it('creates a batch then adds the engagement item with enum status and platform', async () => {
    const createBatch = vi.fn().mockResolvedValue({ id: 'batch-1' });
    const cancelBatch = vi.fn();
    const callInternalApi = vi.fn().mockResolvedValue({});

    const result = await createBatchThenAddItem(
      {
        batchGenerationService: { cancelBatch, createBatch },
        internalApi: { callInternalApi },
      },
      {
        batchDto: buildDto(),
        ctx,
        item: {
          caption: 'Quote this',
          engagementAction: 'quote',
          platform: Platform.TWITTER,
          status: BatchItemStatus.PENDING,
          targetPostId: '123',
          type: 'engagement',
        },
      },
    );

    expect(result).toEqual({ batchId: 'batch-1', success: true });
    expect(createBatch).toHaveBeenCalledWith(
      buildDto(),
      ctx.userId,
      ctx.organizationId,
    );
    expect(callInternalApi).toHaveBeenCalledWith(
      'POST',
      '/v1/batches/batch-1/items',
      expect.objectContaining({
        platform: Platform.TWITTER,
        status: BatchItemStatus.PENDING,
        type: 'engagement',
      }),
      ctx,
    );
    expect(cancelBatch).not.toHaveBeenCalled();
  });

  it('cancels the batch and returns the add-item error instead of swallowing it', async () => {
    const createBatch = vi.fn().mockResolvedValue({ id: 'batch-1' });
    const cancelBatch = vi.fn().mockResolvedValue({});
    const callInternalApi = vi
      .fn()
      .mockRejectedValue(new Error('add item failed'));
    const error = vi.fn();

    const result = await createBatchThenAddItem(
      {
        batchGenerationService: { cancelBatch, createBatch },
        internalApi: { callInternalApi },
        logger: { error },
      },
      {
        batchDto: buildDto(),
        ctx,
        item: {
          caption: 'Reply',
          platform: Platform.TWITTER,
          status: BatchItemStatus.PENDING,
          targetPostId: '123',
          type: 'engagement',
        },
      },
    );

    expect(result).toEqual({
      error: 'add item failed',
      success: false,
    });
    expect(cancelBatch).toHaveBeenCalledWith('batch-1', ctx.organizationId);
    expect(error).toHaveBeenCalled();
  });
});
