vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { WatchlistsService } from '@api/collections/watchlists/services/watchlists.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { expectCloudGuardPasses } from '@api/shared/testing/cloud-guard-assertions';
import type { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';

type MockDelegate = {
  create: ReturnType<typeof vi.fn>;
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};

describe('WatchlistsService persistence boundary', () => {
  let delegate: MockDelegate;
  let service: WatchlistsService;

  beforeEach(() => {
    delegate = {
      create: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          ...data,
          createdAt: new Date(),
          id: 'watchlist-1',
          isDeleted: false,
          updatedAt: new Date(),
        }),
      ),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn(),
      update: vi.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          ...data,
          createdAt: new Date(),
          id: 'watchlist-1',
          isDeleted: false,
          updatedAt: new Date(),
        }),
      ),
    };

    service = new WatchlistsService(
      { watchlist: delegate } as unknown as PrismaService,
      {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as LoggerService,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('writes ownership and lookup fields as scalars and domain fields as config', async () => {
    await service.create(
      {
        brandId: 'brand-1',
        category: 'Competitor',
        handle: 'creator',
        label: 'Creator',
        organizationId: 'org-1',
        platform: 'instagram' as never,
        userId: 'user-1',
      },
      [],
    );

    expect(delegate.create).toHaveBeenCalledWith({
      data: {
        brandId: 'brand-1',
        config: { category: 'Competitor', label: 'Creator' },
        handle: 'creator',
        organizationId: 'org-1',
        platform: 'instagram',
        userId: 'user-1',
      },
    });
  });

  it('merges config-backed patches without dropping stored values', async () => {
    delegate.findFirst.mockResolvedValue({
      config: { category: 'Competitor', label: 'Old label' },
      id: 'watchlist-1',
    });

    await service.patch('watchlist-1', { label: 'New label' }, []);

    expect(delegate.update).toHaveBeenCalledWith({
      data: {
        config: { category: 'Competitor', label: 'New label' },
      },
      where: { id: 'watchlist-1' },
    });
  });
  it('scopes handle lookups, brand lists and the patch pre-read in CLOUD mode', async () => {
    delegate.findFirst.mockResolvedValue({
      config: {},
      id: 'watchlist-1',
    });

    await runWithTenantContext({ organizationId: 'org-1' }, async () => {
      await service.findByHandle(
        'brand-1',
        'instagram' as never,
        '@creator',
        'org-1',
      );
      await service.findAllByAccount('brand-1', 'org-1');
      await service.updateMetrics('watchlist-1', 'org-1', { followers: 10 });
      await service.patch('watchlist-1', { label: 'New label' }, []);
    });

    expect(delegate.findFirst).toHaveBeenCalledWith({
      where: {
        brandId: 'brand-1',
        handle: 'creator',
        isDeleted: false,
        organizationId: 'org-1',
        platform: 'instagram',
      },
    });
    expectCloudGuardPasses('Watchlist', 'findFirst', delegate.findFirst);
    expectCloudGuardPasses('Watchlist', 'findMany', delegate.findMany);
    // updateMetrics write; the base `patch` write is covered by the base service
    expect(delegate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'watchlist-1', isDeleted: false, organizationId: 'org-1' },
      }),
    );
  });
});
