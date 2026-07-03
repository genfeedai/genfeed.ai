import { StripeService } from '@api/services/integrations/stripe/services/stripe.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CreditTransactionCategory } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import { BusinessAnalyticsService } from './business-analytics.service';

type CreditRow = {
  amount: number;
  createdAt: Date;
  isDeleted: boolean;
  organizationId: string;
  source: string;
};

type IngredientRow = {
  category: string;
  createdAt: Date;
  isDeleted: boolean;
  organizationId: string | null;
};

type QueryLike = {
  sql?: string;
  text?: string;
  values?: unknown[];
};

describe('BusinessAnalyticsService', () => {
  const now = new Date('2026-06-18T12:00:00.000Z');
  const organizations = [
    { id: 'org_a', label: 'Alpha Org' },
    { id: 'org_b', label: 'Beta Org' },
  ];
  const creditRows: CreditRow[] = [
    {
      amount: 100,
      createdAt: new Date('2026-06-18T09:00:00.000Z'),
      isDeleted: false,
      organizationId: 'org_a',
      source: CreditTransactionCategory.ADD,
    },
    {
      amount: 50,
      createdAt: new Date('2026-06-10T09:00:00.000Z'),
      isDeleted: false,
      organizationId: 'org_b',
      source: CreditTransactionCategory.ADD,
    },
    {
      amount: 30,
      createdAt: new Date('2026-06-16T09:00:00.000Z'),
      isDeleted: false,
      organizationId: 'org_a',
      source: CreditTransactionCategory.DEDUCT,
    },
    {
      amount: 10,
      createdAt: new Date('2026-06-10T10:00:00.000Z'),
      isDeleted: false,
      organizationId: 'org_b',
      source: CreditTransactionCategory.DEDUCT,
    },
    {
      amount: 999,
      createdAt: new Date('2026-06-18T10:00:00.000Z'),
      isDeleted: true,
      organizationId: 'org_a',
      source: CreditTransactionCategory.ADD,
    },
  ];
  const ingredientRows: IngredientRow[] = [
    {
      category: 'IMAGE',
      createdAt: new Date('2026-06-18T08:00:00.000Z'),
      isDeleted: false,
      organizationId: 'org_a',
    },
    {
      category: 'VIDEO',
      createdAt: new Date('2026-06-15T08:00:00.000Z'),
      isDeleted: false,
      organizationId: 'org_a',
    },
    {
      category: 'IMAGE',
      createdAt: new Date('2026-06-10T08:00:00.000Z'),
      isDeleted: false,
      organizationId: 'org_b',
    },
    {
      category: 'VOICE',
      createdAt: new Date('2026-06-18T08:00:00.000Z'),
      isDeleted: true,
      organizationId: 'org_b',
    },
  ];

  function dateMatches(
    createdAt: Date,
    filter?: { gte?: Date; lt?: Date; lte?: Date },
  ) {
    if (!filter) return true;
    if (filter.gte && createdAt < filter.gte) return false;
    if (filter.lt && createdAt >= filter.lt) return false;
    if (filter.lte && createdAt > filter.lte) return false;
    return true;
  }

  function filterCredits(where: {
    createdAt?: { gte?: Date; lt?: Date; lte?: Date };
    isDeleted?: boolean;
    source?: string;
  }) {
    return creditRows.filter(
      (row) =>
        (typeof where.isDeleted !== 'boolean' ||
          row.isDeleted === where.isDeleted) &&
        (!where.source || row.source === where.source) &&
        dateMatches(row.createdAt, where.createdAt),
    );
  }

  function filterIngredients(where: {
    createdAt?: { gte?: Date; lt?: Date; lte?: Date };
    isDeleted?: boolean;
    organizationId?: { not?: null };
  }) {
    return ingredientRows.filter(
      (row) =>
        (typeof where.isDeleted !== 'boolean' ||
          row.isDeleted === where.isDeleted) &&
        (!where.organizationId || row.organizationId !== null) &&
        dateMatches(row.createdAt, where.createdAt),
    );
  }

  function toDailyAmountRows(rows: CreditRow[]) {
    const byDay = new Map<string, number>();
    for (const row of rows) {
      const date = row.createdAt.toISOString().slice(0, 10);
      byDay.set(date, (byDay.get(date) ?? 0) + row.amount);
    }
    return Array.from(byDay.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, amount]) => ({ amount, date }));
  }

  function toDailyCountRows(rows: IngredientRow[]) {
    const byDay = new Map<string, number>();
    for (const row of rows) {
      const date = row.createdAt.toISOString().slice(0, 10);
      byDay.set(date, (byDay.get(date) ?? 0) + 1);
    }
    return Array.from(byDay.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([date, count]) => ({ count, date }));
  }

  const prisma = {
    $queryRaw: vi.fn((query: QueryLike) => {
      const sql = String(query.sql ?? query.text ?? '');
      const values = query.values ?? [];

      if (sql.includes('"credit_transactions"')) {
        const [source, from, to] = values as [string, Date, Date | undefined];
        const rows = filterCredits({
          createdAt: {
            gte: from,
            ...(sql.includes('"createdAt" <') ? { lt: to } : { lte: to }),
          },
          isDeleted: false,
          source,
        });

        if (sql.includes('date_trunc')) {
          return Promise.resolve(toDailyAmountRows(rows));
        }

        return Promise.resolve([
          { amount: rows.reduce((total, row) => total + row.amount, 0) },
        ]);
      }

      if (sql.includes('"ingredients"')) {
        const [from, to] = values as [Date, Date];
        return Promise.resolve(
          toDailyCountRows(
            filterIngredients({
              createdAt: { gte: from, lte: to },
              isDeleted: false,
            }),
          ),
        );
      }

      return Promise.resolve([]);
    }),
    creditTransaction: {
      aggregate: vi.fn(({ where }) => {
        const amount = filterCredits(where).reduce(
          (total, row) => total + row.amount,
          0,
        );
        return Promise.resolve({ _sum: { amount } });
      }),
      findMany: vi.fn(),
      groupBy: vi.fn(({ take, where }) => {
        const byOrg = new Map<string, number>();
        for (const row of filterCredits(where)) {
          byOrg.set(
            row.organizationId,
            (byOrg.get(row.organizationId) ?? 0) + row.amount,
          );
        }
        const rows = Array.from(byOrg.entries())
          .map(([organizationId, amount]) => ({
            _sum: { amount },
            organizationId,
          }))
          .sort(
            (left, right) =>
              Number(right._sum.amount) - Number(left._sum.amount),
          );
        return Promise.resolve(rows.slice(0, take));
      }),
    },
    ingredient: {
      count: vi.fn(({ where }) =>
        Promise.resolve(filterIngredients(where).length),
      ),
      findMany: vi.fn(),
      groupBy: vi.fn(({ by, take, where }) => {
        const rows = filterIngredients(where);
        const grouped = new Map<string, number>();
        const keyField = by.includes('category')
          ? 'category'
          : 'organizationId';
        for (const row of rows) {
          const key = row[keyField];
          if (!key) continue;
          grouped.set(key, (grouped.get(key) ?? 0) + 1);
        }
        const result = Array.from(grouped.entries())
          .map(([key, count]) =>
            keyField === 'category'
              ? { _count: { _all: count }, category: key }
              : { _count: { _all: count }, organizationId: key },
          )
          .sort(
            (left, right) =>
              Number(right._count._all) - Number(left._count._all),
          );
        return Promise.resolve(
          typeof take === 'number' ? result.slice(0, take) : result,
        );
      }),
    },
    organization: {
      findMany: vi.fn(({ where }) =>
        Promise.resolve(
          organizations.filter((org) => where.id.in.includes(org.id)),
        ),
      ),
    },
  };

  const loggerService = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  // Self-hosted flavor: StripeService exists but its client is null, so the
  // service must fall back to the credit-transaction revenue proxy.
  const stripeServiceWithoutClient = { stripe: null };

  const stripeChargesList = vi.fn();
  const stripeServiceWithClient = {
    stripe: { charges: { list: stripeChargesList } },
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('computes business analytics with database aggregations', async () => {
    const service = new BusinessAnalyticsService(
      prisma as unknown as PrismaService,
      loggerService as unknown as LoggerService,
      stripeServiceWithoutClient as unknown as StripeService,
    );

    const result = await service.getBusinessAnalytics();

    expect(result.revenue).toMatchObject({
      last7d: 100,
      last30d: 150,
      mtd: 150,
      today: 100,
      wowGrowth: 100,
    });
    expect(result.credits).toMatchObject({
      consumed: 40,
      sold: 150,
      wowGrowth: 200,
    });
    expect(result.ingredients).toMatchObject({
      categoryBreakdown: [
        { category: 'IMAGE', count: 2 },
        { category: 'VIDEO', count: 1 },
      ],
      last7d: 2,
      last30d: 3,
      today: 1,
      wowGrowth: 100,
    });
    expect(result.leaders).toMatchObject({
      byCredits: [
        { amount: 30, organizationId: 'org_a', organizationName: 'Alpha Org' },
        { amount: 10, organizationId: 'org_b', organizationName: 'Beta Org' },
      ],
      byIngredients: [
        { count: 2, organizationId: 'org_a', organizationName: 'Alpha Org' },
        { count: 1, organizationId: 'org_b', organizationName: 'Beta Org' },
      ],
      byRevenue: [
        { amount: 100, organizationId: 'org_a', organizationName: 'Alpha Org' },
        { amount: 50, organizationId: 'org_b', organizationName: 'Beta Org' },
      ],
    });
    expect(result.comparisons).toMatchObject({
      cashInVsUsageValue: { cashIn: 150, usageValue: 40 },
      outstandingPrepaid: 110,
      soldVsConsumed: { consumed: 40, sold: 150 },
    });

    expect(prisma.creditTransaction.groupBy).toHaveBeenCalled();
    expect(prisma.ingredient.groupBy).toHaveBeenCalled();
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.creditTransaction.findMany).not.toHaveBeenCalled();
    expect(prisma.ingredient.findMany).not.toHaveBeenCalled();
    expect(prisma.organization.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 2 }),
    );
  });

  it('prefers real Stripe charges for revenue when a client is configured', async () => {
    const toEpochSeconds = (iso: string) =>
      Math.floor(new Date(iso).getTime() / 1000);

    stripeChargesList.mockResolvedValue({
      data: [
        {
          amount: 10000,
          created: toEpochSeconds('2026-06-18T09:00:00.000Z'),
          id: 'ch_today',
          paid: true,
          refunded: false,
        },
        {
          amount: 5000,
          created: toEpochSeconds('2026-06-10T09:00:00.000Z'),
          id: 'ch_last_week',
          paid: true,
          refunded: false,
        },
        {
          amount: 99900,
          created: toEpochSeconds('2026-06-17T09:00:00.000Z'),
          id: 'ch_refunded',
          paid: true,
          refunded: true,
        },
        {
          amount: 88800,
          created: toEpochSeconds('2026-06-16T09:00:00.000Z'),
          id: 'ch_unpaid',
          paid: false,
          refunded: false,
        },
      ],
      has_more: false,
    });

    const service = new BusinessAnalyticsService(
      prisma as unknown as PrismaService,
      loggerService as unknown as LoggerService,
      stripeServiceWithClient as unknown as StripeService,
    );

    const result = await service.getBusinessAnalytics();

    expect(result.revenue).toMatchObject({
      last7d: 100,
      last30d: 150,
      mtd: 150,
      today: 100,
      wowGrowth: 100,
    });
    expect(result.revenue.dailySeries).toHaveLength(30);
    expect(result.revenue.dailySeries).toEqual(
      expect.arrayContaining([
        { amount: 100, date: '2026-06-18' },
        { amount: 50, date: '2026-06-10' },
        { amount: 0, date: '2026-06-17' },
      ]),
    );
    expect(stripeChargesList).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 100 }),
    );
    // Credits/ingredients blocks still come from the database
    expect(result.credits).toMatchObject({ consumed: 40, sold: 150 });
  });

  it('falls back to the credit-transaction proxy when Stripe fetch fails', async () => {
    stripeChargesList.mockRejectedValue(new Error('stripe down'));

    const service = new BusinessAnalyticsService(
      prisma as unknown as PrismaService,
      loggerService as unknown as LoggerService,
      stripeServiceWithClient as unknown as StripeService,
    );

    const result = await service.getBusinessAnalytics();

    expect(result.revenue).toMatchObject({
      last7d: 100,
      last30d: 150,
      mtd: 150,
      today: 100,
      wowGrowth: 100,
    });
    expect(loggerService.error).toHaveBeenCalledWith(
      expect.stringContaining('Stripe revenue aggregation failed'),
      expect.any(Error),
    );
  });
});
