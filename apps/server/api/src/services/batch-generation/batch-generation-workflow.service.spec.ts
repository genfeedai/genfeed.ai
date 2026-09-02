import { BatchAlreadyOwnedException } from '@api/services/batch-generation/batch-already-owned.exception';
import {
  BatchGenerationWorkflowService,
  batchGenerationJobId,
} from '@api/services/batch-generation/batch-generation-workflow.service';
import {
  BATCH_GENERATION_ACTION_IDS,
  BATCH_GENERATION_WORKFLOW_ID,
} from '@api/services/batch-generation/batch-generation-workflow-definition';
import { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The identity a queued batch carries from the agent thread into the worker. */
const REQUEST = {
  batchId: 'batch-1',
  organizationId: 'organization-1',
  runId: 'run-1',
  threadId: 'thread-1',
  userId: 'user-1',
};

describe('BatchGenerationWorkflowService', () => {
  const actions = new Map<
    string,
    (payload: { input: Record<string, unknown> }) => Promise<unknown>
  >();
  let batches: { processBatch: ReturnType<typeof vi.fn> };
  let credits: { settleBatchCredits: ReturnType<typeof vi.fn> };
  let logger: LoggerService;
  let prisma: {
    batch: {
      findFirst: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
  };
  let queue: { queueSystemWorkflow: ReturnType<typeof vi.fn> };
  let registeredWorkflowIds: string[];
  let streams: { buildProcessOptions: ReturnType<typeof vi.fn> };
  let service: BatchGenerationWorkflowService;

  const streamOptions = { onBatchStarted: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    actions.clear();
    registeredWorkflowIds = [];
    batches = { processBatch: vi.fn().mockResolvedValue({ completed: 2 }) };
    credits = { settleBatchCredits: vi.fn().mockResolvedValue(undefined) };
    logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never;
    prisma = {
      batch: {
        findFirst: vi.fn().mockResolvedValue({ config: { seeded: true } }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    queue = { queueSystemWorkflow: vi.fn().mockResolvedValue('job-1') };
    streams = { buildProcessOptions: vi.fn().mockReturnValue(streamOptions) };

    const runner = {
      registerAction: vi.fn((actionId: string, handler: never) => {
        actions.set(actionId, handler);
      }),
      registerWorkflow: vi.fn((definition: { canonicalId: string }) => {
        registeredWorkflowIds.push(definition.canonicalId);
      }),
    };

    service = new BatchGenerationWorkflowService(
      batches as never,
      credits as never,
      logger,
      prisma as never,
      queue as never,
      runner as never,
      streams as never,
    );
    service.onModuleInit();
  });

  const run = (actionId: string): Promise<unknown> => {
    const handler = actions.get(actionId);
    if (!handler) throw new Error(`No handler registered for ${actionId}`);
    return handler({ input: { request: REQUEST } });
  };

  it('registers every batch action alongside the batch workflow graph', () => {
    expect([...actions.keys()]).toEqual(
      expect.arrayContaining([
        BATCH_GENERATION_ACTION_IDS.MARK_QUEUED,
        BATCH_GENERATION_ACTION_IDS.PROCESS,
        BATCH_GENERATION_ACTION_IDS.SETTLE,
      ]),
    );
    expect(registeredWorkflowIds).toContain(BATCH_GENERATION_WORKFLOW_ID);
  });

  it('queues the batch under a deterministic job id so a retry replaces it', async () => {
    await service.queueBatch(REQUEST);

    expect(queue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: BATCH_GENERATION_WORKFLOW_ID,
        inputValues: {
          request: expect.objectContaining({
            batchId: 'batch-1',
            threadId: 'thread-1',
            userId: 'user-1',
          }),
        },
        organizationId: 'organization-1',
        source: 'batch-generation',
        userId: 'user-1',
      }),
      batchGenerationJobId('batch-1'),
      { attempts: 1, replaceTerminalJob: true },
    );
  });

  it('scopes the queued-at stamp to the owning organization', async () => {
    await run(BATCH_GENERATION_ACTION_IDS.MARK_QUEUED);

    expect(prisma.batch.updateMany).toHaveBeenCalledWith({
      data: {
        config: expect.objectContaining({
          queuedAt: expect.any(String),
          seeded: true,
        }),
      },
      where: expect.objectContaining({
        id: 'batch-1',
        isDeleted: false,
        organizationId: 'organization-1',
      }),
    });
  });

  it('leaves a batch outside the organization untouched', async () => {
    prisma.batch.findFirst.mockResolvedValue(null);

    await expect(run(BATCH_GENERATION_ACTION_IDS.MARK_QUEUED)).resolves.toEqual(
      { queued: false },
    );
    expect(prisma.batch.updateMany).not.toHaveBeenCalled();
  });

  it('rebuilds the thread stream from job data and processes with it', async () => {
    await expect(run(BATCH_GENERATION_ACTION_IDS.PROCESS)).resolves.toEqual({
      completed: 2,
      ownedElsewhere: false,
    });

    expect(streams.buildProcessOptions).toHaveBeenCalledWith({
      batchId: 'batch-1',
      runId: 'run-1',
      threadId: 'thread-1',
      userId: 'user-1',
    });
    expect(batches.processBatch).toHaveBeenCalledWith(
      'batch-1',
      'organization-1',
      streamOptions,
    );
  });

  it('processes silently when the batch has no thread to stream into', async () => {
    const handler = actions.get(BATCH_GENERATION_ACTION_IDS.PROCESS);
    await handler?.({
      input: { request: { ...REQUEST, threadId: undefined } },
    });

    expect(streams.buildProcessOptions).not.toHaveBeenCalled();
    expect(batches.processBatch).toHaveBeenCalledWith(
      'batch-1',
      'organization-1',
      undefined,
    );
  });

  it('yields to the worker that already owns the batch instead of failing the run', async () => {
    batches.processBatch.mockRejectedValue(
      new BatchAlreadyOwnedException('batch-1', 'PROCESSING'),
    );

    await expect(run(BATCH_GENERATION_ACTION_IDS.PROCESS)).resolves.toEqual({
      ownedElsewhere: true,
    });
  });

  it('propagates a real processing failure so the execution records it', async () => {
    batches.processBatch.mockRejectedValue(new Error('generation exploded'));

    await expect(run(BATCH_GENERATION_ACTION_IDS.PROCESS)).rejects.toThrow(
      'generation exploded',
    );
  });

  it('settles the pinned charge for the run', async () => {
    await expect(run(BATCH_GENERATION_ACTION_IDS.SETTLE)).resolves.toEqual({
      settled: true,
    });

    expect(credits.settleBatchCredits).toHaveBeenCalledWith({
      batchId: 'batch-1',
      organizationId: 'organization-1',
      userId: 'user-1',
    });
  });

  it('reports an unsettled batch instead of throwing away a finished run', async () => {
    credits.settleBatchCredits.mockRejectedValue(new Error('ledger offline'));

    await expect(run(BATCH_GENERATION_ACTION_IDS.SETTLE)).resolves.toEqual({
      settled: false,
    });
    expect(logger.error).toHaveBeenCalled();
  });
});
