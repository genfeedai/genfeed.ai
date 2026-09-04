import { AccountAnalyticsService } from '@api/endpoints/analytics/account-analytics.service';
import { AnalyticsMetric } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function sqlText(query: unknown): string {
  if (query && typeof query === 'object') {
    const record = query as {
      sql?: unknown;
      strings?: unknown;
      text?: unknown;
    };
    if (typeof record.sql === 'string') {
      return record.sql;
    }
    if (typeof record.text === 'string') {
      return record.text;
    }
    if (Array.isArray(record.strings)) {
      return record.strings.map(String).join(' ');
    }
  }
  return String(query);
}

function credential(index: number) {
  return {
    brand: { label: 'Brand' },
    brandId: 'brand-1',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    externalAvatar: null,
    externalHandle: `acct${index}`,
    externalId: `ext-${index}`,
    externalName: `Account ${index}`,
    id: `cred-${index}`,
    isConnected: true,
    label: `Account ${index}`,
    platform: 'INSTAGRAM',
  };
}

describe('AccountAnalyticsService', () => {
  const prisma = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    accountAnalyticsSnapshot: { findFirst: vi.fn() },
    brand: { findFirst: vi.fn().mockResolvedValue({ id: 'brand-1' }) },
    credential: { findMany: vi.fn().mockResolvedValue([]) },
    organizationSetting: {
      create: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    },
    post: {
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
    },
  };

  let service: AccountAnalyticsService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.$queryRaw.mockResolvedValue([]);
    prisma.post.groupBy.mockResolvedValue([]);
    service = new AccountAnalyticsService(prisma as never);
  });

  it('returns an empty fleet list for an organization with no credentials', async () => {
    const result = await service.listAccounts('org-1', {
      metric: AnalyticsMetric.VIEWS,
      page: 1,
      limit: 50,
    });

    expect(result.accounts).toEqual([]);
    expect(result.unattributedPostCount).toBe(0);
    expect(prisma.credential.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isConnected: true }),
      }),
    );
  });

  it('only includes disconnected accounts when explicitly requested', async () => {
    await service.listAccounts('org-1', { status: 'disconnected' });

    expect(prisma.credential.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isConnected: false }),
      }),
    );
  });

  it('always requires a connected account on drill-down', async () => {
    await service.getAccount('org-1', 'cred-1', { status: 'all' });

    expect(prisma.credential.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isConnected: true }),
      }),
    );
  });

  it('lists fifty accounts in one page', async () => {
    prisma.credential.findMany.mockResolvedValue(
      Array.from({ length: 50 }, (_, index) => credential(index)),
    );

    const result = await service.listAccounts('org-1', {
      limit: 50,
      page: 1,
    });

    expect(result.accounts).toHaveLength(50);
    expect(result.total).toBe(50);
    expect(result.accounts[0]?.identity.credentialId).toBe('cred-0');
  });

  it('returns period series and exact-credential top posts on drill-down', async () => {
    prisma.credential.findMany.mockResolvedValue([credential(1)]);
    prisma.$queryRaw.mockImplementation(async (query: unknown) => {
      const text = sqlText(query);
      if (text.includes('TO_CHAR')) {
        return [
          {
            comments: 1,
            day: '2026-09-01',
            likes: 4,
            saves: 0,
            shares: 0,
            views: 40,
          },
        ];
      }
      if (text.includes('LATERAL')) {
        return [
          {
            comments: 2,
            description: 'Exact credential post',
            engagement_rate: 5,
            likes: 8,
            platform: 'instagram',
            post_id: 'post-1',
            publish_date: new Date('2026-09-01T00:00:00.000Z'),
            shares: 1,
            title: 'Winner',
            url: 'https://example.com/p/1',
            views: 90,
          },
        ];
      }
      return [];
    });

    const result = await service.getAccount('org-1', 'cred-1', {});

    expect(result?.identity.credentialId).toBe('cred-1');
    expect(result?.series).toEqual([
      expect.objectContaining({
        date: '2026-09-01',
      }),
    ]);
    expect(result?.topPosts).toEqual([
      expect.objectContaining({
        postId: 'post-1',
        title: 'Winner',
        views: 90,
      }),
    ]);
  });

  it('ranks higher period views first by default', async () => {
    prisma.credential.findMany.mockResolvedValue([
      credential(1),
      credential(2),
    ]);
    prisma.$queryRaw.mockImplementation(async (query: unknown) => {
      const text = sqlText(query);
      if (text.includes('COUNT(DISTINCT')) {
        return [
          {
            comments: 0,
            credentialId: 'cred-1',
            likes: 0,
            posts: 1,
            prevComments: 0,
            prevLikes: 0,
            prevSaves: 0,
            prevShares: 0,
            prevViews: 0,
            saves: 0,
            shares: 0,
            views: 10,
          },
          {
            comments: 0,
            credentialId: 'cred-2',
            likes: 0,
            posts: 1,
            prevComments: 0,
            prevLikes: 0,
            prevSaves: 0,
            prevShares: 0,
            prevViews: 0,
            saves: 0,
            shares: 0,
            views: 100,
          },
        ];
      }
      return [];
    });

    const result = await service.listAccounts('org-1', {
      metric: AnalyticsMetric.VIEWS,
    });

    expect(
      result.accounts.map((account) => account.identity.credentialId),
    ).toEqual(['cred-2', 'cred-1']);
  });

  it('reports partial analytics coverage against all published posts', async () => {
    prisma.credential.findMany.mockResolvedValue([credential(1)]);
    prisma.post.groupBy.mockResolvedValue([
      {
        _count: { _all: 4 },
        _min: { publishedAt: new Date('2026-08-01T00:00:00.000Z') },
        credentialId: 'cred-1',
      },
    ]);
    prisma.$queryRaw.mockImplementation(async (query: unknown) => {
      if (!sqlText(query).includes('COUNT(DISTINCT')) {
        return [];
      }
      return [
        {
          comments: 0,
          credentialId: 'cred-1',
          likes: 0,
          posts: 1,
          prevComments: 0,
          prevLikes: 0,
          prevSaves: 0,
          prevShares: 0,
          prevViews: 0,
          saves: 0,
          shares: 0,
          views: 10,
        },
      ];
    });

    const result = await service.listAccounts('org-1', {});

    expect(result.accounts[0]).toMatchObject({
      coverage: 0.25,
      publishedPosts: 4,
    });
  });

  it('creates an organization setting when saving a fleet policy for the first time', async () => {
    await service.savePolicy('org-1', {
      healthyMin: 1000,
      isEnabled: true,
      metric: AnalyticsMetric.VIEWS,
      minPublishedPosts: 8,
      version: 1,
      watchMin: 400,
      windowWeeks: 4,
    });

    expect(prisma.organizationSetting.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: 'org-1',
        }),
      }),
    );
  });
});
