import { AccountAnalyticsService } from '@api/endpoints/analytics/account-analytics.service';
import { AnalyticsMetric } from '@genfeedai/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
});
