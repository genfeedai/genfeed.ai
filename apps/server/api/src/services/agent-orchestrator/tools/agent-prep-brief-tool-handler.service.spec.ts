import type { AgentMemoriesService } from '@api/collections/agent-memories/services/agent-memories.service';
import type { AgentKnowledgeToolHandler } from '@api/services/agent-orchestrator/tools/agent-knowledge-tool-handler.service';
import { AgentPrepBriefToolHandler } from '@api/services/agent-orchestrator/tools/agent-prep-brief-tool-handler.service';
import type { ToolExecutionContext } from '@api/services/agent-orchestrator/tools/agent-tool-executor.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { TargetExecutionState } from '@genfeedai/contracts';
import type {
  AgentPrepBrief,
  AgentToolResult,
} from '@genfeedai/contracts/interfaces';
import { describe, expect, it } from 'vitest';

type Row = Record<string, unknown>;
type Query = {
  by?: string[];
  orderBy?: Array<Record<string, 'asc' | 'desc'>>;
  take?: number;
  where?: Row;
};

const DAY_MS = 86_400_000;
const ORG = 'org-1';
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

/** Evaluates the equality, `in`, `gte` and `lte` shapes the handler queries use. */
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, condition]) => {
    const value = row[key];
    if (condition instanceof Date) {
      return value instanceof Date && value.getTime() === condition.getTime();
    }
    if (condition !== null && typeof condition === 'object') {
      const ops = condition as { gte?: Date; in?: unknown[]; lte?: Date };
      if (ops.in && !ops.in.includes(value)) return false;
      if (ops.gte && !(value instanceof Date && value >= ops.gte)) return false;
      if (ops.lte && !(value instanceof Date && value <= ops.lte)) return false;
      return true;
    }
    return value === condition;
  });
}

interface World {
  analytics: Row[];
  brands: Row[];
  campaigns: Row[];
  memories: Row[];
  passages: Row[];
  posts: Row[];
}

function createHandler(world: Partial<World> = {}) {
  const data: World = {
    analytics: [],
    brands: [
      { id: 'brand-1', isDeleted: false, label: 'Acme', organizationId: ORG },
    ],
    campaigns: [],
    memories: [],
    passages: [],
    posts: [],
    ...world,
  };
  const prisma = {
    brand: {
      findFirst: async ({ where }: Query) =>
        data.brands.find((row) => matches(row, where)) ?? null,
    },
    campaign: {
      findFirst: async ({ where }: Query) =>
        data.campaigns.find((row) => matches(row, where)) ?? null,
    },
    post: {
      findMany: async ({ orderBy = [], take, where }: Query) => {
        const found = data.posts
          .filter((row) => matches(row, where))
          .sort((a, b) => {
            for (const order of orderBy) {
              const [[field, direction]] = Object.entries(order);
              const left = (a[field] as Date | string | null) ?? '';
              const right = (b[field] as Date | string | null) ?? '';
              if (left < right) return direction === 'desc' ? 1 : -1;
              if (left > right) return direction === 'desc' ? -1 : 1;
            }
            return 0;
          });
        return found.slice(0, take ?? found.length);
      },
    },
    postAnalytics: {
      groupBy: async ({ take, where }: Query) => {
        const sums = new Map<string, Record<string, number>>();
        for (const row of data.analytics.filter((entry) =>
          matches(entry, where),
        )) {
          const postId = String(row.postId);
          const sum = sums.get(postId) ?? {
            totalCommentsIncrement: 0,
            totalLikesIncrement: 0,
            totalSharesIncrement: 0,
            totalViewsIncrement: 0,
          };
          for (const key of Object.keys(sum)) {
            sum[key] += Number(row[key] ?? 0);
          }
          sums.set(postId, sum);
        }
        return [...sums.entries()]
          .map(([postId, sum]) => ({ _sum: sum, postId }))
          .sort(
            (a, b) => b._sum.totalViewsIncrement - a._sum.totalViewsIncrement,
          )
          .slice(0, take);
      },
    },
  };
  // The retrieval itself is covered by the Knowledge specs; this stands in for
  // it with a brand-scoped table and echoes the query it was asked.
  const knowledge = {
    getContextCoverage: async (): Promise<AgentToolResult> => ({
      creditsUsed: 0,
      data: { families: [], isIncomplete: false, usage: 'context' },
      success: true,
    }),
    searchKnowledge: async (
      params: Record<string, unknown>,
    ): Promise<AgentToolResult> => ({
      creditsUsed: 0,
      data: {
        passages: data.passages
          .filter((passage) => passage.brandId === params.brandId)
          .map((passage) => ({
            citation: passage.citation,
            content: `${String(passage.content)} [query: ${String(params.query)}]`,
          })),
      },
      success: true,
    }),
  };
  const memories = {
    getMemoriesForPrompt: async () => data.memories,
  };
  return new AgentPrepBriefToolHandler(
    knowledge as unknown as AgentKnowledgeToolHandler,
    memories as unknown as AgentMemoriesService,
    prisma as unknown as PrismaService,
  );
}

function post(id: string, overrides: Row = {}): Row {
  return {
    brandId: 'brand-1',
    campaignId: null,
    description: `Post ${id}`,
    id,
    isDeleted: false,
    organizationId: ORG,
    parentId: null,
    platform: 'twitter',
    publishedAt: daysAgo(3),
    targetExecutionState: TargetExecutionState.PUBLISHED,
    ...overrides,
  };
}

function snapshot(postId: string, views: number, overrides: Row = {}): Row {
  return {
    brandId: 'brand-1',
    date: daysAgo(2),
    isDeleted: false,
    organizationId: ORG,
    postId,
    totalCommentsIncrement: 1,
    totalLikesIncrement: 2,
    totalSharesIncrement: 3,
    totalViewsIncrement: views,
    ...overrides,
  };
}

const context: ToolExecutionContext = { organizationId: ORG, userId: 'user-1' };

function briefOf(result: AgentToolResult): AgentPrepBrief {
  expect(result.success).toBe(true);
  return result.data as AgentPrepBrief;
}

const citation = {
  sourceId: 'src-1',
  title: 'Launch plan',
  version: 2,
  versionId: 'ver-2',
};

describe('AgentPrepBriefToolHandler.buildPrepBrief', () => {
  it('assembles a cited brief from the brand records', async () => {
    const handler = createHandler({
      analytics: [snapshot('p1', 100), snapshot('p2', 40)],
      memories: [
        {
          brandId: 'brand-1',
          content: 'Keep it plain.',
          currentRevisionId: 'rev-1',
          id: 'mem-1',
          kind: 'instruction',
        },
      ],
      passages: [
        { brandId: 'brand-1', citation, content: 'Launch is Thursday.' },
      ],
      posts: [post('p1'), post('p2', { publishedAt: daysAgo(5) })],
    });
    const brief = briefOf(
      await handler.buildPrepBrief({}, { ...context, brandId: 'brand-1' }),
    );

    expect(brief.facts.map((fact) => fact.citation.kind)).toEqual([
      'knowledge',
      'memory',
      'post',
      'post',
      'analytics',
    ]);
    expect(brief.facts.at(-1)).toMatchObject({
      citation: { kind: 'analytics', postIds: ['p1', 'p2'] },
      text: expect.stringContaining(
        '2 posts drew 140 views, 4 likes, 2 comments and 6 shares',
      ),
    });
    expect(brief.missingEvidence).toEqual([]);
    expect(brief.brandId).toBe('brand-1');
  });

  it('briefs on the topic, then the campaign name, then the brand name', async () => {
    const world = {
      campaigns: [
        {
          brandId: 'brand-1',
          id: 'camp-1',
          isDeleted: false,
          name: 'Fall launch',
          organizationId: ORG,
        },
      ],
      passages: [{ brandId: 'brand-1', citation, content: 'Plan.' }],
    };
    const text = async (params: Record<string, unknown>) =>
      briefOf(
        await createHandler(world).buildPrepBrief(params, {
          ...context,
          brandId: 'brand-1',
        }),
      ).facts[0].text;

    expect(await text({ topic: 'pricing page' })).toContain(
      '[query: pricing page]',
    );
    expect(await text({ campaignId: 'camp-1' })).toContain(
      '[query: Fall launch]',
    );
    expect(await text({})).toContain('[query: Acme]');
  });

  it('keeps other organizations, brands, drafts, replies and old posts out', async () => {
    const handler = createHandler({
      posts: [
        post('mine'),
        post('foreign-org', { organizationId: 'org-2' }),
        post('other-brand', { brandId: 'brand-2' }),
        post('deleted', { isDeleted: true }),
        post('reply', { parentId: 'mine' }),
        post('draft', { targetExecutionState: TargetExecutionState.DRAFT }),
        post('old', { publishedAt: daysAgo(45) }),
      ],
    });
    const brief = briefOf(
      await handler.buildPrepBrief({}, { ...context, brandId: 'brand-1' }),
    );
    expect(
      brief.facts
        .filter((fact) => fact.citation.kind === 'post')
        .map((fact) =>
          fact.citation.kind === 'post' ? fact.citation.postId : '',
        ),
    ).toEqual(['mine']);
  });

  it("adds up only this brand's activity inside the window", async () => {
    const handler = createHandler({
      analytics: [
        snapshot('p1', 10),
        snapshot('p1', 5, { date: daysAgo(1) }),
        snapshot('p1', 999, { date: daysAgo(60) }),
        snapshot('p9', 999, { organizationId: 'org-2' }),
        snapshot('p8', 999, { brandId: 'brand-2' }),
        snapshot('p7', 999, { isDeleted: true }),
      ],
    });
    const brief = briefOf(
      await handler.buildPrepBrief({}, { ...context, brandId: 'brand-1' }),
    );
    const performance = brief.facts.find(
      (fact) => fact.section === 'performance',
    );
    expect(performance?.text).toContain('1 post drew 15 views');
    expect(performance?.citation).toMatchObject({ postIds: ['p1'] });
  });

  it('narrows posts and performance to one campaign of the brand', async () => {
    const handler = createHandler({
      analytics: [snapshot('in-campaign', 7), snapshot('elsewhere', 500)],
      campaigns: [
        {
          brandId: 'brand-1',
          id: 'camp-1',
          isDeleted: false,
          name: 'Fall',
          organizationId: ORG,
        },
      ],
      posts: [post('in-campaign', { campaignId: 'camp-1' }), post('elsewhere')],
    });
    const brief = briefOf(
      await handler.buildPrepBrief(
        { campaignId: 'camp-1' },
        { ...context, brandId: 'brand-1' },
      ),
    );
    expect(brief.subject).toEqual({
      campaignId: 'camp-1',
      campaignName: 'Fall',
    });
    expect(
      brief.facts.filter((fact) => fact.section === 'recent_posts'),
    ).toHaveLength(1);
    expect(
      brief.facts.find((fact) => fact.section === 'performance')?.text,
    ).toContain('1 post drew 7 views');
  });

  it('reports a campaign with no posts as missing performance', async () => {
    const handler = createHandler({
      analytics: [snapshot('elsewhere', 500)],
      campaigns: [
        {
          brandId: 'brand-1',
          id: 'camp-1',
          isDeleted: false,
          name: 'Fall',
          organizationId: ORG,
        },
      ],
    });
    const brief = briefOf(
      await handler.buildPrepBrief(
        { campaignId: 'camp-1' },
        { ...context, brandId: 'brand-1' },
      ),
    );
    expect(brief.facts.some((fact) => fact.section === 'performance')).toBe(
      false,
    );
    expect(brief.missingEvidence.map((entry) => entry.section)).toContain(
      'performance',
    );
  });

  it('refuses a campaign of another brand or organization', async () => {
    const handler = createHandler({
      campaigns: [
        {
          brandId: 'brand-2',
          id: 'camp-2',
          isDeleted: false,
          name: 'Other',
          organizationId: ORG,
        },
        {
          brandId: 'brand-1',
          id: 'camp-3',
          isDeleted: false,
          name: 'Foreign',
          organizationId: 'org-2',
        },
      ],
    });
    for (const campaignId of ['camp-2', 'camp-3', 'missing']) {
      expect(
        await handler.buildPrepBrief(
          { campaignId },
          { ...context, brandId: 'brand-1' },
        ),
      ).toMatchObject({
        error: 'Campaign was not found for this brand',
        success: false,
      });
    }
  });

  it('drops a memory that belongs to another brand', async () => {
    const handler = createHandler({
      memories: [
        { brandId: 'brand-1', content: 'Mine.', id: 'mem-1' },
        { brandId: 'brand-2', content: 'Not mine.', id: 'mem-2' },
        { brandId: null, content: 'Organization wide.', id: 'mem-3' },
      ],
    });
    const brief = briefOf(
      await handler.buildPrepBrief({}, { ...context, brandId: 'brand-1' }),
    );
    expect(
      brief.facts
        .filter((fact) => fact.section === 'memory')
        .map((fact) => fact.text),
    ).toEqual(['Mine.', 'Organization wide.']);
  });

  it('only reads Knowledge of the brand it briefs on', async () => {
    const handler = createHandler({
      passages: [
        {
          brandId: 'brand-2',
          citation: { ...citation, sourceId: 'secret' },
          content: 'Other brand.',
        },
      ],
    });
    const brief = briefOf(
      await handler.buildPrepBrief({}, { ...context, brandId: 'brand-1' }),
    );
    expect(brief.facts.some((fact) => fact.section === 'knowledge')).toBe(
      false,
    );
    expect(brief.missingEvidence.map((entry) => entry.section)).toContain(
      'knowledge',
    );
  });

  it('refuses a brand other than the conversation brand', async () => {
    expect(
      await createHandler().buildPrepBrief(
        { brandId: 'brand-2' },
        { ...context, brandId: 'brand-1' },
      ),
    ).toMatchObject({
      error: 'brandId does not match this conversation',
      success: false,
    });
  });

  it('needs a brand, and the brand must belong to the organization', async () => {
    const handler = createHandler();
    expect(await handler.buildPrepBrief({}, context)).toMatchObject({
      error: expect.stringContaining('Select a brand'),
      success: false,
    });
    expect(
      await handler.buildPrepBrief({ brandId: 'brand-9' }, context),
    ).toMatchObject({
      error: 'Brand was not found in this organization',
      success: false,
    });
    expect(
      await createHandler({
        brands: [
          {
            id: 'brand-1',
            isDeleted: false,
            label: 'Acme',
            organizationId: 'org-2',
          },
        ],
      }).buildPrepBrief({ brandId: 'brand-1' }, context),
    ).toMatchObject({
      error: 'Brand was not found in this organization',
      success: false,
    });
  });

  it('accepts an explicit brand when the conversation has none', async () => {
    const brief = briefOf(
      await createHandler().buildPrepBrief({ brandId: 'brand-1' }, context),
    );
    expect(brief.brandId).toBe('brand-1');
  });

  it.each([
    [{ windowDays: 0 }, 'windowDays must be an integer from 1 to 90'],
    [{ windowDays: 91 }, 'windowDays must be an integer from 1 to 90'],
    [{ windowDays: 1.5 }, 'windowDays must be an integer from 1 to 90'],
    [{ windowDays: '7' }, 'windowDays must be an integer from 1 to 90'],
    [{ topic: 'x'.repeat(201) }, 'topic must be at most 200 characters'],
  ])('rejects %j', async (params, error) => {
    expect(
      await createHandler().buildPrepBrief(params, {
        ...context,
        brandId: 'brand-1',
      }),
    ).toEqual({ creditsUsed: 0, error, success: false });
  });
});
