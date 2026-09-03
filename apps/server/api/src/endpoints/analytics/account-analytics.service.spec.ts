import { AccountAnalyticsService } from '@api/endpoints/analytics/account-analytics.service';
import { AnalyticsMetric } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    expect(prisma.credential.findMany).toHaveBeenCalled();
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
      const text =
        query && typeof query === 'object' && 'strings' in query
          ? (query as { strings: string[] }).strings.join(' ')
          : String(query);
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
});
