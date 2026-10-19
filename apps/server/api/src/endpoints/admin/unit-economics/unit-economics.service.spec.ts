import { UnitEconomicsService } from '@api/endpoints/admin/unit-economics/unit-economics.service';
import {
  buildUnitEconomicsRow,
  EMPTY_UNIT_ECONOMICS_AGGREGATE,
  toUnitEconomicsMetrics,
} from '@api/endpoints/admin/unit-economics/unit-economics-report.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  ActivitySource,
  CreditTransactionCategory,
} from '@genfeedai/contracts';
import { REFERRAL_REWARD_REVERSAL_REFERENCE_TYPE } from '@genfeedai/contracts/constants';
import type { Prisma } from '@genfeedai/prisma';

describe('unit economics margin math', () => {
  it('derives provider cost, gross margin $ and % from raw ledger units', () => {
    expect(
      toUnitEconomicsMetrics({
        agentChatCredits: 12.345678,
        agentTurns: 7,
        generationCredits: 300,
        llmProviderCostMicros: 1_250_000,
        mediaProviderCostMicros: 2_750_000,
        revenueMinor: 2_000,
      }),
    ).toEqual({
      agentChatCredits: 12.345678,
      agentTurns: 7,
      generationCredits: 300,
      grossMarginPercent: 80,
      grossMarginUsd: 16,
      llmProviderCostUsd: 1.25,
      mediaProviderCostUsd: 2.75,
      revenueUsd: 20,
    });
  });

  it('reports a negative margin and no percentage for a free org with cost', () => {
    const metrics = toUnitEconomicsMetrics({
      ...EMPTY_UNIT_ECONOMICS_AGGREGATE,
      llmProviderCostMicros: 420_000,
    });

    expect(metrics.grossMarginUsd).toBe(-0.42);
    expect(metrics.grossMarginPercent).toBeNull();
  });

  it('totals re-derive the margin from summed money, not averaged percentages', () => {
    const small = {
      ...EMPTY_UNIT_ECONOMICS_AGGREGATE,
      llmProviderCostMicros: 1_000_000,
      revenueMinor: 100,
    };
    const large = {
      ...EMPTY_UNIT_ECONOMICS_AGGREGATE,
      llmProviderCostMicros: 10_000_000,
      revenueMinor: 100_000,
    };

    const totals = toUnitEconomicsMetrics({
      ...EMPTY_UNIT_ECONOMICS_AGGREGATE,
      llmProviderCostMicros:
        small.llmProviderCostMicros + large.llmProviderCostMicros,
      revenueMinor: small.revenueMinor + large.revenueMinor,
    });

    expect(
      buildUnitEconomicsRow({
        aggregate: small,
        id: 's',
        label: 'Small',
        topModels: [],
      }).grossMarginPercent,
    ).toBe(0);
    expect(totals.revenueUsd).toBe(1_001);
    expect(totals.grossMarginUsd).toBe(990);
    expect(totals.grossMarginPercent).toBe(98.9);
  });
});

describe('UnitEconomicsService', () => {
  const FROM = '2026-09-01';
  const TO = '2026-09-30';

  interface FakeRows {
    page?: unknown[];
    summary?: Record<string, unknown>;
    top?: unknown[];
  }

  function createService(rows: FakeRows = {}) {
    const queries: Prisma.Sql[] = [];
    const prisma = {
      $queryRaw: vi.fn(async (query: Prisma.Sql) => {
        queries.push(query);
        const sql = query.sql;
        if (sql.includes('"modelCosts"')) return rows.top ?? [];
        if (sql.includes('"labelled"')) return rows.page ?? [];
        if (sql.includes('"totalRows"')) {
          return [
            rows.summary ?? {
              agentChatCredits: 0,
              agentTurns: 0,
              generationCredits: 0,
              llmProviderCostMicros: 0,
              mediaProviderCostMicros: 0,
              revenueMinor: 0,
              totalRows: BigInt(0),
            },
          ];
        }
        return [];
      }),
      organization: {
        findFirst: vi.fn().mockResolvedValue({ label: 'Acme' }),
      },
    };
    const service = new UnitEconomicsService(
      prisma as unknown as PrismaService,
    );
    return { prisma, queries, service };
  }

  const pageQuery = (queries: Prisma.Sql[]) =>
    queries.find((query) => query.sql.includes('"labelled"'));
  const normalized = (query: Prisma.Sql | undefined) =>
    query?.sql.replace(/\s+/g, ' ') ?? '';

  it('bounds every platform-wide query by the period and soft delete', async () => {
    const { queries, service } = createService({
      page: [{ key: 'org-1', label: 'Acme' }],
    });

    await service.getReport({ from: FROM, to: TO });

    // page, summary, top models
    expect(queries).toHaveLength(3);
    for (const query of queries) {
      expect(query.sql).toContain('"isDeleted" = false');
      expect(query.values).toEqual(
        expect.arrayContaining([
          new Date('2026-09-01T00:00:00.000Z'),
          new Date('2026-09-30T23:59:59.999Z'),
        ]),
      );
      expect(query.sql).toContain('"organizationId"');
    }
  });

  it('cuts the page in the database and totals every organization', async () => {
    const { queries, service } = createService({
      page: [
        {
          agentChatCredits: 0,
          agentTurns: 1,
          generationCredits: 0,
          key: 'org-2',
          label: 'Globex',
          llmProviderCostMicros: 10_000,
          mediaProviderCostMicros: 0,
          revenueMinor: 0,
        },
      ],
      summary: {
        agentChatCredits: 0,
        agentTurns: 13,
        generationCredits: 0,
        llmProviderCostMicros: 2_010_000,
        mediaProviderCostMicros: 3_000_000,
        revenueMinor: 2_900,
        totalRows: BigInt(41),
      },
    });

    const report = await service.getReport({
      from: FROM,
      limit: 20,
      page: 3,
      to: TO,
    });

    const page = pageQuery(queries);
    expect(normalized(page)).toContain('LIMIT ? OFFSET ?');
    expect(page?.values.slice(-2)).toEqual([20, 40]);
    expect(report.pagination).toEqual({
      limit: 20,
      page: 3,
      pages: 3,
      total: 41,
    });
    expect(report.rows.map((row) => row.id)).toEqual(['org-2']);
    // Report-wide totals, not just the rows on this page.
    expect(report.totals).toEqual(
      expect.objectContaining({
        agentTurns: 13,
        grossMarginUsd: 23.99,
        llmProviderCostUsd: 2.01,
        mediaProviderCostUsd: 3,
        revenueUsd: 29,
      }),
    );
    const summary = queries.find((query) => query.sql.includes('"totalRows"'));
    expect(summary?.sql).not.toContain('LIMIT');
  });

  it('only looks up top models for the keys on the page', async () => {
    const { queries, service } = createService({
      page: [
        { key: 'org-1', label: 'Acme' },
        { key: 'org-2', label: 'Globex' },
      ],
      top: [
        {
          costMicros: BigInt(1_500_000),
          key: 'org-1',
          model: 'anthropic/claude-sonnet-5',
        },
      ],
    });

    const report = await service.getReport({ from: FROM, to: TO });

    const top = queries.find((query) => query.sql.includes('"modelCosts"'));
    expect(top?.values).toEqual(expect.arrayContaining(['org-1', 'org-2']));
    expect(report.rows[0]?.topModels).toEqual([
      { model: 'anthropic/claude-sonnet-5', providerCostUsd: 1.5 },
    ]);
    expect(report.rows[1]?.topModels).toEqual([]);
  });

  it('skips the top-model query for an empty page', async () => {
    const { queries, service } = createService();

    const report = await service.getReport({ from: FROM, page: 9, to: TO });

    expect(queries.some((query) => query.sql.includes('"modelCosts"'))).toBe(
      false,
    );
    expect(report.rows).toEqual([]);
    expect(report.pagination.total).toBe(0);
  });

  it('orders by the requested column in the database', async () => {
    const { queries, service } = createService();

    await service.getReport({
      from: FROM,
      sortDirection: 'asc',
      sortKey: 'grossMarginPercent',
      to: TO,
    });
    await service.getReport({
      from: FROM,
      sortDirection: 'desc',
      sortKey: 'revenueUsd',
      to: TO,
    });
    await service.getReport({ from: FROM, to: TO });

    const [byMargin, byRevenue, byDefault] = queries
      .filter((query) => query.sql.includes('"labelled"'))
      .map((query) => normalized(query));
    expect(byMargin).toContain(
      'ORDER BY "grossMarginPercent" ASC NULLS FIRST, LOWER("label") ASC, "key" ASC',
    );
    expect(byRevenue).toContain(
      'ORDER BY "revenueMinor" DESC NULLS LAST, LOWER("label") ASC, "key" ASC',
    );
    expect(byDefault).toContain(
      'ORDER BY ("llmProviderCostMicros" + "mediaProviderCostMicros") DESC, "revenueMinor" DESC',
    );
  });

  it('pins a drill-down to one organization and groups by the acting user', async () => {
    const { queries, service } = createService({
      page: [
        {
          agentChatCredits: 0,
          agentTurns: BigInt(3),
          generationCredits: 0,
          key: 'user-1',
          label: 'ada@example.com',
          llmProviderCostMicros: BigInt(500_000),
          mediaProviderCostMicros: 0,
          revenueMinor: 0,
        },
      ],
    });

    const report = await service.getReport({
      from: FROM,
      organizationId: 'org-1',
      to: TO,
    });

    for (const query of queries) {
      expect(query.values).toContain('org-1');
    }
    const text = queries.map((query) => query.sql).join('\n');
    expect(text).toContain('"actorUserId"');
    expect(normalized(pageQuery(queries))).toContain(
      'LEFT JOIN "users" u ON u."id" = c."key"',
    );
    expect(report.organizationLabel).toBe('Acme');
    expect(report.rows).toEqual([
      expect.objectContaining({
        agentTurns: 3,
        id: 'user-1',
        label: 'ada@example.com',
        llmProviderCostUsd: 0.5,
      }),
    ]);
  });

  it('labels organizations from the organizations table in the page query', async () => {
    const { queries, service } = createService();

    await service.getReport({ from: FROM, to: TO });

    expect(normalized(pageQuery(queries))).toContain(
      'LEFT JOIN "organizations" o ON o."id" = c."key"',
    );
  });

  it('counts credit usage net of refunds and without referral reward reversals', async () => {
    const { queries, service } = createService();

    await service.getReport({ from: FROM, to: TO });

    const creditSql = pageQuery(queries);
    const text = normalized(creditSql);
    expect(text).toContain(
      `CASE WHEN "category" = ? THEN -ABS("amount") ELSE ABS("amount") END`,
    );
    expect(text).toContain(
      `"category" IN (?, ?) AND "referenceType" IS DISTINCT FROM ?`,
    );
    expect(creditSql?.values).toEqual(
      expect.arrayContaining([
        CreditTransactionCategory.DEDUCT,
        CreditTransactionCategory.REFUND,
        REFERRAL_REWARD_REVERSAL_REFERENCE_TYPE,
        ActivitySource.AGENT_CHAT,
      ]),
    );
  });

  it('rejects a drill-down into an unknown organization', async () => {
    const { prisma, service } = createService();
    prisma.organization.findFirst.mockResolvedValue(null);

    await expect(
      service.getReport({ from: FROM, organizationId: 'missing', to: TO }),
    ).rejects.toThrow('not found');
  });

  it('derives margins and credits from the merged ledger columns', async () => {
    const { service } = createService({
      page: [
        {
          agentChatCredits: 42.123456,
          agentTurns: BigInt(12),
          generationCredits: 1_200,
          key: 'org-1',
          label: 'Acme',
          llmProviderCostMicros: BigInt(2_000_000),
          mediaProviderCostMicros: '3000000',
          revenueMinor: BigInt(2_900),
        },
        {
          agentChatCredits: 0,
          agentTurns: BigInt(1),
          generationCredits: 0,
          key: 'org-2',
          label: 'Globex',
          llmProviderCostMicros: BigInt(10_000),
          mediaProviderCostMicros: 0,
          revenueMinor: 0,
        },
      ],
    });

    const report = await service.getReport({ from: FROM, to: TO });

    expect(report.rows[0]).toEqual(
      expect.objectContaining({
        agentChatCredits: 42.123456,
        agentTurns: 12,
        generationCredits: 1_200,
        grossMarginUsd: 24,
        id: 'org-1',
        label: 'Acme',
        llmProviderCostUsd: 2,
        mediaProviderCostUsd: 3,
        revenueUsd: 29,
      }),
    );
    expect(report.rows[1]).toEqual(
      expect.objectContaining({
        grossMarginPercent: null,
        grossMarginUsd: -0.01,
        id: 'org-2',
        label: 'Globex',
      }),
    );
  });
});
