import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { BrandMemoryService } from '@api/collections/brand-memory/services/brand-memory.service';
import { AnalyticsSyncService } from '@api/collections/content-performance/services/analytics-sync.service';
import { ContentProductionWorkflowService } from '@api/collections/workflows/services/content-production-workflow.service';
import { AgentProactiveToolHandler } from '@api/services/agent-orchestrator/tools/agent-proactive-tool-handler.service';
import { BrandMemorySyncService } from '@api/services/brand-memory/brand-memory-sync.service';
import {
  PersonaContentFormat,
  PostCategory,
  TargetExecutionState,
} from '@genfeedai/contracts';

/**
 * Two collection cycles through the real feedback-loop services over an
 * in-memory store: analytics sync → ContentPerformance → brand memory
 * (entries, day metrics, winner insight) → persona topic selection and the
 * proactive `analyze_performance` tool. Only Prisma is faked; every query
 * shape (tenant scope, relation filters, distinct, ordering) is evaluated.
 */

type Row = Record<string, unknown>;
type Query = {
  distinct?: string[];
  include?: { post?: unknown };
  orderBy?:
    | Array<Record<string, 'asc' | 'desc'>>
    | Record<string, 'asc' | 'desc'>;
  take?: number;
  where?: Row;
};

const OPERATORS = new Set(['in', 'gt', 'gte', 'lt', 'lte', 'not']);
const comparable = (value: unknown) =>
  value instanceof Date ? value.getTime() : (value as number);

function matchesCondition(value: unknown, condition: unknown): boolean {
  if (
    condition !== null &&
    typeof condition === 'object' &&
    !(condition instanceof Date) &&
    !Array.isArray(condition) &&
    Object.keys(condition).every((key) => OPERATORS.has(key))
  ) {
    const ops = condition as Record<string, unknown>;
    if ('in' in ops && !(ops.in as unknown[]).includes(value)) return false;
    if ('not' in ops && value === ops.not) return false;
    if (value === null || value === undefined) {
      return !('gt' in ops || 'gte' in ops || 'lt' in ops || 'lte' in ops);
    }
    const actual = comparable(value);
    if ('gt' in ops && !(actual > comparable(ops.gt))) return false;
    if ('gte' in ops && !(actual >= comparable(ops.gte))) return false;
    if ('lt' in ops && !(actual < comparable(ops.lt))) return false;
    if ('lte' in ops && !(actual <= comparable(ops.lte))) return false;
    return true;
  }
  return comparable(value) === comparable(condition);
}

function createStore() {
  const tables = {
    brandMemory: new Map<string, Row>(),
    contentPerformance: new Map<string, Row>(),
    post: new Map<string, Row>(),
    postAnalytics: new Map<string, Row>(),
  };
  const matches = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([key, condition]) => {
      if (condition === undefined) return true;
      if (key === 'post') {
        const post = tables.post.get(String(row.postId));
        return Boolean(post) && matches(post as Row, condition as Row);
      }
      return matchesCondition(row[key], condition);
    });
  const select = (table: Map<string, Row>, query: Query = {}): Row[] => {
    const orderBy = Array.isArray(query.orderBy)
      ? query.orderBy
      : query.orderBy
        ? [query.orderBy]
        : [];
    const rows = [...table.values()]
      .filter((row) => matches(row, query.where))
      .sort((left, right) => {
        for (const order of orderBy) {
          const [[field, direction]] = Object.entries(order);
          const a = comparable(left[field]);
          const b = comparable(right[field]);
          if (a === b) continue;
          return (a < b ? -1 : 1) * (direction === 'desc' ? -1 : 1);
        }
        return 0;
      });
    const seen = new Set<string>();
    const distinct = query.distinct
      ? rows.filter((row) => {
          const key = JSON.stringify(query.distinct?.map((f) => row[f]));
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
      : rows;
    return distinct
      .slice(0, query.take ?? distinct.length)
      .map((row) =>
        query.include?.post
          ? { ...row, post: tables.post.get(String(row.postId)) }
          : { ...row },
      );
  };
  const delegate = (table: Map<string, Row>) => ({
    create: vi.fn(async ({ data }: { data: Row }) => {
      const row = { ...data, id: data.id ?? `row-${table.size + 1}` };
      table.set(String(row.id), row);
      return { ...row };
    }),
    findFirst: vi.fn(async (query: Query) => select(table, query)[0] ?? null),
    findMany: vi.fn(async (query: Query) => select(table, query)),
    update: vi.fn(async ({ data, where }: { data: Row; where: Row }) => {
      const [row] = select(table, { where });
      if (!row) throw new Error('Record to update not found');
      const updated = { ...table.get(String(row.id)), ...data };
      table.set(String(row.id), updated);
      return { ...updated };
    }),
    upsert: vi.fn(
      async ({
        create,
        update,
        where,
      }: {
        create: Row;
        update: Row;
        where: Row;
      }) => {
        const [existing] = select(table, { where });
        const row = existing
          ? { ...table.get(String(existing.id)), ...update }
          : { ...create };
        table.set(String(row.id), row);
        return { ...row };
      },
    ),
  });
  return {
    prisma: {
      brandMemory: delegate(tables.brandMemory),
      contentPerformance: delegate(tables.contentPerformance),
      post: delegate(tables.post),
      postAnalytics: delegate(tables.postAnalytics),
    },
    tables,
  };
}

const ORG = 'org-1';
const BRAND = 'brand-1';
const DAY_ONE = new Date(2026, 8, 23);
const DAY_TWO = new Date(2026, 8, 24);

function seed(tables: ReturnType<typeof createStore>['tables']) {
  const posts = [
    ['post-craft', 'Show the craft before the pitch\nA concrete example.'],
    ['post-a', 'Pricing update for teams\nDetails.'],
    ['post-b', 'Pricing questions answered\nDetails.'],
    ['post-c', 'Pricing tiers explained\nDetails.'],
  ] as const;
  for (const [id, description] of posts) {
    tables.post.set(id, {
      agentStrategyId: 'strategy-1',
      brandId: BRAND,
      category: PostCategory.IMAGE,
      description,
      id,
      isDeleted: false,
      organizationId: ORG,
      personaId: 'persona-1',
      platform: 'instagram',
      targetExecutionState: TargetExecutionState.PUBLISHED,
    });
    tables.postAnalytics.set(`analytics-${id}-1`, {
      brandId: BRAND,
      clicks: null,
      date: DAY_ONE,
      id: `analytics-${id}-1`,
      isDeleted: false,
      organizationId: ORG,
      platform: 'instagram',
      postId: id,
      totalComments: id === 'post-craft' ? 10 : 0,
      totalLikes: id === 'post-craft' ? 90 : 20,
      totalSaves: 0,
      totalShares: 0,
      totalViews: 1000,
      userId: 'user-1',
    });
  }
  // A different tenant's identical-looking post never leaks into the loop.
  tables.post.set('post-foreign', {
    ...tables.post.get('post-craft'),
    id: 'post-foreign',
    organizationId: 'org-2',
  });
  tables.postAnalytics.set('analytics-foreign', {
    ...tables.postAnalytics.get('analytics-post-craft-1'),
    id: 'analytics-foreign',
    organizationId: 'org-2',
    postId: 'post-foreign',
    totalLikes: 900,
  });
}

function setup() {
  const store = createStore();
  seed(store.tables);
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  const memory = new BrandMemoryService(store.prisma as never, logger as never);
  const memorySync = new BrandMemorySyncService(
    store.prisma as never,
    memory,
    logger as never,
  );
  const sync = new AnalyticsSyncService(
    store.prisma as never,
    memorySync,
    logger as never,
  );
  const production = new ContentProductionWorkflowService(
    {} as never,
    {} as never,
    {} as never,
    store.prisma as never,
    {} as never,
    // Passes the brief through, so the test reads what the loop fed it.
    {
      enhance: async (input: { prompt: string }) => ({
        enhancedPrompt: input.prompt,
        status: 'applied',
      }),
    } as never,
    logger as never,
  );
  const proactive = new AgentProactiveToolHandler(
    logger as never,
    {} as never,
    undefined,
    undefined,
    undefined,
    store.prisma as never,
  );

  async function collect(): Promise<void> {
    const { items } = await sync.discoverItems({
      brandId: BRAND,
      organizationId: ORG,
    });
    for (const item of items) {
      const persisted = await sync.persistItem(ORG, item);
      await sync.syncItemMemory(ORG, persisted);
      await sync.detectItemAlerts(ORG, persisted);
    }
  }

  async function nextPersonaPrompt(): Promise<string> {
    const prepared = await production.prepareContentPipelinePersona({
      item: {
        brandId: BRAND,
        config: {
          contentStrategy: {
            formats: [PersonaContentFormat.PHOTO],
            topics: ['pricing', 'craft'],
          },
          profileImageUrl: 'https://example.com/profile.png',
        },
        credentialCount: 1,
        id: 'persona-1',
        label: 'Founder',
        organizationId: ORG,
        userId: 'user-1',
      },
      now: new Date().toISOString(),
    });
    const [request] = prepared.imageItems as Array<{ prompt: string }>;
    return request.prompt;
  }

  function analyze() {
    return proactive.analyzePerformance(
      { days: 7 },
      {
        brandId: BRAND,
        organizationId: ORG,
        strategyId: 'strategy-1',
        userId: 'user-1',
      },
    );
  }

  function memoryDoc(): Row {
    const docs = [...store.tables.brandMemory.values()];
    expect(docs).toHaveLength(1);
    return docs[0] as Row;
  }

  return { analyze, collect, memoryDoc, nextPersonaPrompt, store };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 23, 12));
});
afterEach(() => vi.useRealTimers());

describe('performance feedback loop across two collection cycles', () => {
  it('feeds observed metrics forward, updates changed metrics and never duplicates on retry', async () => {
    const f = setup();

    // Cycle one, collected twice (a retried sweep).
    await f.collect();
    await f.collect();

    const performance = f.store.tables.contentPerformance;
    expect(performance.size).toBe(4);
    const craft = performance.get('analytics-sync:analytics-post-craft-1');
    expect(craft).toMatchObject({
      brandId: BRAND,
      engagementRate: 10,
      organizationId: ORG,
      platform: 'instagram',
      postId: 'post-craft',
      views: 1000,
      data: {
        comments: 10,
        hookUsed: 'Show the craft before the pitch',
        likes: 90,
        personaId: 'persona-1',
        platform: 'instagram',
        promptUsed: 'Show the craft before the pitch\nA concrete example.',
        views: 1000,
      },
    });
    expect(craft).not.toHaveProperty('revenue');
    expect(((craft as Row).data as Row).clicks).toBeUndefined();

    const firstMemory = f.memoryDoc();
    expect(firstMemory.entries).toHaveLength(4);
    expect(firstMemory.metrics).toEqual({
      avgEngagementRate: 4,
      postsPublished: 4,
      topPerformingFormat: 'image',
      totalEngagement: 160,
    });
    const firstInsights = firstMemory.insights as Row[];
    expect(firstInsights).toEqual([
      expect.objectContaining({
        category: 'performance',
        insight: expect.stringContaining(
          '10.00% engagement versus a 2.00% baseline across 3 recent posts (5.00x). Hook: "Show the craft before the pitch"',
        ),
        source: 'analytics-winner:post-craft',
      }),
    ]);

    const firstPrompt = await f.nextPersonaPrompt();
    expect(firstPrompt).toBe(
      'Persona: Founder. Tone: engaging. Topic: craft. Observed feedback: 1 prior posts about this topic averaged 100.00 performance score.',
    );
    const firstAnalysis = await f.analyze();
    expect(firstAnalysis).toMatchObject({
      success: true,
      data: { totalPosts: 4 },
    });
    expect(
      (firstAnalysis.data as { topPerformers: Row[] }).topPerformers[0],
    ).toMatchObject({ engagement: 100, id: 'post-craft', views: 1000 });

    // Cycle two, same day: the provider reports grown totals for one post.
    Object.assign(
      f.store.tables.postAnalytics.get('analytics-post-craft-1') ?? {},
      { totalLikes: 280, totalComments: 20, totalViews: 2000 },
    );
    await f.collect();
    await f.collect();

    expect(performance.size).toBe(4);
    expect(
      performance.get('analytics-sync:analytics-post-craft-1'),
    ).toMatchObject({ engagementRate: 15, likes: 280, views: 2000 });
    const secondMemory = f.memoryDoc();
    expect(secondMemory.entries).toHaveLength(4);
    expect(
      (secondMemory.entries as Row[]).filter(
        (entry) => entry.key === 'post_performance:post-craft',
      ),
    ).toEqual([
      expect.objectContaining({
        content:
          'Post post-craft on instagram reached 300 engagements with 15.00% engagement rate.',
      }),
    ]);
    expect(secondMemory.metrics).toMatchObject({
      avgEngagementRate: 5.25,
      postsPublished: 4,
      totalEngagement: 360,
    });
    expect(secondMemory.insights).toEqual([
      expect.objectContaining({
        insight: expect.stringContaining('15.00% engagement'),
        source: 'analytics-winner:post-craft',
      }),
    ]);
    const secondAnalysis = await f.analyze();
    expect(secondAnalysis.data).toMatchObject({ totalPosts: 4 });
    expect(
      (secondAnalysis.data as { topPerformers: Row[] }).topPerformers[0],
    ).toMatchObject({ engagement: 300, id: 'post-craft', views: 2000 });

    // Next day: a new daily snapshot adds one row, never a second sample.
    vi.setSystemTime(new Date(2026, 8, 24, 12));
    f.store.tables.postAnalytics.set('analytics-post-craft-2', {
      ...f.store.tables.postAnalytics.get('analytics-post-craft-1'),
      date: DAY_TWO,
      id: 'analytics-post-craft-2',
      totalLikes: 380,
      totalViews: 2500,
    });
    await f.collect();
    expect(performance.size).toBe(5);
    expect(await f.nextPersonaPrompt()).toContain(
      'Observed feedback: 1 prior posts about this topic',
    );
    const thirdAnalysis = await f.analyze();
    expect(thirdAnalysis.data).toMatchObject({ totalPosts: 4 });
    expect(
      (thirdAnalysis.data as { topPerformers: Row[] }).topPerformers[0],
    ).toMatchObject({ engagement: 400, id: 'post-craft', views: 2500 });
    expect(
      [...performance.values()].every((row) => row.organizationId === ORG),
    ).toBe(true);
  });
});
