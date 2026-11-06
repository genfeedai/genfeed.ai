import type {
  RunSystemWorkflowInput,
  SystemWorkflowActionExecutor,
  SystemWorkflowRunnerService,
} from '@api/collections/workflows/system-workflow-runner.service';
import { SocialTimelineService } from '@api/services/social-timeline/social-timeline.service';
import type { SocialTimelineProviderService } from '@api/services/social-timeline/social-timeline-provider.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { beforeEach, describe, expect, it } from 'vitest';

type Row = Record<string, unknown>;
type Where = Record<string, unknown>;

const scope = { organizationId: 'org-a', brandId: 'brand-a', userId: 'user-a' };
const input = {
  action: 'reply' as const,
  credentialId: 'credential-a',
  idempotencyKey: 'request-a',
  text: 'An actual reply',
};

/** Prisma `where` over scalars, OR, `not`, `lt`, `in` and `notIn`. */
function matches(row: Row, where: Where): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (condition === undefined) return true;
    if (key === 'OR') {
      return (condition as Where[]).some((part) => matches(row, part));
    }
    const value = row[key];
    if (condition === null || typeof condition !== 'object') {
      return value === condition;
    }
    const filter = condition as Row;
    if ('not' in filter) return value !== filter.not;
    if ('lt' in filter) {
      return value !== null && Number(value) < Number(filter.lt);
    }
    if ('in' in filter) return (filter.in as unknown[]).includes(value);
    if ('notIn' in filter) return !(filter.notIn as unknown[]).includes(value);
    throw new Error(`Unsupported filter on ${key}`);
  });
}

function credentialRow(overrides: Row = {}): Row {
  return {
    brandId: 'brand-a',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    externalAvatar: null,
    externalHandle: 'brand_a',
    externalName: 'Brand A on X',
    grantedScopes: [],
    grantedScopesCapturedAt: null,
    id: 'credential-a',
    isConnected: true,
    isDeleted: false,
    label: null,
    organizationId: 'org-a',
    platform: 'TWITTER',
    ...overrides,
  };
}

function sourceRow(overrides: Row = {}): Row {
  return {
    brandId: 'brand-a',
    credentialId: 'credential-a',
    id: 'source-a',
    isActive: true,
    isDeleted: false,
    lastSyncError: null,
    lastSyncStatus: 'ready',
    lastSyncedAt: new Date('2026-01-02T00:00:00Z'),
    organizationId: 'org-a',
    sourceType: 'timeline',
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

function postRow(overrides: Row = {}): Row {
  const at = new Date('2026-01-02T00:00:00Z');
  return {
    brandId: 'brand-a',
    collectedAt: at,
    createdAt: at,
    externalId: 'tweet-a',
    id: 'post-a',
    isDeleted: false,
    metrics: {},
    organizationId: 'org-a',
    platform: 'twitter',
    publishedAt: at,
    raw: {},
    sourceId: 'source-a',
    updatedAt: at,
    ...overrides,
  };
}

interface Tables {
  actions: Row[];
  credentials: Row[];
  posts: Row[];
  sources: Row[];
}

/**
 * Credentials, timeline sources, source posts and native-action receipts
 * behind a Prisma-shaped client. The receipt table enforces its
 * (organization, brand, idempotency key) unique index with P2002.
 */
function createPrisma(
  tables: Tables,
  hooks: { beforeReceiptInsert?: (data: Row) => void },
) {
  let sequence = 0;
  const nextId = (prefix: string) => {
    sequence += 1;
    return `${prefix}-${sequence}`;
  };
  const find = (rows: Row[]) => async (args: { where: Where }) =>
    rows.find((row) => matches(row, args.where)) ?? null;
  const updateMany =
    (rows: Row[]) =>
    async ({ data, where }: { data: Row; where: Where }) => {
      const hit = rows.filter((row) => matches(row, where));
      for (const row of hit) Object.assign(row, data);
      return { count: hit.length };
    };

  const prisma = {
    credential: {
      findFirst: find(tables.credentials),
      findMany: async ({ where }: { where: Where }) =>
        tables.credentials.filter((row) => matches(row, where)),
    },
    socialSource: {
      create: async ({ data }: { data: Row }) => {
        const row = sourceRow({
          id: nextId('source'),
          lastSyncStatus: null,
          lastSyncedAt: null,
          ...data,
        });
        tables.sources.push(row);
        return row;
      },
      findFirst: find(tables.sources),
      findMany: async ({
        include,
        where,
      }: {
        include: { posts: { take: number; where: Where } };
        where: Where;
      }) =>
        tables.sources
          .filter((row) => matches(row, where))
          .map((source) => ({
            ...source,
            posts: tables.posts
              .filter(
                (post) =>
                  post.sourceId === source.id &&
                  matches(post, include.posts.where),
              )
              .sort((a, b) => Number(b.publishedAt) - Number(a.publishedAt))
              .slice(0, include.posts.take),
          })),
      updateMany: updateMany(tables.sources),
    },
    sourcePost: {
      findFirst: find(tables.posts),
      updateMany: updateMany(tables.posts),
      upsert: async ({
        create,
        update,
        where,
      }: {
        create: Row;
        update: Row;
        where: {
          sourceId_externalId: { externalId: string; sourceId: string };
        };
      }) => {
        const key = where.sourceId_externalId;
        const existing = tables.posts.find(
          (row) =>
            row.sourceId === key.sourceId && row.externalId === key.externalId,
        );
        if (existing) return Object.assign(existing, update);
        const row = {
          createdAt: new Date(),
          id: nextId('post'),
          isDeleted: false,
          updatedAt: new Date(),
          ...create,
        };
        tables.posts.push(row);
        return row;
      },
    },
    sourcePostNativeAction: {
      create: async ({ data }: { data: Row }) => {
        hooks.beforeReceiptInsert?.(data);
        const taken = tables.actions.some(
          (row) =>
            row.organizationId === data.organizationId &&
            row.brandId === data.brandId &&
            row.idempotencyKey === data.idempotencyKey,
        );
        if (taken) throw { code: 'P2002' };
        const row: Row = {
          externalId: null,
          id: nextId('receipt'),
          isDeleted: false,
          message: null,
          status: 'pending',
          ...data,
        };
        tables.actions.push(row);
        return { ...row };
      },
      findFirst: find(tables.actions),
      updateMany: updateMany(tables.actions),
    },
    $transaction: async <T>(work: (tx: unknown) => Promise<T>) => work(prisma),
  };
  return prisma;
}

describe('connected timeline isolation and action delivery', () => {
  let tables: Tables;
  let hooks: { beforeReceiptInsert?: (data: Row) => void };
  let collected: { credentialId: string; platform: string }[];
  let collectedPosts: Row[];
  let published: Row[];
  let publishOutcome: () => Promise<string>;
  let workflowRuns: RunSystemWorkflowInput[];
  let executionContext: { organizationId: string; userId: string } | undefined;
  let service: SocialTimelineService;

  beforeEach(() => {
    tables = {
      actions: [],
      credentials: [
        credentialRow(),
        credentialRow({
          brandId: 'brand-b',
          id: 'credential-b',
          organizationId: 'org-b',
        }),
      ],
      posts: [
        postRow(),
        postRow({
          brandId: 'brand-b',
          externalId: 'tweet-b',
          id: 'post-b',
          organizationId: 'org-b',
          sourceId: 'source-b',
        }),
      ],
      sources: [sourceRow()],
    };
    hooks = {};
    collected = [];
    collectedPosts = [];
    published = [];
    publishOutcome = async () => 'published-reply-a';
    workflowRuns = [];
    executionContext = undefined;

    const provider = {
      collect: async (
        _scope: unknown,
        credentialId: string,
        platform: string,
      ) => {
        collected.push({ credentialId, platform });
        return collectedPosts;
      },
      execute: async (
        _scope: unknown,
        credentialId: string,
        platform: string,
        request: Row,
      ) => {
        published.push({
          credentialId,
          pendingReceipts: tables.actions
            .filter((row) => row.status === 'pending')
            .map((row) => row.idempotencyKey),
          platform,
          request,
        });
        return publishOutcome();
      },
    };
    let executor: SystemWorkflowActionExecutor | undefined;
    const workflows = {
      registerAction: (_id: string, action: SystemWorkflowActionExecutor) => {
        executor = action;
      },
      registerWorkflow: () => undefined,
      runWorkflow: async (request: RunSystemWorkflowInput) => {
        workflowRuns.push(request);
        if (!executor) throw new Error('native action is not registered');
        return {
          result: await executor({
            context: {
              organizationId:
                executionContext?.organizationId ?? request.organizationId,
              runId: 'run',
              userId: executionContext?.userId ?? request.userId ?? '',
              workflowId: 'workflow',
              workflowVersionId: 'version',
            },
            input: request.inputValues ?? {},
            provenance: {
              executionId: 'run',
              workflowId: 'workflow',
              workflowLabel: 'Following',
            },
          }),
        };
      },
    };
    service = new SocialTimelineService(
      createPrisma(tables, hooks) as unknown as PrismaService,
      provider as unknown as SocialTimelineProviderService,
      workflows as unknown as SystemWorkflowRunnerService,
    );
    service.onModuleInit();
  });

  it('never ingests on GET, and lists only the brand’s live feeds and posts', async () => {
    tables.credentials.push(
      credentialRow({ brandId: 'brand-c', id: 'other-brand' }),
      credentialRow({ id: 'deleted', isDeleted: true }),
    );
    tables.posts.push(
      postRow({ externalId: 'tweet-gone', id: 'gone', isDeleted: true }),
    );

    const { accounts } = await service.read(scope);

    expect(accounts).toEqual([
      expect.objectContaining({
        credentialId: 'credential-a',
        kind: 'home',
        sourceId: 'source-a',
        status: 'ready',
      }),
    ]);
    expect(accounts[0].posts.map((post) => post.externalId)).toEqual([
      'tweet-a',
    ]);
    expect(collected).toEqual([]);
  });

  it('does not substitute own-account uploads or watched profiles for home feeds', async () => {
    tables.credentials.splice(
      0,
      1,
      credentialRow({
        externalName: 'My Instagram',
        id: 'ig-a',
        platform: 'INSTAGRAM',
      }),
    );

    const result = await service.read(scope);

    expect(result.accounts).toEqual([
      expect.objectContaining({
        actions: [],
        credentialId: 'ig-a',
        kind: 'unsupported',
        posts: [],
        status: 'unsupported',
      }),
    ]);
    expect(collected).toEqual([]);
  });

  it('refreshes by replacing the saved snapshot with the collected feed', async () => {
    collectedPosts = [
      {
        externalId: 'tweet-new',
        platform: 'twitter',
        publishedAt: '2026-01-03T00:00:00Z',
      },
    ];

    const { accounts } = await service.refresh(scope);

    expect(collected).toEqual([
      { credentialId: 'credential-a', platform: 'twitter' },
    ]);
    expect(accounts[0]).toMatchObject({ status: 'ready' });
    expect(accounts[0].posts.map((post) => post.externalId)).toEqual([
      'tweet-new',
    ]);
    expect(tables.posts.find((row) => row.id === 'post-a')?.isDeleted).toBe(
      true,
    );
  });

  it('leaves a feed alone while another refresh holds it', async () => {
    tables.sources[0].lastSyncStatus = 'refreshing';
    tables.sources[0].updatedAt = new Date();

    const { accounts } = await service.refresh(scope);

    expect(collected).toEqual([]);
    expect(accounts[0]).toMatchObject({ status: 'refreshing' });
  });

  it('reserves before publishing, then saves the platform receipt', async () => {
    expect(await service.act(scope, 'post-a', input)).toMatchObject({
      externalId: 'published-reply-a',
      status: 'completed',
    });

    expect(workflowRuns).toEqual([
      expect.objectContaining({
        canonicalId: 'social.timeline.native-action',
        organizationId: 'org-a',
        userId: 'user-a',
      }),
    ]);
    expect(published).toEqual([
      {
        credentialId: 'credential-a',
        pendingReceipts: ['request-a'],
        platform: 'twitter',
        request: {
          action: 'reply',
          externalId: 'tweet-a',
          text: 'An actual reply',
        },
      },
    ]);
    expect(tables.actions).toEqual([
      expect.objectContaining({
        brandId: 'brand-a',
        externalId: 'published-reply-a',
        organizationId: 'org-a',
        postId: 'post-a',
        status: 'completed',
      }),
    ]);
  });

  it('rejects a workflow request whose actor or organization differs from its execution context', async () => {
    executionContext = {
      organizationId: 'another-org',
      userId: 'another-user',
    };

    await expect(service.act(scope, 'post-a', input)).rejects.toThrow(
      'scope does not match',
    );
    expect(tables.actions).toEqual([]);
    expect(published).toEqual([]);
  });

  it.each([401, 403, 429])(
    'persists a definite provider rejection %s as failed and replays its receipt without publication',
    async (status) => {
      publishOutcome = () => Promise.reject({ status });

      const first = await service.act(scope, 'post-a', input);

      expect(first.status).toBe('failed');
      expect(first.message).not.toContain('could not be confirmed');
      expect(tables.actions[0]).toMatchObject({ status: 'failed' });
      await expect(service.act(scope, 'post-a', input)).resolves.toMatchObject(
        first,
      );
      expect(published).toHaveLength(1);
    },
  );

  it('does not execute the same request twice after uncertain delivery', async () => {
    publishOutcome = () =>
      Promise.reject(new Error('socket closed after publication'));

    const first = await service.act(scope, 'post-a', input);
    const retried = await service.act(scope, 'post-a', input);

    expect(first.status).toBe('uncertain');
    expect(first.message).toContain('could not be confirmed');
    expect(retried).toMatchObject(first);
    expect(published).toHaveLength(1);
  });

  it('returns the receipt of a concurrent request that won the same key, without publishing', async () => {
    hooks.beforeReceiptInsert = (data) => {
      hooks.beforeReceiptInsert = undefined;
      tables.actions.push({
        ...data,
        externalId: 'winner-reply',
        id: 'winner',
        isDeleted: false,
        message: null,
        status: 'completed',
      });
    };

    await expect(service.act(scope, 'post-a', input)).resolves.toEqual({
      externalId: 'winner-reply',
      id: 'winner',
      message: null,
      status: 'completed',
    });
    expect(published).toEqual([]);
  });

  it('can confirm a saved action after a refresh removes the post, without republishing', async () => {
    await service.act(scope, 'post-a', input);
    tables.posts[0].isDeleted = true;

    await expect(service.act(scope, 'post-a', input)).resolves.toMatchObject({
      externalId: 'published-reply-a',
      status: 'completed',
    });
    expect(published).toHaveLength(1);
  });

  it('rejects reuse of an action key for changed text', async () => {
    await service.act(scope, 'post-a', input);

    await expect(
      service.act(scope, 'post-a', { ...input, text: 'Different reply' }),
    ).rejects.toThrow('another request');
    expect(published).toHaveLength(1);
  });

  it.each([
    ['post', 'post-b', input],
    ['credential', 'post-a', { ...input, credentialId: 'credential-b' }],
  ])(
    'never publishes when another tenant owns the %s',
    async (_owned, postId, request) => {
      await expect(service.act(scope, postId, request)).rejects.toThrow(
        'not found',
      );
      expect(tables.actions).toEqual([]);
      expect(published).toEqual([]);
    },
  );

  it('asks for a reconnect when the saved grant lacks the write scope', async () => {
    tables.credentials[0].grantedScopes = ['tweet.read', 'like.write'];
    tables.credentials[0].grantedScopesCapturedAt = new Date();

    await expect(service.act(scope, 'post-a', input)).rejects.toThrow(
      'Reconnect this account with permission',
    );
    expect(tables.actions).toEqual([]);
  });

  it('rejects empty text and unsupported native actions before reserving', async () => {
    await expect(
      service.act(scope, 'post-a', { ...input, text: '  ' }),
    ).rejects.toThrow('Enter the text');

    tables.posts[0].platform = 'instagram';
    await expect(service.act(scope, 'post-a', input)).rejects.toThrow(
      'does not support',
    );
    expect(tables.actions).toEqual([]);
    expect(published).toEqual([]);
  });
});
