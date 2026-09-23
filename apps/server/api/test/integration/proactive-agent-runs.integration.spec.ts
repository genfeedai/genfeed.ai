import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { AgentAutopilotWorkflowService } from '@api/collections/workflows/services/agent-autopilot-workflow.service';
import { BatchGenerationCreationService } from '@api/services/batch-generation/batch-generation-creation.service';
import { BatchGenerationProcessingService } from '@api/services/batch-generation/batch-generation-processing.service';
import { PLATFORM_SCHEDULE_CATALOG } from '@workers/scheduling/platform-schedules.constants';
import { PlatformSchedulesProcessor } from '@workers/scheduling/platform-schedules.processor';
import { PlatformWorkflowSweepsService } from '@workers/scheduling/platform-workflow-sweeps.service';
import type { Job } from 'bullmq';
import { afterEach, describe, expect, it, vi } from 'vitest';

type Row = Record<string, unknown>;

// Real application services; deterministic in-memory persistence, queue and generation stubs.
// PostgreSQL transaction/concurrency guarantees are verified separately in the opt-in database suite.
describe('proactive organization to strategy run and attributed draft integration', () => {
  afterEach(() => vi.useRealTimers());
  it('dispatches the next minute, records exactly one consumed run and attributes generated drafts', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T08:00:00Z'));
    const organizations: Row[] = [];
    let strategy: Row | null = null;
    let batch: Row | null = null;
    const posts: Row[] = [];
    const executions = new Map<string, Row>();
    const slots = new Set<string>();
    let installed = false;
    const logger = {
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      log: vi.fn(),
    };
    const prisma = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      ),
      organization: {
        create: vi.fn(async ({ data }) => {
          organizations.push(data);
          return data;
        }),
        findMany: vi.fn(async () => organizations),
      },
      workflow: {
        findFirst: vi.fn(async () =>
          installed ? { id: 'tenant-control' } : null,
        ),
      },
      agentStrategy: {
        create: vi.fn(async ({ data }) => {
          strategy = {
            id: 'strategy',
            brandId: 'brand',
            goalId: null,
            ...data,
          };
          return strategy;
        }),
        findFirst: vi.fn(async ({ where }) =>
          strategy &&
          (!where.organizationId ||
            where.organizationId === strategy.organizationId) &&
          (!where.isActive || strategy.isActive)
            ? strategy
            : null,
        ),
        findMany: vi.fn(async () => (strategy?.isActive ? [strategy] : [])),
        update: vi.fn(async ({ data }) => {
          strategy = { ...strategy, ...data };
          return strategy;
        }),
      },
      workflowExecution: {
        findUnique: vi.fn(
          async ({ where }) => executions.get(where.id) ?? null,
        ),
        updateMany: vi.fn(async ({ where, data }) => {
          const row = executions.get(where.id);
          if (!row || !['PENDING', 'RUNNING'].includes(String(row.status)))
            return { count: 0 };
          Object.assign(row, data);
          return { count: 1 };
        }),
        update: vi.fn(async ({ where, data }) => {
          const row = executions.get(where.id);
          Object.assign(row ?? {}, data);
          return row;
        }),
      },
      creditTransaction: {
        findMany: vi.fn(async () => [
          { amount: -0.3, category: 'deduct' },
          { amount: 0.03, category: 'refund' },
        ]),
      },
      post: { count: vi.fn(async () => 0) },
      batch: {
        create: vi.fn(async ({ data }) => {
          batch = { id: 'batch', ...data };
          return batch;
        }),
        findFirst: vi.fn(async () => batch),
        updateMany: vi.fn(async ({ data }) => {
          batch = { ...batch, ...data };
          return { count: 1 };
        }),
      },
      batchItem: { upsert: vi.fn().mockResolvedValue({}) },
      credential: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const strategies = new AgentStrategiesService(
      prisma as never,
      logger as never,
    );
    const completion = new WorkflowExecutionsService(
      prisma as never,
      logger as never,
      { emitExecutionOutcome: vi.fn() } as never,
      {
        recordWorkflowOutcome: vi.fn().mockResolvedValue(null),
        enqueueAfterCommit: vi.fn(),
      } as never,
      strategies,
    );
    const jobs: Row[] = [];
    const runner = {
      enqueueWorkflow: vi.fn(async (input) => {
        if (input.idempotencyKey) {
          if (slots.has(input.idempotencyKey)) return { executionId: 'sweep' };
          slots.add(input.idempotencyKey);
          jobs.push(input);
          return { executionId: 'sweep' };
        }
        const id = `turn-${executions.size + 1}`;
        executions.set(id, {
          id,
          organizationId: input.organizationId,
          userId: input.userId,
          startedAt: new Date(),
          status: 'RUNNING',
          workflowId: 'workflow',
          workflow: { label: 'Agent', metadata: {}, userId: input.userId },
          creditsUsed: 0,
          result: {
            metadata: {
              ...input.metadata,
              canonicalId: input.canonicalId,
              source: input.source,
            },
          },
        });
        return { executionId: id };
      }),
    };
    const autopilot = new AgentAutopilotWorkflowService(
      prisma as never,
      { create: vi.fn().mockResolvedValue({ id: 'thread' }) } as never,
      runner as never,
      {
        getOrganizationCreditsBalance: vi.fn().mockResolvedValue(1000),
      } as never,
      { findOne: vi.fn().mockResolvedValue({}) } as never,
      {} as never,
      {
        acquireLock: vi.fn().mockResolvedValue(true),
        releaseLock: vi.fn(),
      } as never,
      logger as never,
    );
    const sweeps = new PlatformWorkflowSweepsService(
      prisma as never,
      runner as never,
      logger as never,
    );
    const processorArgs = Array.from({ length: 31 }, () => ({}));
    processorArgs[0] = { isDevSchedulersEnabled: true };
    processorArgs.push(sweeps);
    const processor = new PlatformSchedulesProcessor(
      ...(processorArgs as ConstructorParameters<
        typeof PlatformSchedulesProcessor
      >),
    );

    await prisma.organization.create({
      data: { id: 'org', userId: 'owner', isDeleted: false },
    });
    await strategies.createWithClient(
      {
        organizationId: 'org',
        userId: 'owner',
        brandId: 'brand',
        label: 'Agent',
        dailyCreditBudget: 10,
        isActive: false,
      },
      prisma as never,
    );
    await strategies.setActive('strategy', 'org', true);
    vi.advanceTimersByTime(60_000);
    expect(
      PLATFORM_SCHEDULE_CATALOG['proactive-agent-strategies'].pattern,
    ).toBe('* * * * *');
    const job = {
      name: 'proactive-agent-strategies',
      timestamp: Date.now(),
    } as Job;
    await processor.process(job);
    await processor.process(job);
    expect(jobs).toHaveLength(1);
    const state = await autopilot.beginProactiveStrategies('org');
    const discovered = await autopilot.discoverProactiveStrategies('org', {
      state,
    });
    for (const item of discovered.items as Row[])
      await autopilot.dispatchProactiveStrategy({
        item,
        organizationId: 'org',
      });
    expect(executions.size).toBe(1);
    expect(executions.get('turn-1')?.result).toMatchObject({
      metadata: { strategyId: 'strategy', canonicalId: 'agent.turn.execute' },
    });

    const summary = { toBatchSummary: (value: unknown) => value };
    const creation = new BatchGenerationCreationService(
      prisma as never,
      logger as never,
      { findOne: vi.fn().mockResolvedValue({ id: 'brand' }) } as never,
      {} as never,
      {} as never,
      summary as never,
    );
    await creation.createBatch(
      {
        brandId: 'brand',
        count: 1,
        platforms: ['instagram'],
        dateRange: { start: '2026-09-24', end: '2026-09-25' },
      },
      'owner',
      'org',
      undefined,
      'strategy',
    );
    const processing = new BatchGenerationProcessingService(
      prisma as never,
      logger as never,
      {
        create: vi.fn(async (data) => {
          const post = { id: 'post', ...data };
          posts.push(post);
          return post;
        }),
      } as never,
      {
        generateContent: vi
          .fn()
          .mockResolvedValue([{ content: 'Deterministic generated caption' }]),
      } as never,
      summary as never,
    );
    await processing.processBatch('batch', 'org');
    expect(batch).toMatchObject({ agentStrategyId: 'strategy' });
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      agentStrategyId: 'strategy',
      targetExecutionState: 'draft',
    });
    await completion.completeExecution('turn-1');
    await completion.completeExecution('turn-1');
    expect(strategy).toMatchObject({
      config: {
        weeklyCreditBudget: 50,
        creditsUsedToday: 0.27,
        creditsUsedThisWeek: 0.27,
        lastRunAt: expect.any(String),
        runHistory: [
          expect.objectContaining({
            executionId: 'turn-1',
            contentGenerated: 0,
          }),
        ],
      },
    });
    installed = true;
    await processor.process({ ...job, timestamp: Date.now() + 60_000 } as Job);
    expect(jobs).toHaveLength(1);
  });
});
