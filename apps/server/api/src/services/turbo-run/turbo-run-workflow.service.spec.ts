import type { WorkflowExecutionQueueService } from '@api/collections/workflows/services/workflow-execution-queue.service';
import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import type { TurboRunService } from '@api/services/turbo-run/turbo-run.service';
import { TurboRunAlreadyOwnedException } from '@api/services/turbo-run/turbo-run-already-owned.exception';
import type { TurboRunCreditsService } from '@api/services/turbo-run/turbo-run-credits.service';
import type { TurboRunStreamService } from '@api/services/turbo-run/turbo-run-stream.service';
import {
  TurboRunWorkflowService,
  turboRunJobId,
} from '@api/services/turbo-run/turbo-run-workflow.service';
import {
  TURBO_RUN_ACTION_IDS,
  TURBO_RUN_WORKFLOW_ID,
} from '@api/services/turbo-run/turbo-run-workflow-definition';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it } from 'vitest';

/** The identity a queued run carries from the agent thread into the worker. */
const REQUEST = {
  organizationId: 'organization-1',
  runId: 'run-1',
  threadId: 'thread-1',
  turboRunId: 'run-1',
  userId: 'user-1',
};

type ActionHandler = (payload: {
  input: Record<string, unknown>;
}) => Promise<unknown>;

interface StoredRun {
  config: Record<string, unknown>;
  id: string;
  isDeleted: boolean;
  organizationId: string;
}

interface QueuedJob {
  jobId: string;
  options: Record<string, unknown>;
  workflow: Record<string, unknown>;
}

describe('TurboRunWorkflowService', () => {
  let actions: Map<string, ActionHandler>;
  let registeredWorkflowIds: string[];
  let runs: StoredRun[];
  let queued: QueuedJob[];
  let processed: Array<{
    organizationId: string;
    streamOptions: unknown;
    turboRunId: string;
  }>;
  let processOutcome: Record<string, unknown> | Error;
  let streamRequests: Array<Record<string, unknown>>;
  let settlements: Array<Record<string, unknown>>;
  let settlementFailure: Error | undefined;
  let errors: string[];
  let service: TurboRunWorkflowService;

  const streamOptions = { onTurboRunStarted: () => undefined };

  function matches(run: StoredRun, where: Record<string, unknown>): boolean {
    return (
      run.id === where.id &&
      run.organizationId === where.organizationId &&
      run.isDeleted === where.isDeleted
    );
  }

  beforeEach(() => {
    actions = new Map();
    registeredWorkflowIds = [];
    runs = [
      {
        config: { seeded: true },
        id: 'run-1',
        isDeleted: false,
        organizationId: 'organization-1',
      },
    ];
    queued = [];
    processed = [];
    processOutcome = { completed: 2 };
    streamRequests = [];
    settlements = [];
    settlementFailure = undefined;
    errors = [];

    service = new TurboRunWorkflowService(
      {
        processTurboRun: async (
          turboRunId: string,
          organizationId: string,
          options: unknown,
        ) => {
          processed.push({
            organizationId,
            streamOptions: options,
            turboRunId,
          });
          if (processOutcome instanceof Error) {
            throw processOutcome;
          }
          return processOutcome;
        },
      } as unknown as TurboRunService,
      {
        settleTurboRunCredits: async (input: Record<string, unknown>) => {
          if (settlementFailure) {
            throw settlementFailure;
          }
          settlements.push(input);
        },
      } as unknown as TurboRunCreditsService,
      {
        error: (message: string) => {
          errors.push(message);
        },
        log: () => undefined,
        warn: () => undefined,
      } as unknown as LoggerService,
      {
        turboRun: {
          findFirst: async ({ where }: { where: Record<string, unknown> }) =>
            runs.find((run) => matches(run, where)) ?? null,
          updateMany: async ({
            data,
            where,
          }: {
            data: { config: Record<string, unknown> };
            where: Record<string, unknown>;
          }) => {
            const matching = runs.filter((run) => matches(run, where));
            for (const run of matching) {
              run.config = data.config;
            }
            return { count: matching.length };
          },
        },
      } as unknown as PrismaService,
      {
        queueSystemWorkflow: async (
          workflow: Record<string, unknown>,
          jobId: string,
          options: Record<string, unknown>,
        ) => {
          queued.push({ jobId, options, workflow });
          return 'job-1';
        },
      } as unknown as WorkflowExecutionQueueService,
      {
        registerAction: (actionId: string, handler: ActionHandler) => {
          actions.set(actionId, handler);
        },
        registerWorkflow: (definition: { canonicalId: string }) => {
          registeredWorkflowIds.push(definition.canonicalId);
        },
      } as unknown as SystemWorkflowRunnerService,
      {
        buildProcessOptions: (input: Record<string, unknown>) => {
          streamRequests.push(input);
          return streamOptions;
        },
      } as unknown as TurboRunStreamService,
    );
    service.onModuleInit();
  });

  const run = (
    actionId: string,
    request: Record<string, unknown> = REQUEST,
  ): Promise<unknown> => {
    const handler = actions.get(actionId);
    if (!handler) throw new Error(`No handler registered for ${actionId}`);
    return handler({ input: { request } });
  };

  it('registers every run action alongside the run workflow graph', () => {
    expect([...actions.keys()]).toEqual(
      expect.arrayContaining([
        TURBO_RUN_ACTION_IDS.MARK_QUEUED,
        TURBO_RUN_ACTION_IDS.PROCESS,
        TURBO_RUN_ACTION_IDS.SETTLE,
      ]),
    );
    expect(registeredWorkflowIds).toEqual([TURBO_RUN_WORKFLOW_ID]);
  });

  it.each([
    SystemWorkflowDispatchClass.INTERACTIVE,
    SystemWorkflowDispatchClass.BACKGROUND,
  ])(
    'queues the run under a deterministic job id with the %s dispatch class',
    async (dispatchClass) => {
      await expect(service.queueTurboRun(REQUEST, dispatchClass)).resolves.toBe(
        'job-1',
      );

      expect(queued).toEqual([
        {
          jobId: turboRunJobId('run-1'),
          options: { attempts: 1, dispatchClass },
          workflow: expect.objectContaining({
            canonicalId: TURBO_RUN_WORKFLOW_ID,
            inputValues: {
              request: expect.objectContaining({
                threadId: 'thread-1',
                turboRunId: 'run-1',
                userId: 'user-1',
              }),
            },
            organizationId: 'organization-1',
            source: 'turbo-run',
            userId: 'user-1',
          }),
        },
      ]);
    },
  );

  it('stamps the queued time on the owning organization’s run', async () => {
    await expect(run(TURBO_RUN_ACTION_IDS.MARK_QUEUED)).resolves.toEqual({
      queued: true,
    });

    expect(runs[0]?.config).toEqual({
      queuedAt: expect.any(String),
      seeded: true,
    });
  });

  it('leaves a run outside the organization untouched', async () => {
    runs = [{ ...(runs[0] as StoredRun), organizationId: 'organization-2' }];

    await expect(run(TURBO_RUN_ACTION_IDS.MARK_QUEUED)).resolves.toEqual({
      queued: false,
    });
    expect(runs[0]?.config).toEqual({ seeded: true });
  });

  it('rebuilds the thread stream from job data and processes with it', async () => {
    await expect(run(TURBO_RUN_ACTION_IDS.PROCESS)).resolves.toEqual({
      completed: 2,
      ownedElsewhere: false,
    });

    expect(streamRequests).toEqual([
      {
        runId: 'run-1',
        threadId: 'thread-1',
        turboRunId: 'run-1',
        userId: 'user-1',
      },
    ]);
    expect(processed).toEqual([
      { organizationId: 'organization-1', streamOptions, turboRunId: 'run-1' },
    ]);
  });

  it('processes silently when the run has no thread to stream into', async () => {
    await run(TURBO_RUN_ACTION_IDS.PROCESS, {
      ...REQUEST,
      threadId: undefined,
    });

    expect(streamRequests).toEqual([]);
    expect(processed).toEqual([
      {
        organizationId: 'organization-1',
        streamOptions: undefined,
        turboRunId: 'run-1',
      },
    ]);
  });

  it('yields to the worker that already owns the run instead of failing the run', async () => {
    processOutcome = new TurboRunAlreadyOwnedException('run-1', 'PROCESSING');

    await expect(run(TURBO_RUN_ACTION_IDS.PROCESS)).resolves.toEqual({
      ownedElsewhere: true,
    });
  });

  it('propagates a real processing failure so the execution records it', async () => {
    processOutcome = new Error('generation exploded');

    await expect(run(TURBO_RUN_ACTION_IDS.PROCESS)).rejects.toThrow(
      'generation exploded',
    );
  });

  it('settles the pinned charge for the run', async () => {
    await expect(run(TURBO_RUN_ACTION_IDS.SETTLE)).resolves.toEqual({
      settled: true,
    });

    expect(settlements).toEqual([
      {
        organizationId: 'organization-1',
        turboRunId: 'run-1',
        userId: 'user-1',
      },
    ]);
  });

  it('reports an unsettled run instead of throwing away a finished run', async () => {
    settlementFailure = new Error('ledger offline');

    await expect(run(TURBO_RUN_ACTION_IDS.SETTLE)).resolves.toEqual({
      settled: false,
    });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('settlement failed');
  });
});
