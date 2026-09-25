import { AgentStrategiesService } from '@api/collections/agent-strategies/services/agent-strategies.service';
import { AgentStrategyAutopilotPerformanceService } from '@api/collections/agent-strategies/services/agent-strategy-autopilot-performance.service';
import { AgentStrategyOpportunitiesService } from '@api/collections/agent-strategies/services/agent-strategy-opportunities.service';
import { AnalyticsSyncService } from '@api/collections/content-performance/services/analytics-sync.service';
import { ContentPerformanceService } from '@api/collections/content-performance/services/content-performance.service';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { AgentAutopilotWorkflowService } from '@api/collections/workflows/services/agent-autopilot-workflow.service';
import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import {
  AgentAutonomyMode,
  PostCategory,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

type StoredRow = Record<string, unknown>;
type RowQuery = { where?: StoredRow };
type RowWrite = { data: StoredRow };
type EnqueuedRun = Parameters<
  SystemWorkflowRunnerService['enqueueWorkflow']
>[0];

function setup(dailyCreditBudget = 20) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-24T12:00:00Z'));
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const strategy = {
    id: 'strategy-1',
    organizationId: 'org-1',
    brandId: 'brand-1',
    userId: 'user-1',
    label: 'Editorial agent',
    agentType: 'social',
    isActive: true,
    isDeleted: false,
    platforms: ['instagram'],
    config: {
      dailyCreditBudget,
      weeklyCreditBudget: 100,
      minCreditThreshold: 0,
      topics: ['craft'],
      platforms: ['instagram'],
      autonomyMode: AgentAutonomyMode.SUPERVISED,
      timezone: 'UTC',
    },
    policies: {},
  };
  const posts = new Map<string, StoredRow>();
  const evidence = new Map<string, StoredRow>();
  const analytics = new Map<string, StoredRow>();
  const executions: Array<{ id: string; request: EnqueuedRun }> = [];
  let thread: StoredRow | null = null;
  const matches = (row: StoredRow, where: StoredRow = {}): boolean => {
    for (const key of [
      'organizationId',
      'brandId',
      'agentStrategyId',
      'isDeleted',
    ]) {
      if (where[key] !== undefined && row[key] !== where[key]) return false;
    }
    if (where.id && typeof where.id === 'object' && 'in' in where.id) {
      return (where.id.in as string[]).includes(String(row.id));
    }
    return typeof where.id !== 'string' || row.id === where.id;
  };
  const selectPosts = ({ where }: RowQuery = {}) =>
    [...posts.values()].filter((row) => matches(row, where));
  const selectEvidence = ({ where }: RowQuery = {}) =>
    [...evidence.values()].filter(
      (row) =>
        matches(row, where) &&
        (!where?.post ||
          matches(
            posts.get(String(row.postId)) ?? {},
            where.post as StoredRow,
          )),
    );
  const prisma = {
    $queryRaw: vi.fn(async () => []),
    $transaction: vi.fn(async (operation: (tx: unknown) => Promise<unknown>) =>
      operation(prisma),
    ),
    agentStrategy: {
      findFirst: vi.fn(async () => strategy),
      update: vi.fn(async ({ data }: RowWrite) =>
        Object.assign(strategy, data),
      ),
    },
    agentStrategyOpportunity: { findMany: vi.fn(async () => []) },
    agentThread: {
      findFirst: vi.fn(async () => thread),
      create: vi.fn(async ({ data }: RowWrite) => {
        thread = { ...data, id: 'thread-1', isDeleted: false };
        return thread;
      }),
    },
    brand: {
      findFirst: vi.fn(async () => ({
        id: 'brand-1',
        agentConfig: {
          voice: { tone: 'precise' },
          strategy: { topics: ['craft'], platforms: ['instagram'] },
        },
      })),
    },
    workflowExecution: { findFirst: vi.fn(async () => null) },
    post: {
      create: vi.fn(async ({ data }: RowWrite) => {
        const row = {
          ...data,
          id: `post-${posts.size + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          isDeleted: false,
        };
        posts.set(row.id, row);
        return row;
      }),
      findMany: vi.fn(async (query: RowQuery) => selectPosts(query)),
      count: vi.fn(async (query: RowQuery) => selectPosts(query).length),
    },
    postAnalytics: {
      findMany: vi.fn(async ({ where }: RowQuery) =>
        [...analytics.values()].filter((row) => matches(row, where)),
      ),
    },
    contentPerformance: {
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { id: string };
          create: StoredRow;
          update: StoredRow;
        }) => {
          const row = evidence.has(where.id)
            ? { ...evidence.get(where.id), ...update }
            : create;
          evidence.set(where.id, row);
          return row;
        },
      ),
      findMany: vi.fn(async (query: RowQuery) => selectEvidence(query)),
      count: vi.fn(async (query: RowQuery) => selectEvidence(query).length),
    },
  };
  const strategies = new AgentStrategiesService(
    prisma as never,
    logger as never,
  );
  const postService = new PostsService(
    prisma as never,
    logger as never,
    {} as never,
  );
  const performance = new AgentStrategyAutopilotPerformanceService(
    strategies,
    {} as never,
    postService,
    new AgentStrategyOpportunitiesService(prisma as never, logger as never),
    new ContentPerformanceService(prisma as never, logger as never),
  );
  const memory = { syncPostPerformance: vi.fn(async () => {}) };
  const sync = new AnalyticsSyncService(
    prisma as never,
    memory as never,
    logger as never,
  );
  const reserveCredits = vi.fn(async () => ({ id: 'reservation' }));
  // The queue/provider adapter captures durable input and returns deterministic generated/provider output.
  // All brief assembly, analytics ingestion, normalization, ranking and thread selection use real services.
  const runner = {
    enqueueWorkflow: vi.fn(async (request: EnqueuedRun) => {
      await reserveCredits();
      const executionId = `run-${executions.length + 1}`;
      executions.push({ id: executionId, request: structuredClone(request) });
      const post = await postService.create(
        {
          organizationId: 'org-1',
          brandId: 'brand-1',
          userId: 'user-1',
          agentStrategyId: strategy.id,
          workflowExecutionId: executionId,
          description:
            executions.length === 1
              ? 'Show the craft before the pitch\nA concrete example.'
              : 'Follow-up craft example',
          category: PostCategory.IMAGE,
          platform: 'instagram',
          targetExecutionState: TargetExecutionState.DRAFT,
          ingredients: [],
        } as never,
        [],
      );
      const row = posts.get(post.id);
      Object.assign(row ?? {}, {
        targetExecutionState: TargetExecutionState.PUBLISHED,
        publishedAt: new Date(),
        externalId: `provider-${post.id}`,
      });
      analytics.set(`analytics-${post.id}`, {
        id: `analytics-${post.id}`,
        postId: post.id,
        organizationId: 'org-1',
        brandId: 'brand-1',
        userId: 'user-1',
        isDeleted: false,
        platform: 'instagram',
        date: new Date(),
        totalViews: 1000,
        clicks: 20,
        totalLikes: 40,
        totalComments: 5,
        totalShares: 5,
        totalSaves: 10,
      });
      return { executionId };
    }),
  };
  const workflow = new AgentAutopilotWorkflowService(
    prisma as never,
    performance,
    runner as never,
    { getOrganizationCreditsBalance: vi.fn(async () => 1000) } as never,
    { findOne: vi.fn(async () => ({})) } as never,
    {} as never,
    {} as never,
    logger as never,
  );
  async function ingest() {
    const discovered = await sync.discoverItems({
      organizationId: 'org-1',
      brandId: 'brand-1',
    });
    for (const item of discovered.items)
      await sync.syncItemMemory('org-1', await sync.persistItem('org-1', item));
  }
  return {
    workflow,
    strategy,
    posts,
    evidence,
    analytics,
    executions,
    prisma,
    runner,
    reserveCredits,
    ingest,
    memory,
  };
}

function brief(run: EnqueuedRun): StoredRow {
  const input = run.inputValues as { request: { content: string } };
  return JSON.parse(
    input.request.content
      .split('<agent_brief_json>\n')[1]
      .split('\n</agent_brief_json>')[0],
  ) as StoredRow;
}

afterEach(() => vi.useRealTimers());

describe('agent content loop across two cycles', () => {
  it('feeds first-cycle measured performance into the second brief, reuses the thread and retains snapshot lineage', async () => {
    const f = setup();
    expect(
      await f.workflow.dispatchProactiveStrategy({ item: f.strategy }),
    ).toMatchObject({ executionId: 'run-1', status: 'enqueued' });
    expect(f.posts.get('post-1')).toMatchObject({
      agentStrategyId: 'strategy-1',
      workflowExecutionId: 'run-1',
      brandId: 'brand-1',
    });
    await f.ingest();
    await f.ingest();
    expect(f.evidence.size).toBe(1);
    Object.assign(f.analytics.get('analytics-post-1') ?? {}, {
      totalViews: 2000,
      clicks: 60,
    });
    await f.ingest();
    expect(f.evidence.size).toBe(1);
    expect(f.evidence.get('analytics-sync:analytics-post-1')).toMatchObject({
      postId: 'post-1',
      workflowExecutionId: 'run-1',
      views: 2000,
      data: { clicks: 60, hookUsed: 'Show the craft before the pitch' },
    });

    vi.setSystemTime(new Date('2026-09-25T12:00:00Z'));
    expect(
      await f.workflow.dispatchProactiveStrategy({ item: f.strategy }),
    ).toMatchObject({ executionId: 'run-2', status: 'enqueued' });
    expect(f.prisma.agentThread.create).toHaveBeenCalledTimes(1);
    const first = f.executions[0].request;
    const second = f.executions[1].request;
    expect(first.inputValues).toMatchObject({
      request: {
        strategyId: 'strategy-1',
        brandId: 'brand-1',
        threadId: 'thread-1',
      },
    });
    expect(second.inputValues).toMatchObject({
      request: {
        strategyId: 'strategy-1',
        brandId: 'brand-1',
        threadId: 'thread-1',
      },
    });
    expect(brief(first).weeklyPerformance).toMatchObject({
      generatedCount: 0,
      impressions: 0,
      topHooks: [],
    });
    expect(brief(second).weeklyPerformance).toMatchObject({
      generatedCount: 1,
      publishedCount: 1,
      impressions: 2000,
      clicks: 60,
      topHooks: ['Show the craft before the pitch'],
      bestPlatformFormatPairs: [
        { platform: 'instagram', format: 'image', score: 60 },
      ],
    });
    expect(second.metadata).toMatchObject({
      strategyId: 'strategy-1',
      threadId: 'thread-1',
      performanceSnapshot: brief(second).weeklyPerformance,
    });
    expect(first.metadata).toMatchObject({
      performanceSnapshot: { impressions: 0, topHooks: [] },
    });
    expect(f.memory.syncPostPerformance).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      'post-1',
    );
    expect(f.prisma.contentPerformance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organizationId: 'org-1',
          post: expect.objectContaining({
            agentStrategyId: 'strategy-1',
            brandId: 'brand-1',
            organizationId: 'org-1',
          }),
        }),
      }),
    );
  });

  it('stops before enqueue or reservation when the strategy budget is explicitly zero', async () => {
    const f = setup(0);
    expect(
      await f.workflow.dispatchProactiveStrategy({ item: f.strategy }),
    ).toMatchObject({ status: 'skipped', executionId: null });
    expect(f.runner.enqueueWorkflow).not.toHaveBeenCalled();
    expect(f.reserveCredits).not.toHaveBeenCalled();
    expect(f.posts.size).toBe(0);
    expect(f.prisma.agentThread.create).not.toHaveBeenCalled();
  });
});
