import { TurboRunAlreadyOwnedException } from '@api/services/turbo-run/turbo-run-already-owned.exception';
import {
  TurboRunWorkflowService,
  turboRunJobId,
} from '@api/services/turbo-run/turbo-run-workflow.service';
import {
  TURBO_RUN_ACTION_IDS,
  TURBO_RUN_WORKFLOW_ID,
} from '@api/services/turbo-run/turbo-run-workflow-definition';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The identity a queued run carries from the agent thread into the worker. */
const REQUEST = {
  turboRunId: 'run-1',
  organizationId: 'organization-1',
  runId: 'run-1',
  threadId: 'thread-1',
  userId: 'user-1',
};

describe('TurboRunWorkflowService', () => {
  const actions = new Map<
    string,
    (payload: { input: Record<string, unknown> }) => Promise<unknown>
  >();
  let turboRuns: { processTurboRun: ReturnType<typeof vi.fn> };
  let credits: { settleTurboRunCredits: ReturnType<typeof vi.fn> };
  let logger: LoggerService;
  let prisma: {
    turboRun: {
      findFirst: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
  };
  let queue: { queueSystemWorkflow: ReturnType<typeof vi.fn> };
  let registeredWorkflowIds: string[];
  let streams: { buildProcessOptions: ReturnType<typeof vi.fn> };
  let service: TurboRunWorkflowService;

  const streamOptions = { onTurboRunStarted: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    actions.clear();
    registeredWorkflowIds = [];
    turboRuns = {
      processTurboRun: vi.fn().mockResolvedValue({ completed: 2 }),
    };
    credits = { settleTurboRunCredits: vi.fn().mockResolvedValue(undefined) };
    logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() } as never;
    prisma = {
      turboRun: {
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

    service = new TurboRunWorkflowService(
      turboRuns as never,
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

  it('registers every run action alongside the run workflow graph', () => {
    expect([...actions.keys()]).toEqual(
      expect.arrayContaining([
        TURBO_RUN_ACTION_IDS.MARK_QUEUED,
        TURBO_RUN_ACTION_IDS.PROCESS,
        TURBO_RUN_ACTION_IDS.SETTLE,
      ]),
    );
    expect(registeredWorkflowIds).toContain(TURBO_RUN_WORKFLOW_ID);
  });

  it('queues the run under a deterministic job id so a retry replaces it', async () => {
    await service.queueTurboRun(
      REQUEST,
      SystemWorkflowDispatchClass.INTERACTIVE,
    );

    expect(queue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        canonicalId: TURBO_RUN_WORKFLOW_ID,
        inputValues: {
          request: expect.objectContaining({
            turboRunId: 'run-1',
            threadId: 'thread-1',
            userId: 'user-1',
          }),
        },
        organizationId: 'organization-1',
        source: 'turbo-run',
        userId: 'user-1',
      }),
      turboRunJobId('run-1'),
      {
        attempts: 1,
        dispatchClass: SystemWorkflowDispatchClass.INTERACTIVE,
      },
    );
  });

  it('threads a background dispatchClass from a caller like the reconcile cron', async () => {
    await service.queueTurboRun(
      REQUEST,
      SystemWorkflowDispatchClass.BACKGROUND,
    );

    expect(queue.queueSystemWorkflow).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        dispatchClass: SystemWorkflowDispatchClass.BACKGROUND,
      }),
    );
  });

  it('scopes the queued-at stamp to the owning organization', async () => {
    await run(TURBO_RUN_ACTION_IDS.MARK_QUEUED);

    expect(prisma.turboRun.updateMany).toHaveBeenCalledWith({
      data: {
        config: expect.objectContaining({
          queuedAt: expect.any(String),
          seeded: true,
        }),
      },
      where: expect.objectContaining({
        id: 'run-1',
        isDeleted: false,
        organizationId: 'organization-1',
      }),
    });
  });

  it('leaves a run outside the organization untouched', async () => {
    prisma.turboRun.findFirst.mockResolvedValue(null);

    await expect(run(TURBO_RUN_ACTION_IDS.MARK_QUEUED)).resolves.toEqual({
      queued: false,
    });
    expect(prisma.turboRun.updateMany).not.toHaveBeenCalled();
  });

  it('rebuilds the thread stream from job data and processes with it', async () => {
    await expect(run(TURBO_RUN_ACTION_IDS.PROCESS)).resolves.toEqual({
      completed: 2,
      ownedElsewhere: false,
    });

    expect(streams.buildProcessOptions).toHaveBeenCalledWith({
      turboRunId: 'run-1',
      runId: 'run-1',
      threadId: 'thread-1',
      userId: 'user-1',
    });
    expect(turboRuns.processTurboRun).toHaveBeenCalledWith(
      'run-1',
      'organization-1',
      streamOptions,
    );
  });

  it('processes silently when the run has no thread to stream into', async () => {
    const handler = actions.get(TURBO_RUN_ACTION_IDS.PROCESS);
    await handler?.({
      input: { request: { ...REQUEST, threadId: undefined } },
    });

    expect(streams.buildProcessOptions).not.toHaveBeenCalled();
    expect(turboRuns.processTurboRun).toHaveBeenCalledWith(
      'run-1',
      'organization-1',
      undefined,
    );
  });

  it('yields to the worker that already owns the run instead of failing the run', async () => {
    turboRuns.processTurboRun.mockRejectedValue(
      new TurboRunAlreadyOwnedException('run-1', 'PROCESSING'),
    );

    await expect(run(TURBO_RUN_ACTION_IDS.PROCESS)).resolves.toEqual({
      ownedElsewhere: true,
    });
  });

  it('propagates a real processing failure so the execution records it', async () => {
    turboRuns.processTurboRun.mockRejectedValue(
      new Error('generation exploded'),
    );

    await expect(run(TURBO_RUN_ACTION_IDS.PROCESS)).rejects.toThrow(
      'generation exploded',
    );
  });

  it('settles the pinned charge for the run', async () => {
    await expect(run(TURBO_RUN_ACTION_IDS.SETTLE)).resolves.toEqual({
      settled: true,
    });

    expect(credits.settleTurboRunCredits).toHaveBeenCalledWith({
      turboRunId: 'run-1',
      organizationId: 'organization-1',
      userId: 'user-1',
    });
  });

  it('reports an unsettled run instead of throwing away a finished run', async () => {
    credits.settleTurboRunCredits.mockRejectedValue(
      new Error('ledger offline'),
    );

    await expect(run(TURBO_RUN_ACTION_IDS.SETTLE)).resolves.toEqual({
      settled: false,
    });
    expect(logger.error).toHaveBeenCalled();
  });
});
