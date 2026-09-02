import { BatchGenerationStreamService } from '@api/services/batch-generation/batch-generation-stream.service';
import { AgentToolName } from '@genfeedai/contracts/interfaces';
import { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The thread identity a worker-side batch run reconstructs from job data. */
const CONTEXT = {
  batchId: 'batch-1',
  runId: 'run-1',
  threadId: 'thread-1',
  userId: 'user-1',
};

const itemContext = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  batchId: 'batch-1',
  completedCount: 1,
  failedCount: 0,
  index: 0,
  item: { format: 'IMAGE', id: 'item-1', platform: 'instagram' },
  topic: 'launch day',
  totalCount: 2,
  ...overrides,
});

describe('BatchGenerationStreamService', () => {
  let logger: LoggerService;
  let publishWorkEvent: ReturnType<typeof vi.fn>;
  let service: BatchGenerationStreamService;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never;
    publishWorkEvent = vi.fn().mockResolvedValue(undefined);
    service = new BatchGenerationStreamService(logger, {
      publishWorkEvent,
    } as never);
  });

  it('runs silently when no publisher is wired', () => {
    const withoutPublisher = new BatchGenerationStreamService(logger);

    expect(withoutPublisher.buildProcessOptions(CONTEXT)).toBeUndefined();
  });

  it('opens the batch tool call on the live thread', async () => {
    await service.buildProcessOptions(CONTEXT)?.onBatchStarted?.({
      batchId: 'batch-1',
      totalCount: 2,
    });

    expect(publishWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: 'Queued 2 posts for generation.',
        event: 'started',
        label: 'Batch generation started',
        progress: 0,
        runId: 'run-1',
        status: 'running',
        threadId: 'thread-1',
        toolCallId: 'batch:batch-1',
        toolName: AgentToolName.GENERATE_CONTENT_BATCH,
        userId: 'user-1',
      }),
    );
  });

  it('gives each item its own tool call id so drafts stream independently', async () => {
    const options = service.buildProcessOptions(CONTEXT);

    await options?.onItemStarted?.(itemContext({ completedCount: 0 }) as never);
    await options?.onItemCompleted?.(
      itemContext({
        postId: 'post-1',
        previewText: 'Launch day is here',
      }) as never,
    );

    expect(publishWorkEvent).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        event: 'tool_started',
        label: 'Generating post 1',
        progress: 0,
        status: 'running',
        toolCallId: 'batch:batch-1:item:item-1',
      }),
    );
    expect(publishWorkEvent).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        event: 'tool_completed',
        label: 'Generated post 1',
        progress: 50,
        resultSummary: 'Launch day is here',
        status: 'completed',
        toolCallId: 'batch:batch-1:item:item-1',
      }),
    );
  });

  it('reports a failed draft without ending the batch call', async () => {
    await service.buildProcessOptions(CONTEXT)?.onItemFailed?.(
      itemContext({
        completedCount: 0,
        error: 'provider refused the prompt',
        failedCount: 1,
        index: 1,
      }) as never,
    );

    expect(publishWorkEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: 'provider refused the prompt',
        label: 'Failed post 2',
        progress: 50,
        resultSummary: 'provider refused the prompt',
        status: 'failed',
        toolCallId: 'batch:batch-1:item:item-1',
      }),
    );
  });

  it('keeps generating when a progress event cannot be published', async () => {
    publishWorkEvent.mockRejectedValue(new Error('redis unavailable'));

    await expect(
      service.buildProcessOptions(CONTEXT)?.onBatchStarted?.({
        batchId: 'batch-1',
        totalCount: 2,
      }),
    ).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(
      'Batch batch-1 progress event dropped',
      expect.objectContaining({
        batchId: 'batch-1',
        error: 'redis unavailable',
      }),
    );
  });
});
