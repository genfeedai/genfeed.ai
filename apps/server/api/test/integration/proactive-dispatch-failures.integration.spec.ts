import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import * as dispatchLock from '@api/collections/workflows/services/agent-autopilot-dispatch-lock.util';
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

beforeEach(() => {
  vi.spyOn(dispatchLock, 'withProactiveDispatchLock').mockImplementation(
    async (_config, _organizationId, _strategyId, run) =>
      run({
        assertOwned: () => {},
        verifyOwned: async () => {},
      }),
  );
});
afterEach(() => vi.restoreAllMocks());

type Row = Record<string, unknown>;

type ExecutionUpsert = {
  where: {
    organizationId_idempotencyKey: {
      organizationId: string;
      idempotencyKey: string;
    };
  };
  create: Row;
  update: Row;
};
type ExecutionFind = {
  where: Row;
  orderBy?: Record<string, 'asc'>[] | Record<string, 'asc'>;
};
function filterRecord(value: unknown): Row {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Unsupported execution fixture filter');
  return value as Row;
}
function matchesExecution(row: Row, where: Row): boolean {
  const checks = Object.entries(where).map(([key, value]) => {
    switch (key) {
      case 'id':
      case 'organizationId':
      case 'status':
        if (typeof value !== 'string')
          throw new Error(`Unsupported ${key} filter`);
        return row[key] === value;
      case 'isDeleted':
        if (typeof value !== 'boolean')
          throw new Error('Unsupported deletion filter');
        return row.isDeleted === value;
      case 'idempotencyKey': {
        if (typeof value === 'string') return row.idempotencyKey === value;
        const filter = filterRecord(value);
        if (
          Object.keys(filter).length !== 1 ||
          typeof filter.startsWith !== 'string'
        )
          throw new Error('Unsupported idempotency filter');
        return (
          typeof row.idempotencyKey === 'string' &&
          row.idempotencyKey.startsWith(filter.startsWith)
        );
      }
      case 'result': {
        const filter = filterRecord(value);
        if (Object.keys(filter).length === 0) return true;
        if (
          Object.keys(filter).some(
            (field) => !['path', 'equals'].includes(field),
          ) ||
          !Object.hasOwn(filter, 'equals') ||
          !Array.isArray(filter.path) ||
          filter.path.length !== 2 ||
          filter.path[0] !== 'metadata' ||
          typeof filter.path[1] !== 'string' ||
          (!['string', 'number', 'boolean'].includes(typeof filter.equals) &&
            filter.equals !== null)
        )
          throw new Error('Unsupported result JSON filter');
        const result = row.result;
        if (
          typeof result !== 'object' ||
          result === null ||
          Array.isArray(result)
        )
          return false;
        const metadata = filterRecord(result).metadata;
        if (
          typeof metadata !== 'object' ||
          metadata === null ||
          Array.isArray(metadata)
        )
          return false;
        return filterRecord(metadata)[filter.path[1]] === filter.equals;
      }
      case 'OR':
      case 'AND': {
        const filters = Array.isArray(value)
          ? value
          : key === 'AND'
            ? [value]
            : null;
        if (!filters) throw new Error('Unsupported logical filter');
        const results = filters.map((entry) =>
          matchesExecution(row, filterRecord(entry)),
        );
        return key === 'OR' ? results.some(Boolean) : results.every(Boolean);
      }
      default:
        throw new Error(`Unsupported execution fixture field: ${key}`);
    }
  });
  return checks.every(Boolean);
}
function executionTimestamp(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') return new Date(value).getTime();
  throw new Error('Invalid execution fixture timestamp');
}
function compareExecutions(
  left: Row,
  right: Row,
  ordering: ExecutionFind['orderBy'],
): number {
  const clauses = Array.isArray(ordering)
    ? ordering
    : ordering
      ? [ordering]
      : [];
  let comparison = 0;
  for (const clause of clauses) {
    for (const [key, direction] of Object.entries(clause)) {
      if (direction !== 'asc' || !['createdAt', 'id'].includes(key))
        throw new Error('Unsupported execution fixture ordering');
      const result =
        key === 'id'
          ? String(left.id).localeCompare(String(right.id))
          : executionTimestamp(left.createdAt) -
            executionTimestamp(right.createdAt);
      if (!Number.isFinite(result))
        throw new Error('Invalid execution fixture timestamp');
      if (comparison === 0) comparison = result;
    }
  }
  return comparison;
}

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
  function persistExecution(data: Row) {
    const now = new Date();
    const row = {
      id: `run-${executions.size + 1}`,
      isDeleted: false,
      startedAt: now,
      createdAt: now,
      updatedAt: now,
      ...data,
      workflow: mirror,
    };
    executions.set(row.id, row);
    return row;
  }
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
      create: vi.fn(async ({ data }: { data: Row }) => persistExecution(data)),
      upsert: vi.fn(async ({ where, create, update }: ExecutionUpsert) => {
        if (Object.keys(update).length)
          throw new Error('Unsupported fixture upsert update');
        const identity = where.organizationId_idempotencyKey;
        if (
          create.organizationId !== identity.organizationId ||
          create.idempotencyKey !== identity.idempotencyKey
        )
          throw new Error('Execution upsert scope mismatch');
        return (
          [...executions.values()].find(
            (row) =>
              row.organizationId === identity.organizationId &&
              row.idempotencyKey === identity.idempotencyKey,
          ) ?? persistExecution(create)
        );
      }),
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          executions.get(where.id) ?? null,
      ),
      findFirst: vi.fn(
        async ({ where, orderBy }: ExecutionFind) =>
          [...executions.values()]
            .filter((row) => matchesExecution(row, where))
            .sort((left, right) =>
              compareExecutions(left, right, orderBy),
            )[0] ?? null,
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
      afterCommit: vi.fn(),
      recordInTransaction: vi.fn().mockResolvedValue(null),
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
    { get: () => undefined },
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
      if (count < 3) {
        const nextRunAt = new Date(String(fixture.strategy.config.nextRunAt));
        expect(Number.isFinite(nextRunAt.getTime())).toBe(true);
        expect(nextRunAt.getTime()).toBeGreaterThan(Date.now());
        await fixture.dispatch();
        expect(fixture.queue.queueSystemWorkflow).toHaveBeenCalledTimes(count);
        expect(fixture.executions.size).toBe(count);
        expect(fixture.strategy.config.consecutiveFailures).toBe(count);
        expect(fixture.strategy.config.runHistory).toHaveLength(count);
        vi.setSystemTime(nextRunAt);
      }
    }
    expect(fixture.executions.size).toBe(3);
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
    expect(fixture.prisma.workflowExecution.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        isDeleted: false,
        result: {
          path: ['metadata', 'dispatchId'],
          equals: thirdDispatchId,
        },
      },
      select: { id: true },
    });
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
    const calls = fixture.prisma.workflowExecution.findFirst.mock.calls;
    const dispatchQueries = calls.filter(([args]) => {
      const result = args.where.result;
      return (
        typeof result === 'object' &&
        result !== null &&
        JSON.stringify(filterRecord(result).path) ===
          JSON.stringify(['metadata', 'dispatchId'])
      );
    });
    expect(dispatchQueries).toHaveLength(1);
    expect(fixture.prisma.workflowExecution.findFirst).toHaveBeenCalledWith({
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      where: {
        organizationId: 'org',
        isDeleted: false,
        status: 'PENDING',
        idempotencyKey: { startsWith: 'proactive:' },
        result: { path: ['metadata', 'source'], equals: 'proactive' },
        OR: [
          { result: { path: ['metadata', 'strategyId'], equals: 'strategy' } },
        ],
      },
    });
    expect(fixture.prisma.workflowExecution.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org',
        isDeleted: false,
        idempotencyKey: expect.stringMatching(/^proactive:/),
      },
    });
  });

  it('counts execution creation failure once without a run-history entry', async () => {
    const fixture = setup();
    fixture.prisma.workflowExecution.upsert.mockRejectedValueOnce(
      new Error('execution persistence failed'),
    );
    await fixture.dispatch();
    expect(fixture.strategy.config.consecutiveFailures).toBe(1);
    expect(fixture.strategy.config.runHistory).toEqual([]);
    expect(fixture.executions.size).toBe(0);
    expect(fixture.prisma.workflowExecution.upsert).toHaveBeenCalledOnce();
    expect(fixture.prisma.workflowExecution.create).not.toHaveBeenCalled();
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

describe('proactive execution fixture query and persistence ABI', () => {
  it('reuses the same key only in its original organization', async () => {
    const fixture = setup();
    const create = {
      organizationId: 'org',
      idempotencyKey: 'same-key',
      status: 'PENDING',
    };
    const where = {
      organizationId_idempotencyKey: {
        organizationId: 'org',
        idempotencyKey: 'same-key',
      },
    };
    const first = await fixture.prisma.workflowExecution.upsert({
      where,
      create,
      update: {},
    });
    const replay = await fixture.prisma.workflowExecution.upsert({
      where,
      create,
      update: {},
    });
    expect(replay).toBe(first);
    expect(fixture.executions.size).toBe(1);
    const foreign = await fixture.prisma.workflowExecution.upsert({
      where: {
        organizationId_idempotencyKey: {
          organizationId: 'foreign',
          idempotencyKey: 'same-key',
        },
      },
      create: { ...create, organizationId: 'foreign' },
      update: {},
    });
    expect(foreign.id).not.toBe(first.id);
    expect(fixture.executions.size).toBe(2);
  });
  it('retains outer tenant, deletion and pending scope across strategy alternatives', async () => {
    const fixture = setup();
    const create = fixture.prisma.workflowExecution.create;
    const base = {
      organizationId: 'org',
      idempotencyKey: 'proactive:valid',
      status: 'PENDING',
      result: {
        metadata: {
          source: 'proactive',
          strategyId: 'strategy',
          dispatchId: 'dispatch',
        },
      },
    };
    await create({ data: { ...base, organizationId: 'foreign' } });
    await create({ data: { ...base, isDeleted: true } });
    await create({ data: { ...base, status: 'FAILED' } });
    await create({
      data: {
        ...base,
        result: { metadata: { source: 'other', strategyId: 'strategy' } },
      },
    });
    await create({
      data: {
        ...base,
        result: { metadata: { source: 'proactive', strategyId: 'other' } },
      },
    });
    await create({ data: { ...base, idempotencyKey: 'ordinary:valid' } });
    const later = await create({
      data: { ...base, createdAt: new Date('2026-09-25T00:00:00Z') },
    });
    const expected = await create({
      data: { ...base, createdAt: new Date('2026-09-24T00:00:00Z') },
    });
    const where = {
      organizationId: 'org',
      isDeleted: false,
      status: 'PENDING',
      idempotencyKey: { startsWith: 'proactive:' },
      result: { path: ['metadata', 'source'], equals: 'proactive' },
      OR: [
        { result: { path: ['metadata', 'strategyId'], equals: 'strategy' } },
        {
          result: {
            path: ['metadata', 'strategyId'],
            equals: 'second-strategy',
          },
        },
      ],
    };
    expect(
      await fixture.prisma.workflowExecution.findFirst({
        where,
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      }),
    ).toBe(expected);
    expect(later.id).not.toBe(expected.id);
    const ordering: Record<string, 'asc'>[] = [
      { createdAt: 'asc' },
      { id: 'asc' },
    ];
    expect(
      compareExecutions(
        { id: 'b', createdAt: new Date('2026-09-24T00:00:00.000Z') },
        { id: 'a', createdAt: new Date('2026-09-24T00:00:00.000Z') },
        ordering,
      ),
    ).toBeGreaterThan(0);
    expect(
      compareExecutions(
        { id: 'b', createdAt: new Date('2026-09-24T00:00:00.000Z') },
        { id: 'a', createdAt: new Date('2026-09-24T00:00:00.001Z') },
        ordering,
      ),
    ).toBeLessThan(0);
    expect(
      await fixture.prisma.workflowExecution.findFirst({
        where: {
          AND: [
            where,
            { result: { path: ['metadata', 'dispatchId'], equals: 'absent' } },
          ],
        },
      }),
    ).toBeNull();
    expect(
      matchesExecution({ organizationId: 'org' }, { organizationId: 'org' }),
    ).toBe(true);
    expect(matchesExecution({}, { result: {} })).toBe(true);
    expect(
      matchesExecution(
        {},
        { result: { path: ['metadata', 'dispatchId'], equals: 'dispatch' } },
      ),
    ).toBe(false);
    expect(() =>
      matchesExecution(
        {},
        { result: { path: ['wrong', 'dispatchId'], equals: 'dispatch' } },
      ),
    ).toThrow('Unsupported');
    expect(() => matchesExecution({}, { status: { in: ['PENDING'] } })).toThrow(
      'Unsupported',
    );
    expect(() => matchesExecution({}, { unknown: true })).toThrow(
      'Unsupported',
    );
  });
});
