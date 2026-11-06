vi.mock('@genfeedai/prisma', async () => {
  const { canonicalPrismaMock } = await import(
    '@api/shared/testing/prisma-mock'
  );
  return canonicalPrismaMock();
});

import { WatchlistsService } from '@api/collections/watchlists/services/watchlists.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { assertTenantScopedQuery } from '@libs/prisma/tenant-guard';

type Row = Record<string, unknown> & {
  config: Record<string, unknown>;
  createdAt: Date;
  id: string;
};
type Where = Record<string, unknown>;
type Platform = Parameters<WatchlistsService['findByHandle']>[1];
type CreateInput = Parameters<WatchlistsService['create']>[0];

describe('WatchlistsService persistence boundary', () => {
  let rows: Row[];
  let service: WatchlistsService;

  // Every query passes the real CLOUD tenant guard, as in production.
  const guard = (operation: string, args: unknown) =>
    assertTenantScopedQuery({
      args,
      isCloud: true,
      model: 'Watchlist',
      operation,
      tenantModelNames: new Set(['Watchlist']),
    });
  const matching = (where: Where = {}) =>
    rows.filter((row) =>
      Object.entries(where).every(([key, value]) => row[key] === value),
    );

  beforeEach(() => {
    rows = [];
    service = new WatchlistsService(
      {
        watchlist: {
          count: async (args: { where: Where }) => {
            guard('count', args);
            return matching(args.where).length;
          },
          create: async (args: { data: Record<string, unknown> }) => {
            guard('create', args);
            const row = {
              ...args.data,
              createdAt: new Date(),
              id: `watchlist-${rows.length + 1}`,
              isDeleted: false,
              updatedAt: new Date(),
            } as unknown as Row;
            rows.push(row);
            return row;
          },
          findFirst: async (args: { where: Where }) => {
            guard('findFirst', args);
            return matching(args.where)[0] ?? null;
          },
          findMany: async (args: {
            skip: number;
            take: number;
            where: Where;
          }) => {
            guard('findMany', args);
            return matching(args.where)
              .sort(
                (a, b) =>
                  b.createdAt.getTime() - a.createdAt.getTime() ||
                  b.id.localeCompare(a.id),
              )
              .slice(args.skip, args.skip + args.take);
          },
          update: async (args: {
            data: Record<string, unknown>;
            where: Where;
          }) => {
            guard('update', args);
            const row = matching(args.where)[0];
            if (!row) throw new Error('Record to update not found');
            Object.assign(row, args.data);
            return row;
          },
        },
      } as unknown as PrismaService,
      {
        debug: () => {},
        error: () => {},
        log: () => {},
        warn: () => {},
      } as unknown as LoggerService,
    );
  });

  const seed = (id: string, overrides: Partial<Row> = {}) => {
    rows.push({
      brandId: 'brand-1',
      config: {},
      createdAt: new Date('2026-11-01T00:00:00.000Z'),
      handle: 'creator',
      id,
      isDeleted: false,
      organizationId: 'org-1',
      platform: 'instagram',
      ...overrides,
    });
  };

  it('writes ownership and lookup fields as scalars and domain fields as config', async () => {
    await service.create(
      {
        brandId: 'brand-1',
        category: 'Competitor',
        handle: 'creator',
        label: 'Creator',
        organizationId: 'org-1',
        platform: 'instagram',
        userId: 'user-1',
      } as unknown as CreateInput,
      [],
    );

    expect(rows[0]).toMatchObject({
      brandId: 'brand-1',
      config: { category: 'Competitor', label: 'Creator' },
      handle: 'creator',
      organizationId: 'org-1',
      platform: 'instagram',
      userId: 'user-1',
    });
    expect(rows[0]).not.toHaveProperty('label');
  });

  it('merges config-backed patches without dropping stored values', async () => {
    seed('watchlist-1', {
      config: { category: 'Competitor', label: 'Old label' },
    });

    await service.patch('watchlist-1', { label: 'New label' }, []);

    expect(rows[0]?.config).toEqual({
      category: 'Competitor',
      label: 'New label',
    });
  });

  it('finds a handle without its @ inside the brand, platform and tenant', async () => {
    seed('other-org', { organizationId: 'org-2' });
    seed('other-brand', { brandId: 'brand-2' });
    seed('deleted', { isDeleted: true });
    seed('watchlist-1');

    const found = await runWithTenantContext({ organizationId: 'org-1' }, () =>
      service.findByHandle(
        'brand-1',
        'instagram' as unknown as Platform,
        '@creator',
        'org-1',
      ),
    );

    expect(found?.id).toBe('watchlist-1');
  });

  it('records metrics on the watchlist of the request tenant', async () => {
    seed('watchlist-1');

    await runWithTenantContext({ organizationId: 'org-1' }, () =>
      service.updateMetrics('watchlist-1', 'org-1', { followers: 10 }),
    );

    expect(JSON.stringify(rows[0])).toContain('"followers":10');
  });

  it('pages a brand watchlist newest first with a matching count', async () => {
    seed('watchlist-1', { createdAt: new Date('2026-11-01T00:00:00.000Z') });
    seed('watchlist-2', { createdAt: new Date('2026-11-02T00:00:00.000Z') });
    seed('watchlist-3', { createdAt: new Date('2026-11-03T00:00:00.000Z') });
    seed('other-brand', { brandId: 'brand-2' });

    const result = await runWithTenantContext({ organizationId: 'org-1' }, () =>
      service.findAllByAccount('brand-1', 'org-1', { limit: 2, page: 2 }),
    );

    expect(result).toMatchObject({
      hasNextPage: false,
      hasPrevPage: true,
      limit: 2,
      page: 2,
      totalDocs: 3,
      totalPages: 2,
    });
    expect(result.docs.map((doc) => doc.id)).toEqual(['watchlist-1']);
  });
});
