import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { WorkflowExecutionsService } from '@api/collections/workflow-executions/services/workflow-executions.service';
import { AgentAutopilotWorkflowService } from '@api/collections/workflows/services/agent-autopilot-workflow.service';
import { BatchGenerationCreationService } from '@api/services/batch-generation/batch-generation-creation.service';
import { BatchGenerationProcessingService } from '@api/services/batch-generation/batch-generation-processing.service';
import {
  AgentPublishDecision,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { PLATFORM_SYSTEM_WORKFLOW_QUEUE } from '@genfeedai/contracts/queue';
import { CredentialPlatform, toPrismaJson } from '@genfeedai/prisma';
import { PLATFORM_SCHEDULE_CATALOG } from '@workers/scheduling/platform-schedules.constants';
import { PlatformSchedulesProcessor } from '@workers/scheduling/platform-schedules.processor';
import { PlatformWorkflowSchedulesService } from '@workers/scheduling/platform-workflow-schedules.service';
import type { Job } from 'bullmq';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ProactiveAgentRuntimeFixture,
  readRuntimeBrief,
  runtimeRecord,
} from './proactive-agent-runtime.fixture';

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
      $queryRaw: vi.fn(async (query: unknown) =>
        Array.isArray(query) &&
        String(query[0]).includes('pg_try_advisory_xact_lock')
          ? [{ acquired: true }]
          : [],
      ),
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
            // #5136: recordProactiveRunCompletion reads these nested
            // relations (via `select`) to build the strategy's report and
            // source path.
            brand: { slug: 'brand' },
            organization: { slug: 'org' },
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
        findFirst: vi.fn(async ({ where }: { where: Row }) => {
          const resultFilter = where.result as
            | { path?: string[]; equals?: unknown }
            | undefined;
          const dispatchId =
            resultFilter?.path?.[1] === 'dispatchId'
              ? resultFilter.equals
              : undefined;
          if (!dispatchId) return null;
          for (const row of executions.values()) {
            const metadata = (row.result as Row | undefined)?.metadata as
              | Row
              | undefined;
            if (
              row.organizationId === where.organizationId &&
              metadata?.dispatchId === dispatchId
            ) {
              return { id: row.id };
            }
          }
          return null;
        }),
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
      agentThread: {
        findFirst: vi.fn(async () => null),
        create: vi.fn(async ({ data }: { data: Row }) => ({
          id: 'thread',
          ...data,
        })),
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
      // #5136: buildSyntheticUserMessage looks up the strategy's brand for
      // its agentConfig (voice/strategy defaults) before dispatching.
      brand: {
        findFirst: vi.fn(async () => ({ agentConfig: {} })),
      },
      // #5136: recordProactiveRunCompletion upserts a daily strategy report
      // on the transaction as part of completing a proactive run.
      agentStrategyReport: {
        upsert: vi.fn().mockResolvedValue({}),
      },
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
        afterCommit: vi.fn(),
        recordInTransaction: vi.fn().mockResolvedValue(null),
      } as never,
      strategies,
    );
    const jobs: Row[] = [];
    const runner = {
      enqueueWorkflow: vi.fn(async (input) => {
        if (
          input.canonicalId !== 'agent.turn.execute' &&
          input.idempotencyKey
        ) {
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
    const schedules = new PlatformWorkflowSchedulesService(
      prisma as never,
      runner as never,
      logger as never,
      { reconcile: vi.fn() } as never,
      { reconcile: vi.fn() } as never,
    );
    // List every constructor argument so an arity change fails typecheck
    // instead of shifting workflowSchedules into the wrong slot.
    const processor = new PlatformSchedulesProcessor(
      { isDevSchedulersEnabled: true } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      schedules as never,
      {} as never,
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
      {
        resolveForPost: vi.fn().mockResolvedValue({
          result: { decision: AgentPublishDecision.DENIED },
        }),
      } as never,
      { approveItems: vi.fn() } as never,
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

describe('isolated PostgreSQL/Redis proactive runtime', () => {
  let fixture: ProactiveAgentRuntimeFixture;
  beforeEach(async () => {
    fixture = new ProactiveAgentRuntimeFixture();
    await fixture.initialize();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('External HTTP forbidden in isolated agent runtime');
      }),
    );
  });
  afterEach(async () => {
    await fixture?.close();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('runs a native queued graph, requires approval, publishes, and learns its own measured hook in cycle two', async () => {
    const agent = await fixture.createAgent();
    const paused = await fixture.createAgent(20, false);
    const controls = await fixture.seedLearningScopeControls(
      agent.id,
      paused.id,
    );
    fixture.runner.onApplicationBootstrap();
    fixture.runner.onApplicationBootstrap();
    fixture.startWorkers();
    await fixture.schedules.sweep('proactive-agent-strategies', Date.now());
    const sweep = await fixture.prisma.workflowExecution.findFirstOrThrow({
      where: {
        organizationId: fixture.organizationId,
        isDeleted: false,
        idempotencyKey: { startsWith: 'platform:' },
      },
    });
    const sweepResult = await fixture.waitForExecution(sweep.id);
    expect(
      runtimeRecord(sweepResult).nodeResults,
      JSON.stringify(fixture.graphRuns.mock.calls),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'finalize',
          output: expect.objectContaining({ enqueued: 1 }),
        }),
      ]),
    );
    const first = await fixture.prisma.workflowExecution.findFirstOrThrow({
      where: {
        organizationId: fixture.organizationId,
        isDeleted: false,
        idempotencyKey: { startsWith: 'proactive:' },
      },
    });
    await fixture.waitForExecution(first.id);
    const post = await fixture.prisma.post.findFirstOrThrow({
      where: {
        organizationId: fixture.organizationId,
        isDeleted: false,
        workflowExecutionId: first.id,
      },
    });
    expect(post).toMatchObject({
      agentStrategyId: agent.id,
      platform: 'linkedin',
      targetExecutionState: TargetExecutionState.DRAFT,
      publishApprovalId: null,
    });
    expect(fixture.generated).toHaveBeenCalledTimes(1);
    expect(fixture.published).not.toHaveBeenCalled();
    if (!post.reviewBatchId || !post.reviewItemId)
      throw new Error('Generated draft lost its review attribution');
    await fixture.review.approveItems(
      post.reviewBatchId,
      [post.reviewItemId],
      fixture.organizationId,
      fixture.userId,
    );
    const approved = await fixture.prisma.post.findFirstOrThrow({
      where: {
        id: post.id,
        organizationId: fixture.organizationId,
        isDeleted: false,
      },
      include: { publishApproval: true },
    });
    expect(approved.targetExecutionState).toBe(TargetExecutionState.SCHEDULED);
    const grant = approved.publishApproval;
    if (!grant) throw new Error('Approval did not mint a version-bound grant');
    expect(grant.artifactVersionPinId).toBeTruthy();
    const afterApproval = await fixture.prisma.agentStrategy.findUniqueOrThrow({
      where: { id: agent.id },
    });
    await fixture.review.approveItems(
      post.reviewBatchId,
      [post.reviewItemId],
      fixture.organizationId,
      fixture.userId,
    );
    expect(
      (
        await fixture.prisma.agentStrategy.findUniqueOrThrow({
          where: { id: agent.id },
        })
      ).policies,
    ).toEqual(afterApproval.policies);
    const publishInput = {
      approvalId: grant.id,
      operationId: grant.operationId,
      versionPinId: grant.artifactVersionPinId,
      postId: post.id,
      organizationId: fixture.organizationId,
      userId: fixture.userId,
      source: 'publish_now' as const,
    };
    await Promise.all([
      fixture.publish(publishInput),
      fixture.publish(publishInput),
    ]);
    expect(fixture.published).toHaveBeenCalledTimes(1);
    await fixture.stopWorkers();
    fixture.startWorkers();
    await expect(fixture.publish(publishInput)).rejects.toThrow();
    expect(fixture.published).toHaveBeenCalledTimes(1);
    expect(
      await fixture.prisma.post.findUnique({ where: { id: post.id } }),
    ).toMatchObject({ targetExecutionState: TargetExecutionState.PUBLISHED });
    await fixture.prisma.postAnalytics.create({
      data: {
        postId: post.id,
        organizationId: fixture.organizationId,
        userId: fixture.userId,
        brandId: fixture.brandId,
        platform: CredentialPlatform.LINKEDIN,
        date: new Date(),
        totalViews: 100,
        clicks: 1,
      },
    });
    await fixture.ingest();
    await fixture.prisma.postAnalytics.updateMany({
      where: {
        postId: post.id,
        organizationId: fixture.organizationId,
        isDeleted: false,
      },
      data: { totalViews: 200, clicks: 2 },
    });
    await fixture.ingest();
    expect(
      await fixture.prisma.contentPerformance.count({
        where: {
          postId: post.id,
          organizationId: fixture.organizationId,
          isDeleted: false,
        },
      }),
    ).toBe(1);
    const snapshot = await fixture.performance.getPerformanceSnapshot(
      agent.id,
      fixture.organizationId,
    );
    const winningHook = post.description?.split('\n')[0];
    expect(winningHook).not.toBe('craft');
    expect(snapshot.topHooks).toEqual([winningHook]);
    expect(snapshot.impressions).toBe(200);
    expect(snapshot.clicks).toBe(2);
    expect(snapshot.bestPlatformFormatPairs[0]?.platform).toBe('linkedin');
    const current = await fixture.prisma.agentStrategy.findUniqueOrThrow({
      where: { id: agent.id },
    });
    await fixture.prisma.agentStrategy.update({
      where: {
        id: agent.id,
        organizationId: fixture.organizationId,
        isDeleted: false,
      },
      data: {
        config: toPrismaJson({
          ...runtimeRecord(current.config),
          nextRunAt: new Date(Date.now() - 1000).toISOString(),
        }),
      },
    });
    const dispatched = await fixture.dispatch(agent.id);
    const secondId = String(dispatched.executionId);
    expect(secondId).not.toBe(first.id);
    await fixture.waitForExecution(secondId);
    const second = await fixture.prisma.workflowExecution.findUniqueOrThrow({
      where: { id: secondId },
    });
    const request = runtimeRecord(
      runtimeRecord(second.result).inputValues,
    ).request;
    expect(
      runtimeRecord(
        readRuntimeBrief(String(runtimeRecord(request).content))
          .weeklyPerformance,
      ).topHooks,
    ).toEqual([winningHook]);
    expect(fixture.generated.mock.calls[1][0]).toMatchObject({
      topic: winningHook,
      platform: 'linkedin',
    });
    expect(
      await fixture.prisma.agentThread.count({
        where: {
          agentStrategyId: agent.id,
          organizationId: fixture.organizationId,
          isDeleted: false,
        },
      }),
    ).toBe(1);
    expect(
      await fixture.prisma.creditTransaction.count({
        where: { organizationId: fixture.organizationId, isDeleted: false },
      }),
    ).toBe(2);
    expect(
      await fixture.prisma.agentStrategyReport.count({
        where: {
          strategyId: agent.id,
          organizationId: fixture.organizationId,
          isDeleted: false,
        },
      }),
    ).toBe(2);
    const settled = await fixture.prisma.agentStrategy.findUniqueOrThrow({
      where: { id: agent.id },
    });
    expect(runtimeRecord(settled.config)).toMatchObject({
      creditsUsedToday: 2,
      totalRuns: 2,
    });
    expect(
      await fixture.prisma.agentStrategy.findUnique({
        where: { id: paused.id },
      }),
    ).toMatchObject({ isActive: false, config: paused.config });
    expect(
      await fixture.prisma.workflow.findUniqueOrThrow({
        where: { id: controls.pausedWorkflow.id },
      }),
    ).toMatchObject({
      status: 'draft',
      isScheduleEnabled: false,
      currentVersionId: controls.pausedWorkflow.currentVersionId,
    });
    expect(
      await fixture.prisma.workflowExecution.count({
        where: {
          organizationId: controls.foreignAgent.organizationId,
          isDeleted: false,
        },
      }),
    ).toBe(0);
    expect(
      await fixture.prisma.agentStrategy.findUniqueOrThrow({
        where: { id: controls.foreignAgent.id },
      }),
    ).toMatchObject({ config: controls.foreignAgent.config });
  }, 60_000);

  it('converges concurrent dispatch and recovers PENDING transport using the frozen request after restart', async () => {
    const agent = await fixture.createAgent();
    const slot = await fixture.makeDue(agent.id);
    let markEntered!: () => void;
    let releaseEnqueue!: () => void;
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    const released = new Promise<void>((resolve) => {
      releaseEnqueue = resolve;
    });
    const enqueue = fixture.runner.enqueueWorkflow.bind(fixture.runner);
    const heldEnqueue = vi
      .spyOn(fixture.runner, 'enqueueWorkflow')
      .mockImplementationOnce(async (...args) => {
        markEntered();
        await released;
        return enqueue(...args);
      });
    const firstDispatch = fixture.dispatch(agent.id);
    const results: Record<string, unknown>[] = [];
    try {
      await Promise.race([
        entered,
        firstDispatch.then(() => {
          throw new Error(
            'Dispatch settled before acquiring the enqueue barrier',
          );
        }),
      ]);
      const competing = await fixture.dispatch(agent.id);
      results.push(competing);
      expect(competing).toEqual({ status: 'skipped' });
    } finally {
      releaseEnqueue();
      try {
        results.push(await firstDispatch);
      } finally {
        heldEnqueue.mockRestore();
      }
    }
    const execution = await fixture.prisma.workflowExecution.findFirstOrThrow({
      where: {
        organizationId: fixture.organizationId,
        isDeleted: false,
        idempotencyKey: { startsWith: 'proactive:' },
      },
    });
    expect(
      results.filter((result) => result?.executionId === execution.id),
    ).toHaveLength(1);
    expect(
      await fixture.prisma.workflowExecution.count({
        where: {
          organizationId: fixture.organizationId,
          isDeleted: false,
          idempotencyKey: execution.idempotencyKey,
        },
      }),
    ).toBe(1);
    const frozen = execution.result;
    const queued = await fixture
      .getQueue(PLATFORM_SYSTEM_WORKFLOW_QUEUE)
      .getJob(`system-workflow-${execution.id}`);
    if (!queued) throw new Error('Missing actual pending transport job');
    await queued.remove();
    await fixture.makeDue(agent.id, slot);
    expect(
      await fixture.dispatch(agent.id, fixture.restartDispatcher()),
    ).toMatchObject({ executionId: execution.id });
    expect(
      await fixture.prisma.workflowExecution.findUnique({
        where: { id: execution.id },
      }),
    ).toMatchObject({ result: frozen });
    fixture.startWorkers();
    await fixture.waitForExecution(execution.id);
    expect(fixture.generated).toHaveBeenCalledTimes(1);
    expect(
      await fixture.prisma.creditTransaction.count({
        where: { organizationId: fixture.organizationId, isDeleted: false },
      }),
    ).toBe(1);
    await fixture.stopWorkers();
    const completed = await fixture
      .getQueue(PLATFORM_SYSTEM_WORKFLOW_QUEUE)
      .getJob(`system-workflow-${execution.id}`);
    await completed?.remove();
    await fixture.makeDue(agent.id, slot);
    expect(
      await fixture.dispatch(agent.id, fixture.restartDispatcher()),
    ).toMatchObject({ executionId: execution.id });
    expect(
      await fixture
        .getQueue(PLATFORM_SYSTEM_WORKFLOW_QUEUE)
        .getJob(`system-workflow-${execution.id}`),
    ).toBeUndefined();
    expect(fixture.generated).toHaveBeenCalledTimes(1);
  }, 60_000);

  it('accepts a lost enqueue response without counting a failure and never replays a failed slot', async () => {
    const agent = await fixture.createAgent();
    const slot = await fixture.makeDue(agent.id);
    const enqueue = fixture.runner.enqueueWorkflow.bind(fixture.runner);
    const lostResponse = vi
      .spyOn(fixture.runner, 'enqueueWorkflow')
      .mockImplementationOnce(async (...args) => {
        await enqueue(...args);
        throw new Error('Response lost after durable enqueue');
      });
    const result = await fixture.dispatch(agent.id);
    expect(result.executionId).toBeTruthy();
    expect(
      runtimeRecord(
        (
          await fixture.prisma.agentStrategy.findUniqueOrThrow({
            where: { id: agent.id },
          })
        ).config,
      ).consecutiveFailures,
    ).toBe(0);
    lostResponse.mockRestore();
    const executionId = String(result.executionId);
    await fixture.executions.completeExecution(
      executionId,
      'Deterministic worker failure before inference',
    );
    const job = await fixture
      .getQueue(PLATFORM_SYSTEM_WORKFLOW_QUEUE)
      .getJob(`system-workflow-${executionId}`);
    await job?.remove();
    await fixture.makeDue(agent.id, slot);
    expect(
      await fixture.dispatch(agent.id, fixture.restartDispatcher()),
    ).toMatchObject({ executionId });
    expect(
      await fixture
        .getQueue(PLATFORM_SYSTEM_WORKFLOW_QUEUE)
        .getJob(`system-workflow-${executionId}`),
    ).toBeUndefined();
    expect(fixture.generated).not.toHaveBeenCalled();
    expect(fixture.published).not.toHaveBeenCalled();
  });

  it('refuses a zero budget and preserves archived strategy threads', async () => {
    const zero = await fixture.createAgent(0);
    expect(await fixture.dispatch(zero.id)).toMatchObject({
      status: 'skipped',
    });
    const agent = await fixture.createAgent();
    const first = await fixture.dispatch(agent.id);
    await fixture.executions.completeExecution(
      String(first.executionId),
      'Fixture stops before inference',
    );
    await fixture.prisma.agentThread.updateMany({
      where: {
        agentStrategyId: agent.id,
        organizationId: fixture.organizationId,
        isDeleted: false,
      },
      data: { status: 'archived' },
    });
    await fixture.makeDue(agent.id);
    expect(await fixture.dispatch(agent.id)).toMatchObject({
      status: 'skipped',
    });
    expect(
      await fixture.prisma.agentThread.count({
        where: {
          agentStrategyId: agent.id,
          organizationId: fixture.organizationId,
          isDeleted: false,
        },
      }),
    ).toBe(1);
    expect(fixture.generated).not.toHaveBeenCalled();
    expect(fixture.published).not.toHaveBeenCalled();
  });

  it('serializes approval against expiry and never publishes an expired draft', async () => {
    const agent = await fixture.createAgent();
    const run = await fixture.dispatch(agent.id);
    fixture.startWorkers();
    await fixture.waitForExecution(String(run.executionId));
    const post = await fixture.prisma.post.findFirstOrThrow({
      where: {
        organizationId: fixture.organizationId,
        agentStrategyId: agent.id,
        isDeleted: false,
      },
    });
    if (!post.reviewBatchId || !post.reviewItemId)
      throw new Error('Review attribution missing');
    const outcomes = await Promise.allSettled([
      fixture.review.expireAutonomousReviewBatch(
        post.reviewBatchId,
        fixture.organizationId,
        new Date(Date.now() + 25 * 3_600_000),
      ),
      fixture.review.approveItems(
        post.reviewBatchId,
        [post.reviewItemId],
        fixture.organizationId,
        fixture.userId,
      ),
    ]);
    const current = await fixture.prisma.post.findUniqueOrThrow({
      where: { id: post.id },
    });
    expect([
      TargetExecutionState.CANCELLED,
      TargetExecutionState.SCHEDULED,
    ]).toContain(current.targetExecutionState);
    if (current.isDeleted) {
      expect(current.targetExecutionState).toBe(TargetExecutionState.CANCELLED);
      expect(current.publishApprovalId).toBeNull();
      expect(outcomes[1].status).toBe('rejected');
      await expect(
        fixture.publish({
          organizationId: fixture.organizationId,
          postId: post.id,
          userId: fixture.userId,
          source: 'publish_now',
        }),
      ).rejects.toThrow();
    } else {
      expect(current.publishApprovalId).toBeTruthy();
      expect(outcomes[1].status).toBe('fulfilled');
      expect(outcomes[0]).toMatchObject({ status: 'fulfilled', value: [] });
    }
    expect(fixture.published).not.toHaveBeenCalled();
  }, 60_000);
});
