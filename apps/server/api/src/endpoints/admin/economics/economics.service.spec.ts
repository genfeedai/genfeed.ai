import { EconomicsService } from '@api/endpoints/admin/economics/economics.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Prisma } from '@genfeedai/prisma';

describe('EconomicsService', () => {
  const FROM = '2026-09-02';
  const TO = '2026-09-03';

  function createService(rows: Record<string, unknown[]> = {}) {
    const queries: Prisma.Sql[] = [];
    const rowsFor = (sql: string): unknown[] => {
      const isOrganizationCount = sql.includes(
        'COUNT(DISTINCT "organizationId")',
      );
      if (isOrganizationCount && sql.includes('billing_revenue_events')) {
        return rows.payingOrganizations ?? [];
      }
      if (isOrganizationCount) return rows.activeOrganizations ?? [];
      if (sql.includes('"flags"')) return rows.flags ?? [];
      if (sql.includes('"models"')) return rows.models ?? [];
      if (sql.includes('"chatCostMicros"')) return rows.llmSplit ?? [];
      if (sql.includes('GROUP BY 1, 2') && sql.includes('"source"')) {
        return rows.revenueByDayAndSource ?? [];
      }
      if (
        sql.includes('"revenueMinor"') &&
        sql.includes('GROUP BY 1\n      ORDER BY 2 DESC, 1 ASC')
      ) {
        return rows.revenueByOrganization ?? [];
      }
      if (sql.includes('"revenueMinor"') && sql.includes('ORDER BY 2 DESC')) {
        return rows.revenueBySource ?? [];
      }
      if (
        sql.includes('ORDER BY "occurredAt" DESC') &&
        sql.includes('"stripeObjectId"')
      ) {
        return rows.latestRevenue ?? [];
      }
      if (
        sql.includes('"firstRecordedAt"') &&
        sql.includes('billing_revenue_events')
      ) {
        return rows.revenueLedger ?? [];
      }
      if (
        sql.includes('"firstRecordedAt"') &&
        sql.includes('llm_vendor_costs')
      ) {
        return rows.llmLedger ?? [];
      }
      if (
        sql.includes('"firstRecordedAt"') &&
        sql.includes('media_vendor_costs')
      ) {
        return rows.mediaLedger ?? [];
      }
      if (sql.includes('"firstRecordedAt"')) return rows.creditLedger ?? [];
      if (sql.includes('UPPER(m."category")'))
        return rows.mediaCategories ?? [];
      if (sql.includes('GROUP BY 1') && sql.includes('"source" AS "source"')) {
        return rows.creditsBySource ?? [];
      }
      if (sql.includes('billing_revenue_events'))
        return rows.revenueByDay ?? [];
      if (sql.includes('credit_transactions')) return rows.creditsByDay ?? [];
      if (sql.includes('media_vendor_costs')) return rows.mediaByDay ?? [];
      if (sql.includes('llm_vendor_costs')) return rows.llmByDay ?? [];
      return [];
    };
    const prisma = {
      $queryRaw: vi.fn(async (query: Prisma.Sql) => {
        queries.push(query);
        return rowsFor(query.sql);
      }),
      organization: {
        findMany: vi.fn().mockResolvedValue([
          { id: 'org-1', label: 'Acme' },
          { id: 'org-2', label: 'Globex' },
        ]),
      },
    };
    const service = new EconomicsService(prisma as unknown as PrismaService);
    return { prisma, queries, service };
  }

  it('bounds every platform-wide query by the day window and soft delete', async () => {
    const { queries, service } = createService();

    await service.getOverview({ from: FROM, to: TO });

    expect(queries).toHaveLength(6);
    for (const query of queries) {
      expect(query.sql).toContain('"isDeleted" = false');
      expect(query.values).toEqual(
        expect.arrayContaining([
          new Date('2026-08-31T00:00:00.000Z'),
          new Date('2026-09-04T00:00:00.000Z'),
        ]),
      );
    }
  });

  it('builds the overview with zero-filled days and a previous period', async () => {
    const { service } = createService({
      activeOrganizations: [
        { isCurrent: true, organizations: 2n },
        { isCurrent: false, organizations: 1n },
      ],
      creditsByDay: [
        { credits: 500, day: '2026-09-03' },
        { credits: 100, day: '2026-09-01' },
      ],
      llmByDay: [
        { calls: 4n, costMicros: 2_000_000n, day: '2026-09-03' },
        { calls: 1n, costMicros: 500_000n, day: '2026-09-01' },
      ],
      mediaByDay: [{ calls: 2n, costMicros: 1_000_000n, day: '2026-09-02' }],
      payingOrganizations: [{ isCurrent: true, organizations: 1n }],
      revenueByDay: [
        { day: '2026-09-02', events: 1n, revenueMinor: 3_000n },
        { day: '2026-08-31', events: 1n, revenueMinor: 1_000n },
      ],
    });

    const report = await service.getOverview({ from: FROM, to: TO });

    expect(report.from).toBe('2026-09-02');
    expect(report.to).toBe('2026-09-03');
    expect(report.previousFrom).toBe('2026-08-31');
    expect(report.previousTo).toBe('2026-09-01');
    expect(report.daily.map((point) => point.date)).toEqual([
      '2026-09-02',
      '2026-09-03',
    ]);
    expect(report.daily[0]).toMatchObject({
      creditValueUsd: 0,
      mediaCostUsd: 1,
      revenueUsd: 30,
    });
    expect(report.daily[1]).toMatchObject({
      creditValueUsd: 5,
      llmCostUsd: 2,
      revenueUsd: 0,
    });
    expect(report.totals).toMatchObject({
      activeOrganizations: 2,
      creditsConsumed: 500,
      grossMarginUsd: 27,
      llmCalls: 4,
      mediaGenerations: 2,
      payingOrganizations: 1,
      providerCostUsd: 3,
      revenueUsd: 30,
    });
    expect(report.previousTotals).toMatchObject({
      activeOrganizations: 1,
      creditsConsumed: 100,
      llmCostUsd: 0.5,
      payingOrganizations: 0,
      revenueUsd: 10,
    });
  });

  it('splits revenue by source and day, and labels organizations', async () => {
    const { service } = createService({
      latestRevenue: [
        {
          amountMinor: 2_900,
          id: 'rev-1',
          occurredAt: new Date('2026-09-03T10:00:00.000Z'),
          organizationId: 'org-1',
          source: 'subscription_invoice',
          stripeObjectId: 'in_1',
        },
      ],
      payingOrganizations: [{ isCurrent: true, organizations: 2n }],
      revenueByDayAndSource: [
        {
          day: '2026-09-02',
          revenueMinor: 2_900n,
          source: 'subscription_invoice',
        },
        { day: '2026-09-03', revenueMinor: 1_000n, source: 'credit_purchase' },
      ],
      revenueByOrganization: [
        { events: 1n, organizationId: 'org-1', revenueMinor: 2_900n },
        { events: 1n, organizationId: 'org-2', revenueMinor: 1_000n },
      ],
      revenueBySource: [
        { events: 1n, revenueMinor: 2_900n, source: 'subscription_invoice' },
        { events: 1n, revenueMinor: 1_000n, source: 'credit_purchase' },
      ],
      revenueLedger: [
        {
          firstRecordedAt: new Date('2026-09-02T09:00:00.000Z'),
          lastRecordedAt: new Date('2026-09-03T10:00:00.000Z'),
          nonUsdEvents: 1n,
          periodRows: 2n,
        },
      ],
    });

    const report = await service.getRevenue({ from: FROM, to: TO });

    expect(report.daily).toEqual([
      { creditPackUsd: 0, date: '2026-09-02', subscriptionUsd: 29 },
      { creditPackUsd: 10, date: '2026-09-03', subscriptionUsd: 0 },
    ]);
    expect(report.totals).toEqual({
      averageRevenuePerEventUsd: 19.5,
      events: 2,
      payingOrganizations: 2,
      revenueUsd: 39,
    });
    expect(report.topOrganizations.map((row) => row.label)).toEqual([
      'Acme',
      'Globex',
    ]);
    expect(report.latestEvents[0]).toMatchObject({
      amountUsd: 29,
      organizationLabel: 'Acme',
      stripeObjectId: 'in_1',
    });
    expect(report.ledgerStartedAt).toBe('2026-09-02T09:00:00.000Z');
    expect(report.nonUsdEvents).toBe(1);
  });

  it('reports cost by model with unpriced and BYOK calls', async () => {
    const { service } = createService({
      flags: [{ byokCalls: 3n, unpricedCalls: 2n }],
      llmByDay: [{ calls: 5n, costMicros: 1_500_000n, day: '2026-09-02' }],
      mediaByDay: [{ calls: 1n, costMicros: 500_000n, day: '2026-09-03' }],
      mediaCategories: [
        { category: 'IMAGE', costMicros: 500_000n, generations: 1n },
      ],
      models: [
        {
          byokCalls: 0n,
          calls: 5n,
          completionTokens: 2_000n,
          costMicros: 1_500_000n,
          kind: 'llm',
          model: 'anthropic/claude-sonnet-5',
          promptTokens: 10_000n,
          provider: 'openrouter',
          unpricedCalls: 0n,
        },
        {
          byokCalls: 0n,
          calls: 1n,
          completionTokens: 0n,
          costMicros: 500_000n,
          kind: 'media',
          model: 'black-forest-labs/flux-schnell',
          promptTokens: 0n,
          provider: 'replicate',
          unpricedCalls: 2n,
        },
      ],
    });

    const report = await service.getCosts({ from: FROM, to: TO });

    expect(report.totals).toEqual({
      byokCalls: 3,
      llmCalls: 5,
      llmCostUsd: 1.5,
      mediaCostUsd: 0.5,
      mediaGenerations: 1,
      providerCostUsd: 2,
      unpricedCalls: 2,
    });
    expect(report.daily).toEqual([
      { date: '2026-09-02', llmCostUsd: 1.5, mediaCostUsd: 0 },
      { date: '2026-09-03', llmCostUsd: 0, mediaCostUsd: 0.5 },
    ]);
    expect(report.models[0]).toMatchObject({
      averageCostUsd: 0.3,
      completionTokens: 2_000,
      costUsd: 1.5,
      kind: 'llm',
      promptTokens: 10_000,
    });
    expect(report.models[1]?.unpricedCalls).toBe(2);
    expect(report.mediaCategories).toEqual([
      { category: 'IMAGE', costUsd: 0.5, generations: 1 },
    ]);
  });

  it('reports ledger freshness and flags operations with credits but no cost', async () => {
    const { service } = createService({
      creditLedger: [
        {
          firstRecordedAt: new Date('2026-08-01T00:00:00.000Z'),
          lastRecordedAt: new Date('2026-09-03T12:00:00.000Z'),
          periodRows: 7n,
        },
      ],
      creditsBySource: [
        { credits: 40, source: 'voice-generate' },
        { credits: 10, source: 'agent-chat' },
      ],
      llmLedger: [
        {
          byokRows: 1n,
          firstRecordedAt: new Date('2026-08-14T00:00:00.000Z'),
          lastRecordedAt: new Date('2026-09-03T11:00:00.000Z'),
          pendingRows: 2n,
          periodRows: 9n,
          unpricedRows: 3n,
        },
      ],
      llmSplit: [{ chatCostMicros: 80_000n, otherCostMicros: 0n }],
    });

    const report = await service.getCoverage({ from: FROM, to: TO });

    expect(report.ledgers.map((ledger) => ledger.key)).toEqual([
      'revenue',
      'llm',
      'media',
      'credits',
    ]);
    expect(report.ledgers[0]).toMatchObject({
      firstRecordedAt: null,
      periodRows: 0,
    });
    expect(report.ledgers[1]).toMatchObject({
      byokRows: 1,
      pendingRows: 2,
      periodRows: 9,
      unpricedRows: 3,
    });
    expect(report.ledgers[3]).toMatchObject({
      lastRecordedAt: '2026-09-03T12:00:00.000Z',
      periodRows: 7,
    });
    expect(
      report.operations.find((operation) => operation.operation === 'voice'),
    ).toMatchObject({ costUsd: 0, creditValueUsd: 0.4, status: 'missing' });
    expect(
      report.operations.find(
        (operation) => operation.operation === 'agent_chat',
      ),
    ).toMatchObject({ costUsd: 0.08, status: 'tracked' });
  });
});
