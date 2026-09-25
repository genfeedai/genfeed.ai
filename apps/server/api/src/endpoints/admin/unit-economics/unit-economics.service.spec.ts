import { UnitEconomicsService } from '@api/endpoints/admin/unit-economics/unit-economics.service';
import {
  buildUnitEconomicsRows,
  EMPTY_UNIT_ECONOMICS_AGGREGATE,
  toUnitEconomicsMetrics,
} from '@api/endpoints/admin/unit-economics/unit-economics-report.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActivitySource } from '@genfeedai/contracts';
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
    const { rows, totals } = buildUnitEconomicsRows([
      {
        aggregate: {
          ...EMPTY_UNIT_ECONOMICS_AGGREGATE,
          llmProviderCostMicros: 1_000_000,
          revenueMinor: 100,
        },
        id: 'small',
        label: 'Small',
        topModels: [],
      },
      {
        aggregate: {
          ...EMPTY_UNIT_ECONOMICS_AGGREGATE,
          llmProviderCostMicros: 10_000_000,
          revenueMinor: 100_000,
        },
        id: 'large',
        label: 'Large',
        topModels: [],
      },
    ]);

    expect(rows.map((row) => row.id)).toEqual(['large', 'small']);
    expect(rows[1]?.grossMarginPercent).toBe(0);
    expect(totals.revenueUsd).toBe(1_001);
    expect(totals.grossMarginUsd).toBe(990);
    expect(totals.grossMarginPercent).toBe(98.9);
  });
});

describe('UnitEconomicsService', () => {
  const FROM = '2026-09-01';
  const TO = '2026-09-30';

  function createService(
    rows: {
      credit?: unknown[];
      llm?: unknown[];
      media?: unknown[];
      revenue?: unknown[];
      top?: unknown[];
    } = {},
  ) {
    const queries: Prisma.Sql[] = [];
    const prisma = {
      $queryRaw: vi.fn(async (query: Prisma.Sql) => {
        queries.push(query);
        const sql = query.sql;
        if (sql.includes('"modelCosts"')) return rows.top ?? [];
        if (sql.includes('billing_revenue_events')) return rows.revenue ?? [];
        if (sql.includes('credit_transactions')) return rows.credit ?? [];
        if (sql.includes('media_vendor_costs')) return rows.media ?? [];
        if (sql.includes('llm_vendor_costs')) return rows.llm ?? [];
        return [];
      }),
      organization: {
        findFirst: vi.fn().mockResolvedValue({ label: 'Acme' }),
        findMany: vi.fn().mockResolvedValue([
          { id: 'org-1', label: 'Acme' },
          { id: 'org-2', label: 'Globex' },
        ]),
      },
      user: {
        findMany: vi.fn().mockResolvedValue([
          {
            email: 'ada@example.com',
            firstName: 'Ada',
            handle: 'ada',
            id: 'user-1',
            lastName: 'Lovelace',
            name: null,
          },
        ]),
      },
    };
    const service = new UnitEconomicsService(
      prisma as unknown as PrismaService,
    );
    return { prisma, queries, service };
  }

  it('bounds every platform-wide query by the period and soft delete', async () => {
    const { queries, service } = createService();

    await service.getReport({ from: FROM, to: TO });

    expect(queries).toHaveLength(5);
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

  it('pins a drill-down to one organization and groups by the acting user', async () => {
    const { prisma, queries, service } = createService({
      llm: [
        {
          agentTurns: BigInt(3),
          key: 'user-1',
          llmProviderCostMicros: BigInt(500_000),
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
    expect(queries.map((query) => query.sql).join('\n')).toContain(
      '"actorUserId"',
    );
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['user-1'] } } }),
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

  it('rejects a drill-down into an unknown organization', async () => {
    const { prisma, service } = createService();
    prisma.organization.findFirst.mockResolvedValue(null);

    await expect(
      service.getReport({ from: FROM, organizationId: 'missing', to: TO }),
    ).rejects.toThrow('not found');
  });

  it('merges revenue, credits by category, provider cost, and top models per organization', async () => {
    const { queries, service } = createService({
      credit: [
        {
          agentChatCredits: 42.123456,
          generationCredits: 1_200,
          key: 'org-1',
        },
      ],
      llm: [
        {
          agentTurns: BigInt(12),
          key: 'org-1',
          llmProviderCostMicros: BigInt(2_000_000),
        },
        {
          agentTurns: BigInt(1),
          key: 'org-2',
          llmProviderCostMicros: BigInt(10_000),
        },
      ],
      media: [{ key: 'org-1', mediaProviderCostMicros: '3000000' }],
      revenue: [{ key: 'org-1', revenueMinor: BigInt(2_900) }],
      top: [
        {
          costMicros: BigInt(1_500_000),
          key: 'org-1',
          model: 'anthropic/claude-sonnet-5',
        },
      ],
    });

    const report = await service.getReport({ from: FROM, to: TO });

    const creditSql = queries.find((query) =>
      query.sql.includes('credit_transactions'),
    );
    expect(creditSql?.values).toContain(ActivitySource.AGENT_CHAT);
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
        topModels: [
          { model: 'anthropic/claude-sonnet-5', providerCostUsd: 1.5 },
        ],
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
    expect(report.totals).toEqual(
      expect.objectContaining({
        agentTurns: 13,
        grossMarginUsd: 23.99,
        revenueUsd: 29,
      }),
    );
  });
});
