import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { AgentAutopilotWorkflowService } from '@api/collections/workflows/services/agent-autopilot-workflow.service';
import { AGENT_RUNTIME_WORKFLOW_DEFINITIONS } from '@api/collections/workflows/services/agent-runtime-workflow-definitions';
import {
  buildHiddenSystemWorkflowMetadata,
  HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
  SYSTEM_WORKFLOW_METADATA_KEY,
} from '@api/collections/workflows/system-workflow.contract';
import { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import { buildWorkflowVersionDefinition } from '@api/collections/workflows/workflow-version-definition';
import { AgentThreadStatus } from '@genfeedai/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

function setup() {
  const definition = AGENT_RUNTIME_WORKFLOW_DEFINITIONS.find(
    (entry) => entry.canonicalId === 'agent.turn.execute',
  );
  if (!definition) throw new Error('Agent turn definition missing');
  const immutable = buildWorkflowVersionDefinition(definition.definition);
  const mirror = {
    id: 'workflow',
    label: 'Proactive agent turn',
    userId: 'owner',
    currentVersion: { id: 'version', contentHash: immutable.contentHash },
    metadata: {
      sourceType: HIDDEN_SYSTEM_WORKFLOW_SOURCE_TYPE,
      [SYSTEM_WORKFLOW_METADATA_KEY]: buildHiddenSystemWorkflowMetadata({
        canonicalId: definition.canonicalId,
      }),
    },
  };
  const strategy = {
    id: 'strategy',
    organizationId: 'org',
    userId: 'owner',
    brandId: null,
    goalId: null,
    label: 'Agent',
    isActive: true,
    isDeleted: false,
    // #5136: recordProactiveRunCompletion selects this nested relation to
    // build the strategy's report and source path.
    organization: { slug: 'org' },
    config: {
      dailyCreditBudget: 100,
      weeklyCreditBudget: 500,
      runHistory: [],
      consecutiveFailures: 0,
    } as Row,
  };
  const executions = new Map<string, Row>();
  let thread: Row | null = null;
  const logger = {
    debug: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(1),
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn(prisma),
    ),
    workflow: {
      findFirst: vi.fn().mockResolvedValue(mirror),
      update: vi.fn().mockResolvedValue(mirror),
    },
    agentStrategy: {
      findFirst: vi.fn(async ({ where }) =>
        where.organizationId !== 'org' && where.organizationId !== undefined
          ? null
          : where.isActive && !strategy.isActive
            ? null
            : strategy,
      ),
      update: vi.fn(async ({ data }) => Object.assign(strategy, data)),
    },
    workflowExecution: {
      create: vi.fn(async ({ data }) => {
        const row = {
          id: `run-${executions.size + 1}`,
          isDeleted: false,
          startedAt: new Date(),
          ...data,
          workflow: mirror,
        };
        executions.set(row.id, row);
        return row;
      }),
      findUnique: vi.fn(async ({ where }) => executions.get(where.id) ?? null),
      findFirst: vi.fn(
        async ({ where }) =>
          [...executions.values()].find(
            (row) =>
              row.organizationId === where.organizationId &&
              row.isDeleted === where.isDeleted &&
              (row.result as { metadata: Row }).metadata.dispatchId ===
                where.result.equals,
          ) ?? null,
      ),
      updateMany: vi.fn(async ({ where, data }) => {
        const row = executions.get(where.id);
        if (
          !row ||
          row.organizationId !== where.organizationId ||
          !['PENDING', 'RUNNING'].includes(String(row.status))
        )
          return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      }),
      update: vi.fn(async ({ where, data }) =>
        Object.assign(executions.get(where.id) ?? {}, data),
      ),
    },
    creditTransaction: { findMany: vi.fn().mockResolvedValue([]) },
    post: { count: vi.fn().mockResolvedValue(0) },
    agentThread: {
      findFirst: vi.fn(async () => thread),
      create: vi.fn(async ({ data }: { data: Row }) => {
        thread = {
          id: 'thread-1',
          isDeleted: false,
          status: AgentThreadStatus.ACTIVE,
          ...data,
        };
        return thread;
      }),
    },
    // #5136: recordProactiveRunCompletion upserts a daily strategy report on
    // the transaction as part of completing a proactive run.
    agentStrategyReport: {
      upsert: vi.fn().mockResolvedValue({}),
    },
  };
  const strategies = new AgentStrategiesService(
    prisma as never,
    logger as never,
  );
  const webhook = {
    emitExecutionOutcome: vi.fn().mockResolvedValue(undefined),
  };
  const completion = new WorkflowExecutionsService(
    prisma as never,
    logger as never,
    webhook as never,
    {
      recordWorkflowOutcome: vi.fn().mockResolvedValue(null),
      enqueueAfterCommit: vi.fn(),
    } as never,
    strategies,
  );
  const queue = {
    queueSystemWorkflow: vi
      .fn()
      .mockRejectedValue(new Error('queue unavailable')),
  };
  const moduleRef = {
    get: (token: { name?: string }) =>
      token.name === 'WorkflowExecutionsService' ? completion : queue,
  };
  const runner = new SystemWorkflowRunnerService(
    prisma as never,
    moduleRef as never,
  );
  runner.registerWorkflow(definition);
  const autopilot = new AgentAutopilotWorkflowService(
    prisma as never,
    {
      getPerformanceSnapshot: vi.fn().mockResolvedValue({
        bestPlatformFormatPairs: [],
        bestPostingWindows: [],
        clicks: 0,
        costPerVisit: null,
        creditsSpent: 0,
        ctr: 0,
        generatedCount: 0,
        impressions: 0,
        publishedCount: 0,
        topHooks: [],
        topTopics: [],
        visits: null,
      }),
    } as never,
    runner,
    { getOrganizationCreditsBalance: vi.fn().mockResolvedValue(1000) } as never,
    { findOne: vi.fn().mockResolvedValue({}) } as never,
    {} as never,
    {} as never,
    logger as never,
  );
  const dispatch = () =>
    autopilot.dispatchProactiveStrategy({
      organizationId: 'org',
      item: strategy,
    });
  return {
    strategy,
    executions,
    prisma,
    completion,
    queue,
    webhook,
    dispatch,
  };
}

describe('proactive dispatch failure accounting across real services', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T08:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('counts queue rejection once per attempt and pauses only on the third terminal failure', async () => {
    const fixture = setup();
    for (const count of [1, 2, 3]) {
      await fixture.dispatch();
      expect(fixture.strategy.config.consecutiveFailures).toBe(count);
      expect(fixture.strategy.config.runHistory).toHaveLength(count);
      expect(fixture.strategy.isActive).toBe(count < 3);
      expect(fixture.executions.get(`run-${count}`)?.status).toBe('FAILED');
      vi.advanceTimersByTime(31 * 60 * 1000);
    }
    expect(fixture.queue.queueSystemWorkflow).toHaveBeenCalledTimes(3);
    // #5136: the idempotency guard now keys off a fresh per-attempt dispatchId
    // rather than the (now-reused) agent thread id. Assert the exact value
    // the third attempt dispatched with, not just its shape, so the guard
    // stays tied to that specific attempt's execution.
    const thirdRun = fixture.executions.get('run-3');
    expect(thirdRun).toBeDefined();
    const thirdDispatchId = (thirdRun?.result as { metadata: Row } | undefined)
      ?.metadata.dispatchId;
    expect(typeof thirdDispatchId).toBe('string');
    expect(fixture.prisma.workflowExecution.findFirst).toHaveBeenLastCalledWith(
      {
        where: {
          organizationId: 'org',
          isDeleted: false,
          result: {
            path: ['metadata', 'dispatchId'],
            equals: thirdDispatchId,
          },
        },
        select: { id: true },
      },
    );
    // The strategy's agent thread is reused across proactive attempts, not
    // recreated per attempt.
    expect(fixture.prisma.agentThread.create).toHaveBeenCalledTimes(1);
    await fixture.completion.completeExecution('run-1', 'duplicate delivery');
    expect(fixture.strategy.config.consecutiveFailures).toBe(3);
    expect(fixture.strategy.config.runHistory).toHaveLength(3);
  });

  it('counts thread creation failure once without inventing a terminal run', async () => {
    const fixture = setup();
    fixture.prisma.agentThread.create.mockRejectedValueOnce(
      new Error('thread persistence failed'),
    );
    await fixture.dispatch();
    expect(fixture.strategy.config.consecutiveFailures).toBe(1);
    expect(fixture.strategy.config.runHistory).toEqual([]);
    expect(fixture.executions.size).toBe(0);
    // #5136: dispatchId is generated before thread resolution, so the
    // idempotency guard still runs (and finds nothing) even when the
    // failure happens before an execution could ever be created.
    expect(fixture.prisma.workflowExecution.findFirst).toHaveBeenCalledTimes(1);
  });

  it('counts execution creation failure once without a run-history entry', async () => {
    const fixture = setup();
    fixture.prisma.workflowExecution.create.mockRejectedValueOnce(
      new Error('execution persistence failed'),
    );
    await fixture.dispatch();
    expect(fixture.strategy.config.consecutiveFailures).toBe(1);
    expect(fixture.strategy.config.runHistory).toEqual([]);
    expect(fixture.executions.size).toBe(0);
    expect(fixture.queue.queueSystemWorkflow).not.toHaveBeenCalled();
  });

  it('does not recount when completion commits then its notification fails', async () => {
    const fixture = setup();
    fixture.webhook.emitExecutionOutcome.mockRejectedValueOnce(
      new Error('notification transport failed'),
    );
    await fixture.dispatch();
    expect(fixture.webhook.emitExecutionOutcome).toHaveBeenCalledOnce();
    expect(fixture.executions.get('run-1')?.status).toBe('FAILED');
    expect(fixture.strategy.config.consecutiveFailures).toBe(1);
    expect(fixture.strategy.config.runHistory).toHaveLength(1);
    expect(fixture.strategy.isActive).toBe(true);
    await fixture.completion.completeExecution('run-1', 'replay');
    expect(fixture.strategy.config.consecutiveFailures).toBe(1);
    expect(fixture.strategy.config.runHistory).toHaveLength(1);
  });
});
